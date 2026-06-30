const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const log = require('../../util/log');

/**
 * Default Scratch Bridge endpoint. The bridge terminates wss from the browser
 * and forwards each message onto the McRemote plugin over plain TCP, so the
 * same protocol works bridge-relayed or direct.
 * @type {string}
 */
const DEFAULT_BRIDGE_URL = 'wss://bridge.mc-remote.com';

/**
 * Protocol semver advertised in the hello handshake. This is the clean
 * protocol contract version (21.0.0); the b1 package/channel suffix is not
 * carried on the wire (it is irrelevant to compatibility).
 * @type {string}
 */
const PROTOCOL_VERSION = '21.0.0';

/**
 * Wire format: JSON-RPC 2.0 over a wss link to the bridge (protocol 21.0.0,
 * b1). One WebSocket message carries one JSON object.
 *
 *   request       {jsonrpc:"2.0", id, method, params}  -> reply with id
 *   notification  {jsonrpc:"2.0",     method, params}  -> no reply (id omitted)
 *   response      {jsonrpc:"2.0", id, result}
 *                 {jsonrpc:"2.0", id, error:{code, message, data?}}
 *
 * `method` is the dot-namespaced command (TCP command names, direct):
 *
 *   hello           object params (auth + build context)        -> reply
 *   chat.post       ["msg"]                                      -> send-only
 *   world.setBlock  [x, y, z, block]                             -> send-only
 *   world.setBlocks [x1, y1, z1, x2, y2, z2, block]             -> send-only
 *   world.getBlock  [x, y, z]  => canonical block_state_ref      -> reply
 *
 * Coordinates are deltas from the build origin; the block argument is a
 * block_state_ref string passed through verbatim (the plugin completes the
 * namespace and canonicalises the reply). setBlock/setBlocks/chat.post are
 * fire-and-forget notifications; getBlock is always a request so its reply and
 * any JSON-RPC error are delivered synchronously.
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
         * Pending requests awaiting a reply, keyed by JSON-RPC id.
         * @type {Map<number, {resolve: Function, reject: Function}>}
         * @private
         */
        this._pending = new Map();

        /**
         * Monotonic JSON-RPC request id, reset per connection.
         * @type {number}
         * @private
         */
        this._nextRequestId = 1;
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
                    text: formatMessage({
                        id: 'mcremote.connectTo',
                        default: 'connect to [NAME]',
                        description: 'Connect to a named sandbox'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: 'sandbox'
                        }
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
            ]
        };
    }

    /**
     * Open the wss connection to the bridge and perform the hello handshake.
     * @param {string} [sandbox] - optional named sandbox to target.
     * @returns {Promise} resolves once the handshake completes.
     * @private
     */
    _open (sandbox) {
        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
            return this._hello(sandbox);
        }
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(DEFAULT_BRIDGE_URL);
            this._socket = socket;
            socket.addEventListener('open', () => {
                this._hello(sandbox).then(resolve, reject);
            });
            socket.addEventListener('message', event => this._onMessage(event));
            socket.addEventListener('error', () => {
                log.error('McRemote: bridge connection error');
                reject(new Error('bridge connection error'));
            });
            socket.addEventListener('close', () => {
                this._socket = null;
                this._rejectPending(new Error('bridge connection closed'));
            });
        });
    }

    /**
     * Send the hello handshake. b1 is unauthenticated, so the build context
     * falls back to the server defaults (overworld, origin 200,0,200) and the
     * hello reply carries catalogHash:null; auth is layered in later betas.
     * @param {string} [sandbox] - optional named sandbox to target.
     * @returns {Promise} resolves when the handshake is acknowledged.
     * @private
     */
    _hello (sandbox) {
        const params = {
            protocol: PROTOCOL_VERSION,
            client: {
                name: 'scratch-mcremote',
                locale: formatMessage.setup().locale
            }
        };
        if (sandbox) params.sandbox = sandbox;
        return this._request('hello', params);
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
        if (!pending) return;
        this._pending.delete(msg.id);
        if (msg.error) {
            const error = new Error(msg.error.message || 'McRemote error');
            error.code = msg.error.code;
            error.data = msg.error.data;
            if (msg.error.data) error.reason = msg.error.data.reason;
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
        const id = this._nextRequestId++;
        return new Promise((resolve, reject) => {
            this._pending.set(id, {resolve, reject});
            this._socket.send(JSON.stringify({jsonrpc: '2.0', id, method, params}));
        });
    }

    /**
     * Send a JSON-RPC notification (fire-and-forget, no reply expected).
     * @param {string} method - the dot-namespaced command name.
     * @param {Array} params - positional arguments.
     * @private
     */
    _send (method, params) {
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
            log.warn(`McRemote: ${method} dropped, not connected to bridge`);
            return;
        }
        this._socket.send(JSON.stringify({jsonrpc: '2.0', method, params}));
    }

    connect () {
        return this._open();
    }

    connectTo (args) {
        return this._open(Cast.toString(args.NAME));
    }

    postToChat (args) {
        this._send('chat.post', [Cast.toString(args.MSG)]);
    }

    setBlock (args) {
        this._send('world.setBlock', [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z),
            Cast.toString(args.BLOCK)
        ]);
    }

    setBlocks (args) {
        this._send('world.setBlocks', [
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
