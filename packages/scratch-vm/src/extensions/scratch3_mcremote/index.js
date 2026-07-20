const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const log = require('../../util/log');
const Runtime = require('../../engine/runtime');

/**
 * Default Scratch Bridge endpoint. The bridge terminates wss from the browser
 * and forwards each message onto the McRemote plugin over plain TCP, so the
 * same protocol works bridge-relayed or direct.
 * @type {string}
 */
const DEFAULT_BRIDGE_URL = 'wss://bridge.mc-remote.com';

/**
 * Protocol semver advertised in the hello handshake. This is the clean
 * protocol contract version (21.0.0); the package/channel suffix is not
 * carried on the wire (it is irrelevant to compatibility).
 * @type {string}
 */
const PROTOCOL_VERSION = '21.0.0';

/**
 * Scratch McRemote client build label for diagnostics. Compatibility is still
 * negotiated exclusively by PROTOCOL_VERSION.
 * @type {string}
 */
const CLIENT_VERSION = '2100.0.0b2';

const DEFAULT_SANDBOX_ROUTE = 'sb.mc-remote.com';
const SESSION_TOKEN_STORAGE_KEY_PREFIX = 'mcremote.sessionToken.v1:';
const PAIR_POLL_INTERVAL_MS = 1000;
const FRAME_LOG_LIMIT = 100;
const DEFAULT_STREAM_ID = 'default';
const REDACTED = '[redacted]';

const ConnectionStatus = {
    DISCONNECTED: 'disconnected',
    PAIRING: 'pairing',
    CONNECTED: 'connected',
    CLOSED: 'closed',
    ERROR: 'error'
};

const AUTH_REASONS = [
    'auth_required',
    'token_expired',
    'token_revoked',
    'token_not_found',
    'token_invalid'
];

const BuildWorld = {
    OVERWORLD: 'overworld',
    NETHER: 'nether',
    THE_END: 'the_end'
};

/**
 * Wire format: JSON-RPC 2.0 over a wss link to the bridge (protocol 21.0.0).
 * One WebSocket message carries one JSON object.
 *
 *   request       {jsonrpc:"2.0", id, method, params}  -> reply with id
 *   notification  {jsonrpc:"2.0",     method, params}  -> no reply (id omitted)
 *   response      {jsonrpc:"2.0", id, result}
 *                 {jsonrpc:"2.0", id, error:{code, message, data?}}
 *
 * `method` is the dot-namespaced command (TCP command names, direct):
 *
 *   hello           object params (auth + build context)        -> reply
 *   build.setWorld  [dimension]                                  -> reply
 *   build.setOrigin [x, y, z]                                    -> reply
 *   chat.post       ["msg"]                                      -> reply
 *   world.setBlock  [x, y, z, block]                             -> reply
 *   world.setBlocks [x1, y1, z1, x2, y2, z2, block]             -> reply
 *   world.getBlock  [x, y, z]  => canonical block_state_ref      -> reply
 *   auth.pairBegin  object params                                 -> reply
 *   auth.pairPoll   object params                                 -> reply
 *
 * Coordinates are deltas from the build origin; the block argument is a
 * block_state_ref string passed through verbatim (the plugin completes the
 * namespace and canonicalises the reply). Scratch keeps build-origin y sealed
 * and sends 0 for `build.setOrigin` y. Command blocks use id-bearing requests
 * so success/error can be observed during release-gate testing.
 */

/**
 * Class for the McRemote (Minecraft remote control) blocks.
 * @param {Runtime} runtime - the runtime instantiating this block package.
 * @class
 */
class Scratch3McRemoteBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * The open WebSocket to the bridge, or null when not connected.
         * @type {?WebSocket}
         */
        this._socket = null;

        /**
         * Connection promise while the WebSocket and hello handshake are in flight.
         * @type {?Promise}
         * @private
         */
        this._openPromise = null;

        /**
         * Pending requests awaiting a reply, keyed by JSON-RPC id.
         * @type {Map<number, {resolve: function(unknown): void, reject: function(Error): void, method: string}>}
         * @private
         */
        this._pending = new Map();

        /**
         * Current pairing code, formatted for humans as NNN-NNN.
         * @type {string}
         * @private
         */
        this._pairCode = '';

        /**
         * Current pairing command, ready to paste into Minecraft chat.
         * @type {string}
         * @private
         */
        this._pairCommand = '';

        /**
         * Monotonic JSON-RPC request id, reset per connection.
         * @type {number}
         * @private
         */
        this._nextRequestId = 1;

        /**
         * Poll interval for auth.pairPoll. Tests may reduce this.
         * @type {number}
         * @private
         */
        this._pairPollIntervalMs = PAIR_POLL_INTERVAL_MS;

        /**
         * Current bridge connection status for the McRemote observer surface.
         * @type {string}
         * @private
         */
        this._connectionStatus = ConnectionStatus.DISCONNECTED;

        /**
         * b2 uses a single stream. The field is part of the observation model
         * so later per-target streams do not need a frame-log shape change.
         * @type {string}
         * @private
         */
        this._streamId = DEFAULT_STREAM_ID;

        /**
         * Last successful hello response summary.
         * @type {?object}
         * @private
         */
        this._helloInfo = null;

        /**
         * Last connection/auth error summary.
         * @type {?object}
         * @private
         */
        this._lastError = null;

        /**
         * Recent client send/receive frames for WireScope v0.
         * @type {Array<object>}
         * @private
         */
        this._frameLog = [];

        /**
         * Monotonic frame id for stable UI ordering.
         * @type {number}
         * @private
         */
        this._frameSequence = 0;

        /**
         * Sandbox route snapshot for the active connection.
         * @type {?{sandboxRoute: string, label: string}}
         * @private
         */
        this._connectionTarget = null;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'mcremote',
            name: formatMessage({
                id: 'mcremote.categoryName',
                default: 'McRemote',
                description: 'Label for the McRemote extension category'
            }),
            blocks: [
                {
                    opcode: 'connect',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.connect',
                        default: 'connect',
                        description: 'Connect to the default sandbox'
                    })
                },
                {
                    opcode: 'connectTo',
                    blockType: BlockType.COMMAND,
                    hideFromPalette: true,
                    text: formatMessage({
                        id: 'mcremote.connectTo',
                        default: 'connect to [NAME]',
                        description: 'Connect to a named sandbox'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: this._runtimeConfig().defaultSandbox
                        }
                    }
                },
                {
                    opcode: 'pairCode',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.pairCode',
                        default: 'pair code',
                        description: 'The current McRemote pairing code'
                    })
                },
                {
                    opcode: 'pairCommand',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.pairCommand',
                        default: 'pair command',
                        description: 'The Minecraft command for the current McRemote pairing code'
                    })
                },
                {
                    opcode: 'whenPaired',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    text: formatMessage({
                        id: 'mcremote.whenPaired',
                        default: 'when pairing completes',
                        description: 'Run when Scratch finishes pairing with Minecraft'
                    })
                },
                '---',
                {
                    opcode: 'setWorld',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setWorld',
                        default: 'set build world to [WORLD]',
                        description: 'Set the Minecraft dimension used by build commands'
                    }),
                    arguments: {
                        WORLD: {
                            type: ArgumentType.STRING,
                            menu: 'worlds',
                            defaultValue: BuildWorld.OVERWORLD
                        }
                    }
                },
                {
                    opcode: 'setBuildOrigin',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setBuildOrigin',
                        default: 'set build origin (X, Y, Z) to [X], 0, [Z]',
                        description: 'Set the x and z coordinates of the build origin, with y fixed at 0'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 200},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 200}
                    }
                },
                '---',
                {
                    opcode: 'postToChat',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.postToChat',
                        default: 'say [MSG] in chat',
                        description: 'Post a message to the Minecraft chat'
                    }),
                    arguments: {
                        MSG: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Hello, Minecraft!'
                        }
                    }
                },
                {
                    opcode: 'setBlock',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setBlock',
                        default: 'set block at x:[X] y:[Y] z:[Z] to [BLOCK]',
                        description: 'Set a single block'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0},
                        BLOCK: {type: ArgumentType.STRING, defaultValue: 'stone'}
                    }
                },
                {
                    opcode: 'setBlocks',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setBlocks',
                        default: 'set blocks from x:[X1] y:[Y1] z:[Z1] to x:[X2] y:[Y2] z:[Z2] as [BLOCK]',
                        description: 'Fill a cuboid of blocks'
                    }),
                    arguments: {
                        X1: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y1: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z1: {type: ArgumentType.NUMBER, defaultValue: 0},
                        X2: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y2: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z2: {type: ArgumentType.NUMBER, defaultValue: 0},
                        BLOCK: {type: ArgumentType.STRING, defaultValue: 'stone'}
                    }
                },
                {
                    opcode: 'getBlock',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.getBlock',
                        default: 'block at x:[X] y:[Y] z:[Z]',
                        description: 'Get the block id at a position'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                }
            ],
            menus: {
                worlds: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'mcremote.world.overworld',
                                default: 'overworld',
                                description: 'Menu label for the Minecraft overworld dimension'
                            }),
                            value: BuildWorld.OVERWORLD
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.world.nether',
                                default: 'nether',
                                description: 'Menu label for the Minecraft nether dimension'
                            }),
                            value: BuildWorld.NETHER
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.world.theEnd',
                                default: 'the End',
                                description: 'Menu label for the Minecraft the_end dimension'
                            }),
                            value: BuildWorld.THE_END
                        }
                    ]
                }
            }
        };
    }

    /**
     * Build the bridge URL for this connection. Sandbox routing is WSS
     * connection metadata, not part of the JSON-RPC hello payload.
     * @param {string} [sandbox] - optional named sandbox to target.
     * @returns {string} bridge URL.
     * @private
     */
    _bridgeUrl (sandbox) {
        const bridgeUrl = this._runtimeConfig().bridgeUrl;
        if (!sandbox) return bridgeUrl;
        const url = new URL(bridgeUrl);
        url.searchParams.set('sandbox', sandbox);
        return url.toString();
    }

    /**
     * @returns {{bridgeUrl: string, defaultSandbox: string, connectionEnabled: boolean, releaseIdentity: string}}
     * deployment settings with defaults for standalone VM consumers.
     * @private
     */
    _runtimeConfig () {
        if (this.runtime && typeof this.runtime.getMcRemoteRuntimeConfig === 'function') {
            return this.runtime.getMcRemoteRuntimeConfig();
        }
        return {
            bridgeUrl: DEFAULT_BRIDGE_URL,
            defaultSandbox: DEFAULT_SANDBOX_ROUTE,
            connectionEnabled: true,
            releaseIdentity: CLIENT_VERSION
        };
    }

    /**
     * @param {string} [sandbox] - optional sandbox override from the debug block.
     * @returns {{sandboxRoute: string, label: string}} connection target metadata.
     * @private
     */
    _resolveConnectionTarget (sandbox) {
        const sandboxRoute = typeof sandbox === 'undefined' || sandbox === null ?
            '' :
            Cast.toString(sandbox).trim();
        if (sandboxRoute) return {sandboxRoute, label: ''};

        if (this.runtime && typeof this.runtime.getMcRemoteConnectionTarget === 'function') {
            const target = this.runtime.getMcRemoteConnectionTarget();
            const currentRoute = target && Cast.toString(target.sandboxRoute).trim();
            if (currentRoute) {
                return {
                    sandboxRoute: currentRoute,
                    label: target.label ? Cast.toString(target.label) : ''
                };
            }
        }

        return {sandboxRoute: this._runtimeConfig().defaultSandbox, label: ''};
    }

    /**
     * @returns {{sandboxRoute: string, label: string}} active or configured connection target.
     * @private
     */
    _currentConnectionTarget () {
        return this._connectionTarget || this._resolveConnectionTarget();
    }

    /**
     * Reset stream-local observer data before starting a new connection.
     * @private
     */
    _resetObservationForConnection () {
        this._connectionStatus = ConnectionStatus.DISCONNECTED;
        this._streamId = DEFAULT_STREAM_ID;
        this._helloInfo = null;
        this._lastError = null;
        this._frameLog = [];
        this._frameSequence = 0;
        this._nextRequestId = 1;
        this._pairCode = '';
        this._pairCommand = '';
        this._emitObservation();
    }

    /**
     * @returns {object} current McRemote observer snapshot.
     * @private
     */
    _observationSnapshot () {
        return {
            status: this._connectionStatus,
            streamId: this._streamId,
            connectionTarget: Object.assign({}, this._currentConnectionTarget()),
            pairCode: this._pairCode,
            pairCommand: this._pairCommand,
            hello: this._sanitizeWireValue(this._helloInfo),
            lastError: this._sanitizeWireValue(this._lastError),
            frameLog: this._frameLog.map(frame => this._sanitizeWireValue(frame))
        };
    }

    /**
     * Emit the full observer snapshot so UI reducers do not need to merge
     * partial McRemote updates.
     * @private
     */
    _emitObservation () {
        if (this.runtime && typeof this.runtime.emit === 'function') {
            this.runtime.emit(Runtime.MCREMOTE_OBSERVATION_UPDATE, this._observationSnapshot());
        }
    }

    /**
     * @param {string} status - connection status value.
     * @param {Error} [error] - optional error to expose with the status.
     * @private
     */
    _setConnectionStatus (status, error) {
        this._connectionStatus = status;
        if (error) {
            this._lastError = this._errorInfo(error);
        } else if (
            status === ConnectionStatus.DISCONNECTED ||
            status === ConnectionStatus.CONNECTED
        ) {
            this._lastError = null;
        }
        this._emitObservation();
    }

    /**
     * Store the hello fields surfaced by WireScope v0.
     * @param {object} result - hello response payload.
     * @private
     */
    _recordHelloInfo (result) {
        const worldConstants = result && typeof result === 'object' && result.world_constants ?
            result.world_constants :
            result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'y_sea') ?
                {y_sea: result.y_sea} :
                null;
        this._helloInfo = result && typeof result === 'object' ? {
            protocol: result.protocol || '',
            mc_version: result.mc_version || '',
            supported_mc_versions: Array.isArray(result.supported_mc_versions) ?
                result.supported_mc_versions.slice() :
                [],
            world_constants: worldConstants,
            permissions: result.permissions || null
        } : null;
    }

    /**
     * @param {string} direction - send or receive.
     * @param {object} message - JSON-RPC frame.
     * @param {string} [method] - method inferred from a pending response.
     * @private
     */
    _appendFrame (direction, message, method) {
        this._frameLog.push({
            sequence: ++this._frameSequence,
            timestamp: Date.now(),
            streamId: this._streamId,
            direction,
            id: message && message.id,
            method: method || (message && message.method) || '',
            payload: this._sanitizeWireValue(message)
        });
        if (this._frameLog.length > FRAME_LOG_LIMIT) {
            this._frameLog.splice(0, this._frameLog.length - FRAME_LOG_LIMIT);
        }
        this._emitObservation();
    }

    /**
     * @param {unknown} value - value copied into observer output.
     * @returns {unknown} a JSON-safe clone with bearer tokens redacted.
     * @private
     */
    _sanitizeWireValue (value) {
        if (Array.isArray(value)) {
            return value.map(item => this._sanitizeWireValue(item));
        }
        if (value && typeof value === 'object') {
            const clean = {};
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    clean[key] = this._isSensitiveKey(key) ? REDACTED : this._sanitizeWireValue(value[key]);
                }
            }
            return clean;
        }
        return value;
    }

    /**
     * @param {string} key - object key.
     * @returns {boolean} true when the value should not be exposed in logs.
     * @private
     */
    _isSensitiveKey (key) {
        const lower = String(key).toLowerCase();
        return lower === 'token' ||
            lower === 'session_token' ||
            lower === 'access_token' ||
            lower === 'refresh_token';
    }

    /**
     * @param {Error} error - source error.
     * @returns {object} observer-safe error summary.
     * @private
     */
    _errorInfo (error) {
        return {
            message: error && error.message ? error.message : 'McRemote error',
            code: error && error.code,
            reason: error && error.reason
        };
    }

    /**
     * Open the wss connection to the bridge and perform the hello handshake.
     * @param {string} [sandbox] - optional named sandbox to target.
     * @returns {Promise} resolves once the handshake completes.
     * @private
     */
    _open (sandbox) {
        if (!this._runtimeConfig().connectionEnabled) {
            const error = new Error('McRemote connection is disabled by this deployment profile');
            this._setConnectionStatus(ConnectionStatus.ERROR, error);
            return Promise.reject(error);
        }
        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        if (this._openPromise) {
            return this._openPromise;
        }
        this._connectionTarget = this._resolveConnectionTarget(sandbox);
        this._resetObservationForConnection();
        this._openPromise = new Promise((resolve, reject) => {
            const socket = new WebSocket(this._bridgeUrl(this._connectionTarget.sandboxRoute));
            this._socket = socket;
            socket.addEventListener('open', () => {
                this._authenticate().then(() => resolve(), reject);
            });
            socket.addEventListener('message', event => this._onMessage(event));
            socket.addEventListener('error', () => {
                const error = new Error('bridge connection error');
                log.error('McRemote: bridge connection error');
                this._setConnectionStatus(ConnectionStatus.ERROR, error);
                reject(error);
            });
            socket.addEventListener('close', event => {
                const error = new Error('bridge connection closed');
                error.code = event && event.code;
                error.reason = event && event.reason;
                this._socket = null;
                this._setConnectionStatus(ConnectionStatus.CLOSED, error);
                this._rejectPending(error);
                reject(error);
            });
        });
        this._openPromise.then(
            () => {
                this._openPromise = null;
            },
            () => {
                this._openPromise = null;
            }
        );
        return this._openPromise;
    }

    /**
     * Send the hello handshake. The build context falls back to the server
     * defaults (overworld, origin 200,0,200) and auth is added through
     * auth:{token} when a token is available.
     * @returns {Promise} resolves when the handshake is acknowledged.
     * @private
     */
    _hello () {
        const params = {
            protocol: PROTOCOL_VERSION,
            client: this._clientInfo()
        };
        const token = this._readSessionToken();
        if (token) params.auth = {token};
        return this._request('hello', params).then(result => {
            this._assertCompatibleProtocol(result && result.protocol);
            this._recordHelloInfo(result);
            this._setConnectionStatus(ConnectionStatus.CONNECTED);
            return result;
        });
    }

    /**
     * @param {string} serverProtocol - protocol advertised by the server.
     * @param {string} [clientProtocol] - client protocol, overridden by tests.
     * @returns {boolean} whether the server can satisfy this client.
     * @private
     */
    _isProtocolCompatible (serverProtocol, clientProtocol = PROTOCOL_VERSION) {
        const parse = version => {
            const match = typeof version === 'string' && /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
            return match ? match.slice(1).map(Number) : null;
        };
        const server = parse(serverProtocol);
        const client = parse(clientProtocol);
        return Boolean(server && client && server[0] === client[0] && server[1] >= client[1]);
    }

    /**
     * Reject a successful hello response that advertises an incompatible wire protocol.
     * @param {string} serverProtocol - protocol advertised by the server.
     * @private
     */
    _assertCompatibleProtocol (serverProtocol) {
        if (this._isProtocolCompatible(serverProtocol)) return;
        const error = new Error(
            `McRemote protocol mismatch: client ${PROTOCOL_VERSION}, server ${serverProtocol || 'missing'}`
        );
        error.reason = 'protocol_mismatch';
        error.data = {
            reason: error.reason,
            client_protocol: PROTOCOL_VERSION,
            server_protocol: serverProtocol || null
        };
        throw error;
    }

    /**
     * @returns {object} client metadata shared by hello and pairBegin.
     * @private
     */
    _clientInfo () {
        return {
            name: 'scratch-mcremote',
            version: this._runtimeConfig().releaseIdentity,
            locale: formatMessage.setup().locale
        };
    }

    /**
     * Run hello first. If the server requires auth or rejects the stored token,
     * obtain a fresh session token through auth.pairBegin/auth.pairPoll and
     * retry hello with the saved token.
     * @returns {Promise} resolves after an authenticated or auth-optional hello.
     * @private
     */
    _authenticate () {
        return this._hello().then(() => {}, error => {
            if (!this._isAuthError(error)) {
                this._setConnectionStatus(ConnectionStatus.ERROR, error);
                return Promise.reject(error);
            }
            this._clearSessionToken();
            this._setConnectionStatus(ConnectionStatus.PAIRING, error);
            return this._pair().then(() => this._hello());
        });
    }

    /**
     * Start and complete the polling pair flow.
     * @returns {Promise} resolves once the token has been saved.
     * @private
     */
    _pair () {
        return this._request('auth.pairBegin', {
            token_type: 'session',
            client: this._clientInfo()
        }).then(result => {
            const pairingId = result && result.pairing_id;
            const expiresIn = Number(result && result.expires_in) || 120;
            this._setPairCode(result && result.pair_code);
            return this._pollPair(pairingId, Date.now() + (expiresIn * 1000));
        });
    }

    /**
     * Poll until the pairing completes or expires.
     * @param {string} pairingId - Wire correlation id from auth.pairBegin.
     * @param {number} expiresAt - Unix time in ms when polling should stop.
     * @returns {Promise} resolves once the token has been saved.
     * @private
     */
    _pollPair (pairingId, expiresAt) {
        return this._request('auth.pairPoll', {pairing_id: pairingId}).then(result => {
            if (result && result.status === 'ok' && result.token) {
                this._saveSessionToken(result.token);
                this._setPairCode('');
                this._firePairingComplete();
                return;
            }
            if (Date.now() >= expiresAt) {
                return Promise.reject(new Error('pair_expired'));
            }
            return this._delay(this._pairPollIntervalMs).then(() => this._pollPair(pairingId, expiresAt));
        });
    }

    /**
     * @param {number} ms - Milliseconds to wait.
     * @returns {Promise} resolves after the delay.
     * @private
     */
    _delay (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * @param {string} pairCode - Six digit wire pair code.
     * @private
     */
    _setPairCode (pairCode) {
        const raw = Cast.toString(pairCode).replace(/\D/g, '');
        this._pairCode = raw.length === 6 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
        this._pairCommand = this._pairCode ? `/mcremote pair ${this._pairCode}` : '';
        this._emitObservation();
    }

    /**
     * Start pairing-complete hats after the token is stored.
     * @private
     */
    _firePairingComplete () {
        if (this.runtime && typeof this.runtime.startHats === 'function') {
            this.runtime.startHats('mcremote_whenPaired');
        }
    }

    /**
     * @param {Error} error - JSON-RPC error.
     * @returns {boolean} true when the reason requires token discard.
     * @private
     */
    _isAuthError (error) {
        return error && AUTH_REASONS.indexOf(error.reason) !== -1;
    }

    /**
     * @param {string} method - JSON-RPC method.
     * @returns {boolean} true when the request is part of session setup.
     * @private
     */
    _isSessionSetupMethod (method) {
        return method === 'hello' || method.indexOf('auth.') === 0;
    }

    /**
     * @returns {?Storage} localStorage-like object when available.
     * @private
     */
    _storage () {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    }

    /**
     * @returns {string} saved session token, or empty string.
     * @private
     */
    _readSessionToken () {
        const storage = this._storage();
        if (!storage) return '';
        try {
            return storage.getItem(this._sessionTokenStorageKey()) || '';
        } catch {
            return '';
        }
    }

    /**
     * @param {string} token - Session token returned by auth.pairPoll.
     * @private
     */
    _saveSessionToken (token) {
        const storage = this._storage();
        if (!storage) return;
        try {
            storage.setItem(this._sessionTokenStorageKey(), token);
        } catch {
            // localStorage can be unavailable in private browsing or tests.
        }
    }

    /**
     * @private
     */
    _clearSessionToken () {
        const storage = this._storage();
        if (!storage) return;
        try {
            storage.removeItem(this._sessionTokenStorageKey());
        } catch {
            // localStorage can be unavailable in private browsing or tests.
        }
    }

    /**
     * @returns {string} route-scoped session token storage key.
     * @private
     */
    _sessionTokenStorageKey () {
        const sandboxRoute = this._currentConnectionTarget().sandboxRoute;
        return `${SESSION_TOKEN_STORAGE_KEY_PREFIX}${encodeURIComponent(sandboxRoute)}`;
    }

    /**
     * Reject and clear every pending request, e.g. when the socket closes so
     * that in-flight getBlock calls fail fast instead of hanging forever.
     * @param {Error} error - the rejection reason.
     * @private
     */
    _rejectPending (error) {
        for (const pending of this._pending.values()) {
            pending.reject(error);
        }
        this._pending.clear();
    }

    /**
     * Handle an inbound JSON-RPC message from the bridge, correlating replies
     * by id. Non-JSON messages and replies for unknown ids are dropped.
     * @param {MessageEvent} event - the socket message event.
     * @private
     */
    _onMessage (event) {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            log.warn(`McRemote: dropping non-JSON bridge message: ${event.data}`);
            return;
        }
        const pending = this._pending.get(msg.id);
        this._appendFrame('receive', msg, pending && pending.method);
        if (!pending) return;
        this._pending.delete(msg.id);
        if (msg.error) {
            const error = new Error(msg.error.message || 'McRemote error');
            error.code = msg.error.code;
            error.data = msg.error.data;
            if (msg.error.data) error.reason = msg.error.data.reason;
            if (this._isAuthError(error)) this._clearSessionToken();
            if (pending.method === 'hello' && !this._isAuthError(error)) {
                this._setConnectionStatus(ConnectionStatus.ERROR, error);
            }
            pending.reject(error);
        } else {
            pending.resolve(msg.result);
        }
    }

    /**
     * Send a JSON-RPC request and await its reply.
     * @param {string} method - the dot-namespaced command name.
     * @param {Array|object} params - positional args (object for hello).
     * @returns {Promise} resolves with the reply result.
     * @private
     */
    _request (method, params) {
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('not connected to bridge'));
        }
        if (!this._isSessionSetupMethod(method) && this._connectionStatus !== ConnectionStatus.CONNECTED) {
            return Promise.reject(new Error('not connected to McRemote server'));
        }
        const id = this._nextRequestId++;
        return new Promise((resolve, reject) => {
            const message = {jsonrpc: '2.0', id, method, params};
            this._pending.set(id, {resolve, reject, method});
            this._appendFrame('send', message);
            this._socket.send(JSON.stringify(message));
        });
    }

    _commandRequest (method, params) {
        return this._request(method, params).then(() => {}, error => {
            log.warn(`McRemote: ${method} failed: ${error.reason || error.message}`);
        });
    }

    connect () {
        return this._open();
    }

    connectTo (args) {
        return this._open(Cast.toString(args.NAME));
    }

    pairCode () {
        return this._pairCode;
    }

    pairCommand () {
        return this._pairCommand;
    }

    whenPaired () {
        return true;
    }

    setWorld (args) {
        return this._commandRequest('build.setWorld', [
            Cast.toString(args.WORLD)
        ]);
    }

    setBuildOrigin (args) {
        return this._commandRequest('build.setOrigin', [
            Cast.toNumber(args.X),
            0,
            Cast.toNumber(args.Z)
        ]);
    }

    postToChat (args) {
        return this._commandRequest('chat.post', [Cast.toString(args.MSG)]);
    }

    setBlock (args) {
        return this._commandRequest('world.setBlock', [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z),
            Cast.toString(args.BLOCK)
        ]);
    }

    setBlocks (args) {
        return this._commandRequest('world.setBlocks', [
            Cast.toNumber(args.X1),
            Cast.toNumber(args.Y1),
            Cast.toNumber(args.Z1),
            Cast.toNumber(args.X2),
            Cast.toNumber(args.Y2),
            Cast.toNumber(args.Z2),
            Cast.toString(args.BLOCK)
        ]);
    }

    getBlock (args) {
        return this._request('world.getBlock', [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z)
        ]).then(result => (typeof result === 'undefined' ? '' : result),
            () => '');
    }
}

module.exports = Scratch3McRemoteBlocks;
