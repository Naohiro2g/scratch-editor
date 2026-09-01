const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const log = require('../../util/log');
const Runtime = require('../../engine/runtime');
const CLIENT_VERSION = require('./client-version');
const {createDisplayAlias} = require('./display-alias');
const {buildContext, dimensionKey, dimensionRef, sameBuildContext} = require('./dimension');
const {
    CatalogSource,
    CatalogStatus,
    IndexedDBCatalogCache,
    validateCatalogResult
} = require('./catalog');
const {
    blockInfoHasStateProperty,
    blockInfoId,
    blockInfoState,
    blockInfoStateProperty,
    formatBlockInfoText,
    isErrorText,
    makeErrorText,
    parseStateText,
    remoteErrorText
} = require('./block-value');
const {
    eventStatusValue: readEventStatusValue,
    eventValue: readEventValue,
    initialEventStatus,
    validateEventPollResult
} = require('./event');
const {
    DECORATIONS: SIGN_DECORATIONS,
    FACES: SIGN_FACES,
    formatSignInfoText,
    signIsWaxed,
    signLineColor,
    signLineHasDecoration,
    signLineText
} = require('./sign');

const SIGN_LINE_INDICES = [0, 1, 2, 3];
const DIRECTION_AXES = ['x', 'y', 'z'];

/**
 * Default Scratch Bridge endpoint. The bridge terminates wss from the browser
 * and forwards each message onto the McRemote plugin over plain TCP, so the
 * same protocol works bridge-relayed or direct.
 * @type {string}
 */
const DEFAULT_BRIDGE_URL = 'wss://bridge.mc-remote.com';

/**
 * Protocol semver advertised in the hello handshake. This is the clean
 * protocol contract version (23.1.0); the package/channel suffix is not
 * carried on the wire (it is irrelevant to compatibility).
 * @type {string}
 */
const PROTOCOL_VERSION = '23.1.0';

const DEFAULT_SANDBOX_ROUTE = 'sb.mc-remote.com';
const SESSION_TOKEN_STORAGE_KEY_PREFIX = 'mcremote.sessionToken.v1:';
const PAIR_POLL_INTERVAL_MS = 1000;
const BRIDGE_TRANSPORT_PROBE_PROTOCOL = 'mcremote.bridge.probe.v1';
const BRIDGE_TRANSPORT_PROTOCOL = 'mcremote.bridge.one-shot.v1';
const ONE_SHOT_HINT_KEY = 'mcremote_bridge_transport';
const ONE_SHOT_HINT = 'one-shot-v1';
const ONE_SHOT_METHODS = new Set(['auth.pairBegin', 'auth.pairPoll']);
const DEFAULT_TRACE_DELAY_SECONDS = 0.25;
const MAX_TRACE_DELAY_SECONDS = 2;
const OUTBOUND_QUEUE_LIMIT = 256;
const OUTBOUND_BUFFER_LIMIT_BYTES = 1024 * 1024;
const OUTBOUND_BACKPRESSURE_POLL_MS = 4;
const OUTBOUND_BACKPRESSURE_TIMEOUT_MS = 5000;
const EVENT_POLL_IDLE_INTERVAL_MS = 250;

/**
 * Minimum time between live `player.getPos` requests made on behalf of a
 * checked stage monitor. A monitor's reporter is re-evaluated every runtime
 * step (about 30 times per second); without a floor here, checking a player
 * position monitor would flood the bridge with that many requests per
 * second. Explicit script calls (util.thread.updateMonitor is false) are
 * never throttled.
 * @type {number}
 */
const PLAYER_POS_MONITOR_THROTTLE_MS = 1000;
const PLAYER_POSE_MONITOR_THROTTLE_MS = 1000;
const BLOCK_INFO_MONITOR_THROTTLE_MS = 1000;
const HEIGHT_MONITOR_THROTTLE_MS = 1000;
const FRAME_LOG_LIMIT = 100;
const DEFAULT_STREAM_ID = 'default';
const REDACTED = '[redacted]';
const BLOCK_PICKER_ICON = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E' +
    '%3Cpath fill="%23fff" d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h3v3h-3v-3z' +
    'm5 0h2v7h-2v-7zm-5 5h3v2h-3v-2z"/%3E%3C/svg%3E';

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

const BuildDimension = {
    OVERWORLD: 'overworld',
    NETHER: 'the_nether',
    THE_END: 'the_end'
};

const BuildMode = {
    DEBUG: 'DEBUG',
    TRACE: 'TRACE',
    FAST: 'FAST'
};

const EVENT_HAT_OPCODES = {
    pickaxe_poke: 'mcremote_whenPickaxePoke',
    chat_posted: 'mcremote_whenChatPosted',
    projectile_hit: 'mcremote_whenProjectileHit'
};

const playerResult = (value, includeOrientation) => {
    const fields = includeOrientation ? ['dimension', 'pos', 'yaw', 'pitch'] : ['dimension', 'pos'];
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== fields.length ||
        fields.some(field => !Object.prototype.hasOwnProperty.call(value, field)) ||
        !Array.isArray(value.pos) || value.pos.length !== 3 ||
        value.pos.some(item => typeof item !== 'number' || !Number.isFinite(item)) ||
        (includeOrientation &&
            (typeof value.yaw !== 'number' || !Number.isFinite(value.yaw) ||
                typeof value.pitch !== 'number' || !Number.isFinite(value.pitch)))) {
        const error = new Error('Invalid player result');
        error.reason = 'invalid_response';
        throw error;
    }
    const result = {
        dimension: dimensionKey(value.dimension, 'player result dimension'),
        pos: value.pos.slice()
    };
    if (includeOrientation) {
        result.yaw = value.yaw;
        result.pitch = value.pitch;
    }
    return result;
};

const directionResult = value => {
    if (!Array.isArray(value) || value.length !== 3 ||
        value.some(component => typeof component !== 'number' || !Number.isFinite(component))) {
        const error = new Error('Invalid direction result');
        error.reason = 'invalid_response';
        throw error;
    }
    return value;
};

/**
 * Wire format: JSON-RPC 2.0 over a wss link to the bridge (protocol 23.1.0).
 * One WebSocket message carries either one raw JSON-RPC object or, for the
 * pre-auth pairing methods only, one Bridge transport envelope containing the
 * untouched JSON-RPC string.
 *
 *   request       {jsonrpc:"2.0", id, method, params}  -> reply with id
 *   notification  {jsonrpc:"2.0",     method, params}  -> no reply (id omitted)
 *   response      {jsonrpc:"2.0", id, result}
 *                 {jsonrpc:"2.0", id, error:{code, message, data?}}
 *
 * `method` is the dot-namespaced command (TCP command names, direct):
 *
 *   hello           object params (auth + build context)        -> reply
 *   build.setDimension [DimensionRef]                             -> BuildContext
 *   build.setOrigin [x, y, z]                                    -> BuildContext
 *   chat.post       ["msg"]                                      -> reply
 *   world.setBlock  [x, y, z, {block_id,state}]                  -> null
 *   world.setBlocks [x1, y1, z1, x2, y2, z2, {block_id,state}]  -> null
 *   world.getBlock  [x, y, z]                                   -> BlockValue
 *   world.getBlocks [x1, y1, z1, x2, y2, z2]                    -> BlockValue[]
 *   world.getHeight [x, z] or [x, z, maxY]                       -> integer
 *   world.spawnParticle [x, y, z, ox, oy, oz, particle, speed, count, (force)] -> accepted count
 *   world.spawnEntity [x, y, z, entity]                          -> entity handle
 *   world.strikeLightning [x, y, z]                              -> null
 *   connection.flush []                                          -> null
 *   player.getPos   []         => {dimension, pos:[x,y,z]}        -> reply
 *   player.setPos   [dimension, x, y, z]                          -> reply
 *   player.getPose  []         => {dimension, pos:[x,y,z], yaw, pitch} -> reply
 *   player.setPose  [dimension, x, y, z, yaw, pitch]              -> reply
 *   player.getDirection []                                        -> [x,y,z]
 *   player.setDirection [x,y,z]                                   -> [x,y,z]
 *   entity.getDirection [handle]                                  -> [x,y,z]
 *   entity.setDirection [handle,x,y,z]                            -> [x,y,z]
 *   auth.pairBegin  object params                                 -> reply
 *   auth.pairPoll   object params                                 -> reply
 *
 * Coordinates are deltas from the build origin. Scratch resolves StateText to
 * JSON-native values with the hello-matched catalog before sending BlockSpec;
 * the plugin performs final registry validation and returns full BlockValue.
 * Scratch keeps build-origin y sealed
 * and sends 0 for `build.setOrigin` y. `player.*` coordinates share the same
 * build-origin delta but do not depend on the dimension set by `build.setDimension`;
 * the dimension is explicit in both `player.getPos`'s result and `player.setPos`'s
 * params. Command blocks use id-bearing requests so success/error can be
 * observed during release-gate testing. FAST sends setters as notifications;
 * DEBUG and TRACE use requests, and TRACE waits on the calling Scratch thread
 * after a successful response.
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
         * Bounded registration queue for the current connection send order.
         * Normal requests only serialize their send; mode transitions hold the
         * queue until their connection.flush response completes.
         * @private
         */
        this._outboundQueue = [];
        this._outboundQueueBusy = false;
        this._outboundQueueGeneration = 0;

        /**
         * Build execution policy for the current main-stream connection.
         * Project loading does not write these runtime-only fields.
         * @private
         */
        this._buildMode = BuildMode.DEBUG;
        this._traceDelaySeconds = DEFAULT_TRACE_DELAY_SECONDS;

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
         * Non-secret label used only to match this observation target across
         * screens during one connection epoch.
         * @type {string}
         * @private
         */
        this._displayAlias = '';

        /**
         * Last successful hello response summary.
         * @type {?object}
         * @private
         */
        this._helloInfo = null;

        /** Canonical build context confirmed by hello or a successful setter. */
        this._buildContext = null;

        /**
         * Catalog state exposed to the Scratch picker. Catalog data exists only
         * while a hello-confirmed connection advertises the matching hash.
         * @type {object}
         * @private
         */
        this._catalogState = {
            status: CatalogStatus.NOT_ACQUIRED,
            mcVersion: '',
            catalogHash: null,
            source: null,
            fetchedAt: null,
            catalog: null
        };

        /**
         * IndexedDB cache and connection generation used by catalog acquisition.
         * @private
         */
        this._catalogCache = new IndexedDBCatalogCache();
        this._catalogGeneration = 0;

        /**
         * Suppress repeated connection guidance during one disconnected period.
         * @type {boolean}
         * @private
         */
        this._disconnectedCommandNoticeShown = false;

        /**
         * Suppress repeated delivery failure guidance after one connection is
         * closed to preserve the finite outbound boundary.
         * @type {boolean}
         * @private
         */
        this._buildDeliveryNoticeShown = false;

        /**
         * Last connection/auth error summary.
         * @type {?object}
         * @private
         */
        this._lastError = null;
        this._buildDeliveryNoticeShown = false;

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
         * Cumulative count of frames trimmed from `_frameLog` by
         * FRAME_LOG_LIMIT, surfaced to WireScope as `history_window.
         * dropped_frames` so a truncated window is never silently
         * indistinguishable from a complete one. Resets with `_frameLog`.
         * @type {number}
         * @private
         */
        this._droppedFrameCount = 0;

        /**
         * Sandbox route snapshot for the active connection.
         * @type {?{sandboxRoute: string, label: string}}
         * @private
         */
        this._connectionTarget = null;

        /**
         * Last `player.getPos` result and when it was fetched, reused for
         * monitor-driven `playerAttribute` polls within
         * PLAYER_POS_MONITOR_THROTTLE_MS so a checked stage monitor does not
         * issue a fresh request on every runtime step.
         * @type {?{result: object, fetchedAt: number}}
         * @private
         */
        this._playerPosCache = null;

        /**
         * Last `player.getPose` result and when it was fetched, kept separate
         * from the position cache so existing position reporters continue to
         * use `player.getPos`.
         * @type {?{result: object, fetchedAt: number}}
         * @private
         */
        this._playerPoseCache = null;

        /**
         * Monitor-only block information cache and same-coordinate in-flight
         * requests. Explicit script calls never reuse either collection.
         * @private
         */
        this._blockInfoMonitorCache = new Map();
        this._blockInfoMonitorPending = new Map();

        /**
         * Monitor-only height cache, same-parameter in-flight requests, and
         * per-connection suppression for repeated height-not-found guidance.
         * @private
         */
        this._heightMonitorCache = new Map();
        this._heightMonitorPending = new Map();
        this._heightNotFoundNoticeKeys = new Set();

        /**
         * One non-destructive event cursor and poll loop per connection epoch.
         * @private
         */
        this._eventPollGeneration = 0;
        this._eventPollPromise = null;
        this._eventStatus = initialEventStatus();
        this._eventPollErrorNoticeShown = false;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        const menuItem = (id, text, value) => ({
            text: formatMessage({id, default: text}),
            value
        });
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
                    opcode: 'setDimension',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setDimension',
                        default: 'set build dimension to [DIMENSION]',
                        description: 'Set the Minecraft dimension used by build commands'
                    }),
                    arguments: {
                        DIMENSION: {
                            type: ArgumentType.STRING,
                            menu: 'dimensions',
                            defaultValue: BuildDimension.OVERWORLD
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
                {
                    opcode: 'setBuildMode',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setBuildMode',
                        default: 'set build mode to [MODE] (TRACE delay [TRACE_DELAY] seconds)',
                        description: 'Set the execution mode and TRACE delay for block placement commands'
                    }),
                    arguments: {
                        MODE: {
                            type: ArgumentType.STRING,
                            menu: 'buildModes',
                            defaultValue: BuildMode.DEBUG
                        },
                        TRACE_DELAY: {
                            type: ArgumentType.NUMBER,
                            defaultValue: DEFAULT_TRACE_DELAY_SECONDS
                        }
                    }
                },
                {
                    opcode: 'flushBuildCommands',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.flushBuildCommands',
                        default: 'wait for sent block placements to finish',
                        description: 'Wait for earlier block placement commands on this connection to finish'
                    })
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
                        default: 'set block at x:[X] y:[Y] z:[Z] to ID [BLOCK] state [STATE] [PICKER]',
                        description: 'Set a single block using separate block ID and StateText inputs'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0},
                        BLOCK: {type: ArgumentType.STRING, defaultValue: 'stone'},
                        STATE: {type: ArgumentType.STRING, defaultValue: ''},
                        PICKER: {type: ArgumentType.IMAGE, dataURI: BLOCK_PICKER_ICON}
                    }
                },
                {
                    opcode: 'setBlocks',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setBlocks',
                        default: 'set blocks from x:[X1] y:[Y1] z:[Z1] to x:[X2] y:[Y2] z:[Z2] ' +
                            'as ID [BLOCK] state [STATE] [PICKER]',
                        description: 'Fill a cuboid using separate block ID and StateText inputs'
                    }),
                    arguments: {
                        X1: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y1: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z1: {type: ArgumentType.NUMBER, defaultValue: 0},
                        X2: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y2: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z2: {type: ArgumentType.NUMBER, defaultValue: 0},
                        BLOCK: {type: ArgumentType.STRING, defaultValue: 'stone'},
                        STATE: {type: ArgumentType.STRING, defaultValue: ''},
                        PICKER: {type: ArgumentType.IMAGE, dataURI: BLOCK_PICKER_ICON}
                    }
                },
                {
                    opcode: 'getBlock',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.getBlock',
                        default: 'block information at x:[X] y:[Y] z:[Z]',
                        description: 'Get one immutable block information snapshot at a position'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'getBlocks',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.getBlocks',
                        default: 'put block information from x:[X1] y:[Y1] z:[Z1] to ' +
                            'x:[X2] y:[Y2] z:[Z2] in [LIST]',
                        description: 'Replace a selected Scratch list with one bounded block information query'
                    }),
                    arguments: {
                        X1: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y1: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z1: {type: ArgumentType.NUMBER, defaultValue: 0},
                        X2: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y2: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z2: {type: ArgumentType.NUMBER, defaultValue: 0},
                        LIST: {type: ArgumentType.LIST, defaultValue: 'block list'}
                    }
                },
                {
                    opcode: 'getHeight',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.getHeight',
                        default: 'ground height at x:[X] z:[Z]',
                        description: 'Get the highest ground surface in one Minecraft column'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'getHeightBelow',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.getHeightBelow',
                        default: 'ground height at x:[X] z:[Z] at or below y:[MAX_Y]',
                        description: 'Get the highest ground surface at or below an inclusive maximum y'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0},
                        MAX_Y: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'blockInfoId',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.blockInfoId',
                        default: 'block ID of [BLOCK_INFO]',
                        description: 'Read the block ID from McRemote BlockInfoText without network access'
                    }),
                    arguments: {
                        BLOCK_INFO: {type: ArgumentType.STRING, defaultValue: 'minecraft:stone'}
                    }
                },
                {
                    opcode: 'blockInfoState',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.blockInfoState',
                        default: 'state of [BLOCK_INFO]',
                        description: 'Read the full StateText from McRemote BlockInfoText without network access'
                    }),
                    arguments: {
                        BLOCK_INFO: {type: ArgumentType.STRING, defaultValue: 'minecraft:oak_log[axis=y]'}
                    }
                },
                {
                    opcode: 'blockInfoStateProperty',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.blockInfoStateProperty',
                        default: 'state [PROPERTY] of [BLOCK_INFO]',
                        description: 'Read one state property from McRemote BlockInfoText without network access'
                    }),
                    arguments: {
                        PROPERTY: {type: ArgumentType.STRING, defaultValue: 'axis'},
                        BLOCK_INFO: {type: ArgumentType.STRING, defaultValue: 'minecraft:oak_log[axis=y]'}
                    }
                },
                {
                    opcode: 'blockInfoHasStateProperty',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'mcremote.blockInfoHasStateProperty',
                        default: '[BLOCK_INFO] has state [PROPERTY]',
                        description: 'Check whether McRemote BlockInfoText contains a state property'
                    }),
                    arguments: {
                        BLOCK_INFO: {type: ArgumentType.STRING, defaultValue: 'minecraft:oak_log[axis=y]'},
                        PROPERTY: {type: ArgumentType.STRING, defaultValue: 'axis'}
                    }
                },
                {
                    opcode: 'getSign',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.getSign',
                        default: 'sign information at x:[X] y:[Y] z:[Z]',
                        description: 'Get one immutable sign information snapshot at a position'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'setSign',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setSign',
                        default: 'set sign [FACE] at x:[X] y:[Y] z:[Z] to [LINE0] [LINE1] [LINE2] [LINE3]',
                        description: 'Replace all four lines of one sign face with plain text'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0},
                        FACE: {type: ArgumentType.STRING, menu: 'signFaces', defaultValue: 'front'},
                        LINE0: {type: ArgumentType.STRING, defaultValue: ''},
                        LINE1: {type: ArgumentType.STRING, defaultValue: ''},
                        LINE2: {type: ArgumentType.STRING, defaultValue: ''},
                        LINE3: {type: ArgumentType.STRING, defaultValue: ''}
                    }
                },
                {
                    opcode: 'updateSignLine',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.updateSignLine',
                        default: 'set sign [FACE] line [LINE] at x:[X] y:[Y] z:[Z] to [TEXT]',
                        description: 'Replace one sign line with plain text, keeping the other three lines'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0},
                        FACE: {type: ArgumentType.STRING, menu: 'signFaces', defaultValue: 'front'},
                        LINE: {type: ArgumentType.STRING, menu: 'signLineIndices', defaultValue: '0'},
                        TEXT: {type: ArgumentType.STRING, defaultValue: ''}
                    }
                },
                {
                    opcode: 'signLineText',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.signLineText',
                        default: '[FACE] line [LINE] text of [SIGN_INFO]',
                        description: 'Read one line of text from McRemote SignInfoText without network access'
                    }),
                    arguments: {
                        FACE: {type: ArgumentType.STRING, menu: 'signFaces', defaultValue: 'front'},
                        LINE: {type: ArgumentType.STRING, menu: 'signLineIndices', defaultValue: '0'},
                        SIGN_INFO: {type: ArgumentType.STRING, defaultValue: ''}
                    }
                },
                {
                    opcode: 'signLineColor',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.signLineColor',
                        default: '[FACE] line [LINE] color of [SIGN_INFO]',
                        description: 'Read one line color from McRemote SignInfoText without network access'
                    }),
                    arguments: {
                        FACE: {type: ArgumentType.STRING, menu: 'signFaces', defaultValue: 'front'},
                        LINE: {type: ArgumentType.STRING, menu: 'signLineIndices', defaultValue: '0'},
                        SIGN_INFO: {type: ArgumentType.STRING, defaultValue: ''}
                    }
                },
                {
                    opcode: 'signLineHasDecoration',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'mcremote.signLineHasDecoration',
                        default: '[FACE] line [LINE] of [SIGN_INFO] has [DECORATION]',
                        description: 'Check one line decoration from McRemote SignInfoText without network access'
                    }),
                    arguments: {
                        FACE: {type: ArgumentType.STRING, menu: 'signFaces', defaultValue: 'front'},
                        LINE: {type: ArgumentType.STRING, menu: 'signLineIndices', defaultValue: '0'},
                        SIGN_INFO: {type: ArgumentType.STRING, defaultValue: ''},
                        DECORATION: {type: ArgumentType.STRING, menu: 'signDecorations', defaultValue: 'bold'}
                    }
                },
                {
                    opcode: 'signIsWaxed',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'mcremote.signIsWaxed',
                        default: '[SIGN_INFO] is waxed',
                        description: 'Check whether McRemote SignInfoText reports a waxed sign'
                    }),
                    arguments: {
                        SIGN_INFO: {type: ArgumentType.STRING, defaultValue: ''}
                    }
                },
                {
                    opcode: 'isMcRemoteError',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'mcremote.isMcRemoteError',
                        default: '[VALUE] is a McRemote error',
                        description: 'Check the exact reserved McRemote ErrorText grammar'
                    }),
                    arguments: {
                        VALUE: {type: ArgumentType.STRING, defaultValue: makeErrorText('unknown_block')}
                    }
                },
                {
                    opcode: 'spawnParticle',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.spawnParticle',
                        default: 'spawn particle [PARTICLE] at x:[X] y:[Y] z:[Z] ' +
                            'offset x:[OFFSET_X] y:[OFFSET_Y] z:[OFFSET_Z] ' +
                            'speed:[SPEED] count:[COUNT] visibility:[FORCE]',
                        description: 'Spawn data-free particles at an origin-relative position'
                    }),
                    arguments: {
                        PARTICLE: {type: ArgumentType.STRING, defaultValue: 'minecraft:flame'},
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0},
                        OFFSET_X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        OFFSET_Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        OFFSET_Z: {type: ArgumentType.NUMBER, defaultValue: 0},
                        SPEED: {type: ArgumentType.NUMBER, defaultValue: 0},
                        COUNT: {type: ArgumentType.NUMBER, defaultValue: 1},
                        FORCE: {
                            type: ArgumentType.STRING,
                            menu: 'particleVisibility',
                            defaultValue: 'true'
                        }
                    }
                },
                {
                    opcode: 'spawnEntity',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.spawnEntity',
                        default: 'spawn entity [ENTITY] at x:[X] y:[Y] z:[Z] and put its handle in [VARIABLE]',
                        description: 'Spawn one entity and store its connection-scoped handle in a variable'
                    }),
                    arguments: {
                        ENTITY: {type: ArgumentType.STRING, defaultValue: 'minecraft:allay'},
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0},
                        VARIABLE: {type: ArgumentType.VARIABLE, defaultValue: 'entity handle'}
                    }
                },
                '---',
                {
                    opcode: 'playerDirection',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.playerDirection',
                        default: 'player direction [AXIS]',
                        description: 'Report one component of the paired player direction'
                    }),
                    arguments: {
                        AXIS: {
                            type: ArgumentType.STRING,
                            menu: 'directionAxes',
                            defaultValue: 'x'
                        }
                    }
                },
                {
                    opcode: 'setPlayerDirection',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setPlayerDirection',
                        default: 'set player direction to x [X] y [Y] z [Z]',
                        description: 'Set the paired player direction and validate the post-read direction'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'entityDirection',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.entityDirection',
                        default: 'direction [AXIS] of entity [HANDLE]',
                        description: 'Report one direction component using an opaque entity handle'
                    }),
                    arguments: {
                        HANDLE: {type: ArgumentType.STRING, defaultValue: 'mcr_eh_...'},
                        AXIS: {
                            type: ArgumentType.STRING,
                            menu: 'directionAxes',
                            defaultValue: 'x'
                        }
                    }
                },
                {
                    opcode: 'setEntityDirection',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setEntityDirection',
                        default: 'set direction of entity [HANDLE] to x [X] y [Y] z [Z]',
                        description: 'Set an entity direction by opaque handle and validate the post-read direction'
                    }),
                    arguments: {
                        HANDLE: {type: ArgumentType.STRING, defaultValue: 'mcr_eh_...'},
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'strikeLightning',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.strikeLightning',
                        default: 'strike lightning at x [X] y [Y] z [Z]',
                        description: 'Strike full lightning, which can cause damage, fire, lightning rod and copper ' +
                            'reactions, events, and entity changes'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                '---',
                {
                    opcode: 'whenPickaxePoke',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: false,
                    text: formatMessage({
                        id: 'mcremote.whenPickaxePoke',
                        default: 'when a block is poked with a pickaxe',
                        description: 'Run once for each paired-player pickaxe-poke event'
                    })
                },
                {
                    opcode: 'whenChatPosted',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: false,
                    text: formatMessage({
                        id: 'mcremote.whenChatPosted',
                        default: 'when chat is posted',
                        description: 'Run once for each paired-player chat event'
                    })
                },
                {
                    opcode: 'whenProjectileHit',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: false,
                    text: formatMessage({
                        id: 'mcremote.whenProjectileHit',
                        default: 'when a projectile hits',
                        description: 'Run once for each paired-player projectile hit event'
                    })
                },
                {
                    opcode: 'eventValue',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.eventValue',
                        default: '[PROPERTY] of this Minecraft event',
                        description: 'Read one value from the event bound to the current hat thread'
                    }),
                    arguments: {
                        PROPERTY: {
                            type: ArgumentType.STRING,
                            menu: 'eventValues'
                        }
                    }
                },
                {
                    opcode: 'eventStatus',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.eventStatus',
                        default: 'event polling [PROPERTY]',
                        description: 'Read the current event cursor or a cumulative event loss counter'
                    }),
                    arguments: {
                        PROPERTY: {
                            type: ArgumentType.STRING,
                            menu: 'eventStatusValues'
                        }
                    }
                },
                '---',
                {
                    opcode: 'playerAttribute',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'mcremote.playerAttribute',
                        default: 'player\'s [PROPERTY]',
                        description: 'Report an attribute of the paired Minecraft player'
                    }),
                    arguments: {
                        PROPERTY: {
                            type: ArgumentType.STRING,
                            menu: 'playerAttributes'
                        }
                    }
                },
                {
                    opcode: 'setPlayerPos',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setPlayerPos',
                        default: 'move player to [DIMENSION] x:[X] y:[Y] z:[Z]',
                        description: 'Teleport the paired player to a dimension and position'
                    }),
                    arguments: {
                        DIMENSION: {
                            type: ArgumentType.STRING,
                            menu: 'dimensions',
                            defaultValue: BuildDimension.OVERWORLD
                        },
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'setPlayerPose',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setPlayerPose',
                        default: 'move player to [DIMENSION] x:[X] y:[Y] z:[Z] yaw:[YAW] pitch:[PITCH]',
                        description: 'Teleport the paired player to a dimension, position and orientation'
                    }),
                    arguments: {
                        DIMENSION: {
                            type: ArgumentType.STRING,
                            menu: 'dimensions',
                            defaultValue: BuildDimension.OVERWORLD
                        },
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0},
                        YAW: {type: ArgumentType.NUMBER, defaultValue: 0},
                        PITCH: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                },
                {
                    opcode: 'setPlayerXYZ',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'mcremote.setPlayerXYZ',
                        default: 'move player to x:[X] y:[Y] z:[Z]',
                        description: 'Teleport the paired player within the player\'s current dimension'
                    }),
                    arguments: {
                        X: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Y: {type: ArgumentType.NUMBER, defaultValue: 0},
                        Z: {type: ArgumentType.NUMBER, defaultValue: 0}
                    }
                }
            ],
            menus: {
                eventValues: {
                    acceptReporters: false,
                    items: [
                        menuItem('mcremote.eventValue.sequence', 'sequence', 'sequence'),
                        menuItem('mcremote.eventValue.type', 'event type', 'type'),
                        menuItem('mcremote.eventValue.dimension', 'dimension', 'dimension'),
                        menuItem('mcremote.eventValue.x', 'x position', 'x'),
                        menuItem('mcremote.eventValue.y', 'y position', 'y'),
                        menuItem('mcremote.eventValue.z', 'z position', 'z'),
                        menuItem('mcremote.eventValue.originX', 'origin x', 'origin_x'),
                        menuItem('mcremote.eventValue.originY', 'origin y', 'origin_y'),
                        menuItem('mcremote.eventValue.originZ', 'origin z', 'origin_z'),
                        menuItem('mcremote.eventValue.face', 'face', 'face'),
                        menuItem('mcremote.eventValue.hand', 'hand', 'hand'),
                        menuItem('mcremote.eventValue.item', 'item', 'item'),
                        menuItem('mcremote.eventValue.message', 'message', 'message'),
                        menuItem('mcremote.eventValue.block', 'block information', 'block'),
                        menuItem('mcremote.eventValue.projectile', 'projectile', 'projectile'),
                        menuItem('mcremote.eventValue.targetKind', 'target type', 'target_kind'),
                        menuItem('mcremote.eventValue.targetX', 'target x', 'target_x'),
                        menuItem('mcremote.eventValue.targetY', 'target y', 'target_y'),
                        menuItem('mcremote.eventValue.targetZ', 'target z', 'target_z'),
                        menuItem('mcremote.eventValue.targetFace', 'target face', 'target_face'),
                        menuItem('mcremote.eventValue.targetBlock', 'target block information', 'target_block'),
                        menuItem('mcremote.eventValue.targetHandle', 'target entity handle', 'target_handle')
                    ]
                },
                eventStatusValues: {
                    acceptReporters: false,
                    items: [
                        menuItem('mcremote.eventStatus.cursor', 'cursor', 'cursor'),
                        menuItem('mcremote.eventStatus.latest', 'latest sequence', 'latest'),
                        menuItem('mcremote.eventStatus.overflow', 'overflow loss', 'overflow'),
                        menuItem('mcremote.eventStatus.capacity', 'capacity loss', 'capacity'),
                        menuItem('mcremote.eventStatus.discarded', 'explicit discard', 'discarded'),
                        menuItem('mcremote.eventStatus.totalLoss', 'total loss', 'total_loss')
                    ]
                },
                signFaces: {
                    acceptReporters: false,
                    items: SIGN_FACES.map(face => menuItem(`mcremote.signFace.${face}`, face, face))
                },
                signLineIndices: {
                    acceptReporters: false,
                    items: SIGN_LINE_INDICES.map(index => menuItem(
                        `mcremote.signLineIndex.${index}`, String(index), String(index)
                    ))
                },
                signDecorations: {
                    acceptReporters: false,
                    items: SIGN_DECORATIONS.map(
                        decoration => menuItem(`mcremote.signDecoration.${decoration}`, decoration, decoration)
                    )
                },
                buildModes: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'mcremote.buildMode.debug',
                                default: 'DEBUG',
                                description: 'Build mode that waits for and reports each command result'
                            }),
                            value: BuildMode.DEBUG
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.buildMode.trace',
                                default: 'TRACE',
                                description: 'Build mode that pauses after each successful placement command'
                            }),
                            value: BuildMode.TRACE
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.buildMode.fast',
                                default: 'FAST',
                                description: 'Build mode that sends placement commands without individual replies'
                            }),
                            value: BuildMode.FAST
                        }
                    ]
                },
                particleVisibility: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'mcremote.particleVisibility.far',
                                default: 'far away too',
                                description: 'Particle visibility that uses Minecraft force=true'
                            }),
                            value: 'true'
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.particleVisibility.near',
                                default: 'nearby only',
                                description: 'Particle visibility that uses Minecraft force=false'
                            }),
                            value: 'false'
                        }
                    ]
                },
                directionAxes: {
                    acceptReporters: false,
                    items: DIRECTION_AXES.map(axis => ({text: axis, value: axis}))
                },
                playerAttributes: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'mcremote.playerAttribute.dimension',
                                default: 'dimension',
                                description: 'Menu label for the paired player\'s current Minecraft dimension'
                            }),
                            value: 'dimension'
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.playerAttribute.x',
                                default: 'x position',
                                description: 'Menu label for the paired player\'s x position'
                            }),
                            value: 'x'
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.playerAttribute.y',
                                default: 'y position',
                                description: 'Menu label for the paired player\'s y position'
                            }),
                            value: 'y'
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.playerAttribute.z',
                                default: 'z position',
                                description: 'Menu label for the paired player\'s z position'
                            }),
                            value: 'z'
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.playerAttribute.yaw',
                                default: 'yaw',
                                description: 'Menu label for the paired player\'s horizontal orientation'
                            }),
                            value: 'yaw'
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.playerAttribute.pitch',
                                default: 'pitch',
                                description: 'Menu label for the paired player\'s vertical orientation'
                            }),
                            value: 'pitch'
                        }
                    ]
                },
                dimensions: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'mcremote.dimension.overworld',
                                default: 'overworld',
                                description: 'Menu label for the Minecraft overworld dimension'
                            }),
                            value: BuildDimension.OVERWORLD
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.dimension.nether',
                                default: 'nether',
                                description: 'Menu label for the Minecraft nether dimension'
                            }),
                            value: BuildDimension.NETHER
                        },
                        {
                            text: formatMessage({
                                id: 'mcremote.dimension.theEnd',
                                default: 'the End',
                                description: 'Menu label for the Minecraft the_end dimension'
                            }),
                            value: BuildDimension.THE_END
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
     * Clear contexts which belong to a previous McRemote connection epoch.
     * @private
     */
    _clearEventThreadContexts () {
        if (!this.runtime || !Array.isArray(this.runtime.threads)) return;
        for (const thread of this.runtime.threads) {
            if (thread.extensionContext && thread.extensionContext.mcremoteEvent) {
                thread.extensionContext = null;
            }
        }
    }

    /**
     * Stop the current poll loop and return event state to connection defaults.
     * @private
     */
    _resetEventState () {
        this._eventPollGeneration++;
        this._eventPollPromise = null;
        this._eventStatus = initialEventStatus();
        this._eventPollErrorNoticeShown = false;
        this._clearEventThreadContexts();
    }

    /**
     * Reset stream-local observer data before starting a new connection.
     * @private
     */
    _resetObservationForConnection () {
        const resetError = new Error('McRemote connection epoch reset');
        resetError.reason = 'connection_reset';
        this._rejectOutboundQueue(resetError);
        this._resetEventState();
        this._connectionStatus = ConnectionStatus.DISCONNECTED;
        this._streamId = DEFAULT_STREAM_ID;
        this._displayAlias = '';
        this._helloInfo = null;
        this._buildContext = null;
        this._lastError = null;
        this._frameLog = [];
        this._frameSequence = 0;
        this._droppedFrameCount = 0;
        this._nextRequestId = 1;
        this._pairCode = '';
        this._pairCommand = '';
        this._buildMode = BuildMode.DEBUG;
        this._traceDelaySeconds = DEFAULT_TRACE_DELAY_SECONDS;
        this._playerPosCache = null;
        this._playerPoseCache = null;
        this._blockInfoMonitorCache.clear();
        this._blockInfoMonitorPending.clear();
        this._heightMonitorCache.clear();
        this._heightMonitorPending.clear();
        this._heightNotFoundNoticeKeys.clear();
        this._resetCatalog();
        this._emitObservation();
    }

    /**
     * Clear picker data at every connection boundary. Cached catalogs remain in
     * IndexedDB but are not usable until a later hello confirms their hash.
     * @private
     */
    _resetCatalog () {
        this._catalogGeneration++;
        this._catalogState = {
            status: CatalogStatus.NOT_ACQUIRED,
            mcVersion: '',
            catalogHash: null,
            source: null,
            fetchedAt: null,
            catalog: null
        };
        this._emitCatalog();
    }

    /**
     * @returns {object} current catalog state for the picker UI.
     */
    getCatalogState () {
        return Object.assign({}, this._catalogState);
    }

    /**
     * Emit a full catalog snapshot. Catalog data is runtime-only and is not
     * serialized into a Scratch project.
     * @private
     */
    _emitCatalog () {
        if (this.runtime && typeof this.runtime.emit === 'function') {
            this.runtime.emit(Runtime.MCREMOTE_CATALOG_UPDATE, this.getCatalogState());
        }
    }

    /**
     * @param {number} generation connection generation captured after hello.
     * @param {string} catalogHash hello-advertised hash.
     * @returns {boolean} whether an asynchronous catalog result is still current.
     * @private
     */
    _isCurrentCatalogRequest (generation, catalogHash) {
        return generation === this._catalogGeneration &&
            this._connectionStatus === ConnectionStatus.CONNECTED &&
            this._helloInfo && this._helloInfo.catalogHash === catalogHash;
    }

    /**
     * Acquire the hello-advertised catalog from a validated cache entry or the
     * active server. Failure is non-fatal to the McRemote connection.
     * @param {object} helloResult successful hello result.
     * @returns {Promise<void>} resolves after best-effort acquisition.
     * @private
     */
    _acquireCatalog (helloResult) {
        const advertisedHash = helloResult && typeof helloResult.catalogHash === 'string' ?
            helloResult.catalogHash.toLowerCase() : '';
        if (!advertisedHash) return Promise.resolve();

        const generation = this._catalogGeneration;
        const mcVersion = helloResult.mc_version || '';
        const publish = (catalog, source, fetchedAt) => {
            if (!this._isCurrentCatalogRequest(generation, advertisedHash)) return false;
            this._catalogState = {
                status: CatalogStatus.CURRENT,
                mcVersion,
                catalogHash: advertisedHash,
                source,
                fetchedAt: fetchedAt || null,
                catalog
            };
            this._emitCatalog();
            return true;
        };
        const fetchFromServer = () => this._request('catalog.get', [])
            .then(result => validateCatalogResult(result, advertisedHash))
            .then(catalog => {
                const fetchedAt = Date.now();
                if (!publish(catalog, CatalogSource.NETWORK, fetchedAt)) return;
                this._catalogCache.set(advertisedHash, {catalog, fetchedAt}).catch(error => {
                    log.warn(`McRemote: catalog cache write failed: ${error.message}`);
                });
            });

        return this._catalogCache.get(advertisedHash)
            .catch(error => {
                log.warn(`McRemote: catalog cache read failed: ${error.message}`);
                return null;
            })
            .then(record => {
                if (!record || !record.catalog) return null;
                return validateCatalogResult(record.catalog, advertisedHash)
                    .then(catalog => ({catalog, fetchedAt: record.fetchedAt || null}))
                    .catch(error => {
                        log.warn(`McRemote: cached catalog rejected: ${error.reason || error.message}`);
                        return null;
                    });
            })
            .then(cached => {
                if (cached) {
                    publish(cached.catalog, CatalogSource.CACHE, cached.fetchedAt);
                    return;
                }
                return fetchFromServer();
            })
            .catch(error => {
                if (!this._isCurrentCatalogRequest(generation, advertisedHash)) return;
                this._catalogState = {
                    status: CatalogStatus.UNAVAILABLE,
                    mcVersion,
                    catalogHash: advertisedHash,
                    source: null,
                    fetchedAt: null,
                    catalog: null
                };
                this._emitCatalog();
                log.warn(`McRemote: catalog acquisition failed: ${error.reason || error.message}`);
            });
    }

    /**
     * @returns {object} current McRemote observer snapshot.
     * @private
     */
    _observationSnapshot () {
        return {
            status: this._connectionStatus,
            streamId: this._streamId,
            sourceKind: 'scratch',
            displayAlias: this._displayAlias,
            connectionTarget: Object.assign({}, this._currentConnectionTarget()),
            pairCode: this._pairCode,
            pairCommand: this._pairCommand,
            hello: this._sanitizeWireValue(this._helloInfo),
            lastError: this._sanitizeWireValue(this._lastError),
            frameLog: this._frameLog.map(frame => this._sanitizeWireValue(frame)),
            droppedFrames: this._droppedFrameCount
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
     * Store observer-safe hello fields for internal connection diagnostics.
     * @param {object} result - hello response payload.
     * @private
     */
    _recordHelloInfo (result) {
        const confirmedContext = buildContext({
            dimension: result && result.dimension,
            origin: result && result.origin
        }, 'hello result build context');
        const worldConstants = result && typeof result === 'object' && result.world_constants ?
            result.world_constants :
            result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'y_sea') ?
                {y_sea: result.y_sea} :
                null;
        this._helloInfo = result && typeof result === 'object' ? {
            protocol: result.protocol || '',
            mc_version: result.mc_version || '',
            catalogHash: typeof result.catalogHash === 'string' ? result.catalogHash.toLowerCase() : null,
            supported_mc_versions: Array.isArray(result.supported_mc_versions) ?
                result.supported_mc_versions.slice() :
                [],
            world_constants: worldConstants,
            permissions: result.permissions || null,
            dimension: confirmedContext.dimension,
            origin: confirmedContext.origin.slice()
        } : null;
        this._buildContext = confirmedContext;
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
            const trimmed = this._frameLog.length - FRAME_LOG_LIMIT;
            this._frameLog.splice(0, trimmed);
            this._droppedFrameCount += trimmed;
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
     * Build the rejection used everywhere a deployment ships without McRemote connectivity, so
     * observers can tell a showcase page apart from a page that simply has not connected yet.
     * @returns {Error} error carrying the `connection_disabled` reason.
     * @private
     */
    _connectionDisabledError () {
        const error = new Error(formatMessage({
            id: 'mcremote.connectionDisabled',
            default: 'This page is a showcase with the Minecraft connection turned off.',
            description: 'Shown when McRemote blocks run on a deployment that ships without connectivity'
        }));
        error.reason = 'connection_disabled';
        return error;
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
     * Notify the GUI once when a command is attempted without a usable
     * connection. A successful hello starts a fresh connection epoch.
     * @param {Error} error rejected command error.
     * @private
     */
    _notifyDisconnectedCommand (error) {
        if (this._disconnectedCommandNoticeShown) return;
        if (!error || (error.reason !== 'not_connected' && error.reason !== 'connection_disabled')) return;
        this._disconnectedCommandNoticeShown = true;
        this._lastError = this._errorInfo(error);
        this._emitObservation();
        if (this.runtime && typeof this.runtime.emit === 'function') {
            this.runtime.emit(Runtime.MCREMOTE_ACTIONABLE_ERROR, this._lastError);
        }
    }

    /**
     * Open the wss connection to the bridge and perform the hello handshake.
     * @param {string} [sandbox] - optional named sandbox to target.
     * @returns {Promise} resolves once the handshake completes.
     * @private
     */
    _open (sandbox) {
        if (!this._runtimeConfig().connectionEnabled) {
            const error = this._connectionDisabledError();
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
            const socket = new WebSocket(this._bridgeUrl(this._connectionTarget.sandboxRoute), [
                BRIDGE_TRANSPORT_PROBE_PROTOCOL,
                BRIDGE_TRANSPORT_PROTOCOL
            ]);
            this._socket = socket;
            socket.addEventListener('open', () => {
                if (socket.protocol !== BRIDGE_TRANSPORT_PROTOCOL) {
                    const error = new Error('McRemote Bridge transport is incompatible');
                    error.reason = 'bridge_transport_incompatible';
                    this._setConnectionStatus(ConnectionStatus.ERROR, error);
                    socket.close(1002, error.reason);
                    reject(error);
                    return;
                }
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
                this._displayAlias = '';
                this._buildContext = null;
                this._blockInfoMonitorCache.clear();
                this._blockInfoMonitorPending.clear();
                this._heightMonitorCache.clear();
                this._heightMonitorPending.clear();
                this._heightNotFoundNoticeKeys.clear();
                this._resetEventState();
                this._setConnectionStatus(ConnectionStatus.CLOSED, error);
                this._resetCatalog();
                this._rejectPending(error);
                this._rejectOutboundQueue(error);
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
            if (!this._displayAlias) this._displayAlias = createDisplayAlias();
            this._setConnectionStatus(ConnectionStatus.CONNECTED);
            this._disconnectedCommandNoticeShown = false;
            this._acquireCatalog(result);
            this._startEventPoller();
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
            version: CLIENT_VERSION,
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
     * Reject registrations which have not reached the active connection yet.
     * An incremented generation prevents a late transition completion from
     * draining work into a replacement connection.
     * @param {Error} error - rejection reason.
     * @private
     */
    _rejectOutboundQueue (error) {
        this._outboundQueueGeneration++;
        for (const entry of this._outboundQueue) entry.reject(error);
        this._outboundQueue = [];
        this._outboundQueueBusy = false;
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
     * Polling is enabled only in a complete Scratch runtime. Lightweight unit
     * harnesses without script discovery keep their existing request ordering.
     * @returns {boolean} whether event hats can be started.
     * @private
     */
    _eventPollingAvailable () {
        return Boolean(this.runtime &&
            typeof this.runtime.startHats === 'function' &&
            typeof this.runtime.allScriptsByOpcodeDo === 'function');
    }

    /**
     * Start exactly one non-destructive poll loop for the current connection.
     * @private
     */
    _startEventPoller () {
        if (!this._eventPollingAvailable()) return;
        const generation = ++this._eventPollGeneration;
        this._eventPollPromise = null;
        this._eventStatus = initialEventStatus();
        this._eventPollErrorNoticeShown = false;
        this._pollEvents(generation);
    }

    /**
     * @param {object} event immutable validated event DTO.
     * @private
     */
    _dispatchEvent (event) {
        if (!sameBuildContext(event, this._buildContext)) return;
        const opcode = EVENT_HAT_OPCODES[event.type];
        if (!opcode || !this.runtime || typeof this.runtime.startHats !== 'function') return;
        this.runtime.startHats(opcode, {}, null, {
            allowConcurrentThreads: true,
            extensionContext: {mcremoteEvent: event}
        });
    }

    /**
     * Notify the editor without turning a recoverable ring loss into a broken
     * Minecraft control connection.
     * @param {object} status current cumulative event status.
     * @private
     */
    _notifyEventLoss (status) {
        const error = new Error('Some Minecraft events were lost before Scratch could receive them.');
        error.reason = 'event_loss';
        error.data = {
            reason: error.reason,
            overflow_dropped_total: status.overflowDroppedTotal,
            capacity_dropped_total: status.capacityDroppedTotal
        };
        log.warn(`McRemote: events.poll reported loss: overflow=${status.overflowDroppedTotal}, ` +
            `capacity=${status.capacityDroppedTotal}`);
        if (this.runtime && typeof this.runtime.emit === 'function') {
            this.runtime.emit(Runtime.MCREMOTE_ACTIONABLE_ERROR, this._errorInfo(error));
        }
    }

    /**
     * Stop a malformed or failed poll loop while leaving other commands usable.
     * @param {Error} error poll failure.
     * @private
     */
    _failEventPoller (error) {
        this._eventPollGeneration++;
        this._eventPollPromise = null;
        if (this._eventPollErrorNoticeShown) return;
        this._eventPollErrorNoticeShown = true;
        log.warn(`McRemote: events.poll stopped: ${error.reason || error.message}`);
        this._lastError = this._errorInfo(error);
        this._emitObservation();
        if (this.runtime && typeof this.runtime.emit === 'function') {
            this.runtime.emit(Runtime.MCREMOTE_ACTIONABLE_ERROR, this._lastError);
        }
    }

    /**
     * @param {number} generation current event poll generation.
     * @param {boolean} idle whether the preceding result was empty.
     * @private
     */
    _scheduleEventPoll (generation, idle) {
        const wait = idle ? this._delay(EVENT_POLL_IDLE_INTERVAL_MS) : Promise.resolve();
        wait.then(() => {
            if (generation !== this._eventPollGeneration ||
                this._connectionStatus !== ConnectionStatus.CONNECTED) return;
            this._pollEvents(generation);
        });
    }

    /**
     * Request one batch. The cursor advances only after strict validation and
     * successful receipt, so a lost response can be requested again safely.
     * @param {number} generation current event poll generation.
     * @private
     */
    _pollEvents (generation) {
        if (generation !== this._eventPollGeneration ||
            this._connectionStatus !== ConnectionStatus.CONNECTED || this._eventPollPromise) return;
        const afterSequence = this._eventStatus.cursor;
        const polling = this._request('events.poll', [afterSequence]);
        this._eventPollPromise = polling;
        polling.then(result => {
            if (generation !== this._eventPollGeneration || this._eventPollPromise !== polling) return;
            this._eventPollPromise = null;
            let parsed;
            try {
                parsed = validateEventPollResult(result, afterSequence, this._eventStatus);
            } catch (error) {
                this._failEventPoller(error);
                return;
            }
            this._eventStatus = parsed.status;
            if (parsed.lossDelta > 0) this._notifyEventLoss(parsed.status);
            for (const event of parsed.events) this._dispatchEvent(event);
            this._scheduleEventPoll(generation, parsed.events.length === 0);
        }, error => {
            if (generation !== this._eventPollGeneration || this._eventPollPromise !== polling) return;
            this._eventPollPromise = null;
            this._failEventPoller(error);
        });
    }

    /**
     * Reject a send before assigning a request id when the active connection
     * cannot accept commands.
     * @param {string} method - JSON-RPC method.
     * @returns {?Error} error when sending is unavailable.
     * @private
     */
    _sendGuardError (method) {
        if (!this._runtimeConfig().connectionEnabled) {
            const error = this._connectionDisabledError();
            if (!this._isSessionSetupMethod(method)) this._notifyDisconnectedCommand(error);
            return error;
        }
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
            const error = new Error('not connected to bridge');
            error.reason = 'not_connected';
            if (!this._isSessionSetupMethod(method)) this._notifyDisconnectedCommand(error);
            return error;
        }
        if (!this._isSessionSetupMethod(method) && this._connectionStatus !== ConnectionStatus.CONNECTED) {
            const error = new Error('not connected to McRemote server');
            error.reason = 'not_connected';
            this._notifyDisconnectedCommand(error);
            return error;
        }
        return null;
    }

    /**
     * @param {string} payload - encoded WebSocket message.
     * @returns {number} UTF-8 byte length.
     * @private
     */
    _payloadByteLength (payload) {
        return new TextEncoder().encode(payload).byteLength;
    }

    /**
     * Wait until the browser WebSocket's finite outbound buffer can accept the
     * payload. A stalled transport fails the connection instead of silently
     * discarding a FAST notification or growing an application queue forever.
     * @param {WebSocket} socket - connection generation which owns the send.
     * @param {number} payloadBytes - encoded payload size.
     * @returns {?Promise} null when capacity is already available.
     * @private
     */
    _waitForOutboundCapacity (socket, payloadBytes) {
        if (payloadBytes > OUTBOUND_BUFFER_LIMIT_BYTES) {
            const error = new Error('McRemote outbound message exceeds the transport limit');
            error.reason = 'capacity_exhausted';
            if (socket && socket.readyState === WebSocket.OPEN) socket.close(1011, error.reason);
            return Promise.reject(error);
        }
        const hasCapacity = () => socket === this._socket &&
            socket.readyState === WebSocket.OPEN &&
            socket.bufferedAmount + payloadBytes <= OUTBOUND_BUFFER_LIMIT_BYTES;
        if (hasCapacity()) return null;

        const startedAt = Date.now();
        const poll = () => {
            if (socket !== this._socket || socket.readyState !== WebSocket.OPEN) {
                const error = new Error('McRemote connection closed during backpressure');
                error.reason = 'transport_lost';
                return Promise.reject(error);
            }
            if (hasCapacity()) return Promise.resolve();
            if (Date.now() - startedAt >= OUTBOUND_BACKPRESSURE_TIMEOUT_MS) {
                const error = new Error('McRemote outbound transport remained full');
                error.reason = 'backpressure';
                socket.close(1011, error.reason);
                return Promise.reject(error);
            }
            return this._delay(OUTBOUND_BACKPRESSURE_POLL_MS).then(poll);
        };
        return poll();
    }

    /**
     * Send one observer-visible JSON-RPC frame, waiting only when browser
     * transport capacity is currently exhausted.
     * @param {object} message - raw JSON-RPC message.
     * @returns {?Promise} null for an immediate send, otherwise send completion.
     * @private
     */
    _sendJsonRpc (message) {
        const socket = this._socket;
        const payload = JSON.stringify(message);
        const wirePayload = ONE_SHOT_METHODS.has(message.method) ? JSON.stringify({
            [ONE_SHOT_HINT_KEY]: ONE_SHOT_HINT,
            payload
        }) : payload;
        const send = () => {
            if (socket !== this._socket || socket.readyState !== WebSocket.OPEN) {
                const error = new Error('McRemote connection changed before send');
                error.reason = 'transport_lost';
                throw error;
            }
            this._appendFrame('send', message);
            socket.send(wirePayload);
        };
        const waiting = this._waitForOutboundCapacity(socket, this._payloadByteLength(wirePayload));
        if (!waiting) {
            send();
            return null;
        }
        return waiting.then(send);
    }

    /**
     * Start one request immediately on the current connection.
     * @param {string} method - JSON-RPC method.
     * @param {Array|object} params - request params.
     * @returns {{release: ?Promise, completion: Promise}} local-send and response promises.
     * @private
     */
    _startRequest (method, params) {
        const guardError = this._sendGuardError(method);
        if (guardError) return {release: null, completion: Promise.reject(guardError)};

        const id = this._nextRequestId++;
        let resolveResponse;
        let rejectResponse;
        const response = new Promise((resolve, reject) => {
            resolveResponse = resolve;
            rejectResponse = reject;
        });
        const message = {jsonrpc: '2.0', id, method, params};
        this._pending.set(id, {resolve: resolveResponse, reject: rejectResponse, method});

        let release;
        try {
            release = this._sendJsonRpc(message);
        } catch (error) {
            this._pending.delete(id);
            rejectResponse(error);
            return {release: null, completion: response};
        }
        if (!release) return {release: null, completion: response};

        const sent = release.catch(error => {
            const pending = this._pending.get(id);
            if (pending) {
                this._pending.delete(id);
                pending.reject(error);
            }
            throw error;
        });
        return {
            release: sent,
            completion: Promise.all([sent, response]).then(values => values[1])
        };
    }

    /**
     * Start one JSON-RPC notification. Its completion confirms only local
     * transport acceptance, never server-side success.
     * @param {string} method - JSON-RPC method.
     * @param {Array} params - positional params.
     * @returns {{release: ?Promise, completion: Promise}} send operation.
     * @private
     */
    _startNotification (method, params) {
        const guardError = this._sendGuardError(method);
        if (guardError) return {release: null, completion: Promise.reject(guardError)};
        let release;
        try {
            release = this._sendJsonRpc({jsonrpc: '2.0', method, params});
        } catch (error) {
            return {release: null, completion: Promise.reject(error)};
        }
        return {
            release,
            completion: release || Promise.resolve()
        };
    }

    /**
     * Register a send operation in connection order. `release` fences later
     * registrations; `completion` controls only the invoking Scratch block.
     * @param {function(): {release: ?Promise, completion: Promise}} start - operation factory.
     * @returns {Promise} operation completion.
     * @private
     */
    _enqueueOutbound (start) {
        if (this._outboundQueue.length >= OUTBOUND_QUEUE_LIMIT) {
            const error = new Error('McRemote outbound registration queue is full');
            error.reason = 'backpressure';
            if (this._socket && this._socket.readyState === WebSocket.OPEN) {
                this._socket.close(1011, error.reason);
            }
            return Promise.reject(error);
        }
        return new Promise((resolve, reject) => {
            this._outboundQueue.push({start, resolve, reject});
            this._drainOutboundQueue();
        });
    }

    /**
     * Drain registrations synchronously until a send or mode-transition fence
     * requires waiting.
     * @private
     */
    _drainOutboundQueue () {
        if (this._outboundQueueBusy) return;
        while (this._outboundQueue.length) {
            const entry = this._outboundQueue.shift();
            let operation;
            try {
                operation = entry.start();
            } catch (error) {
                entry.reject(error);
                continue;
            }
            Promise.resolve(operation.completion).then(entry.resolve, entry.reject);
            if (operation.release) {
                const generation = this._outboundQueueGeneration;
                this._outboundQueueBusy = true;
                Promise.resolve(operation.release)
                    .then(() => {}, () => {})
                    .then(() => {
                        if (generation !== this._outboundQueueGeneration) return;
                        this._outboundQueueBusy = false;
                        this._drainOutboundQueue();
                    });
                return;
            }
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
        if (this._isSessionSetupMethod(method)) return this._startRequest(method, params).completion;
        return this._enqueueOutbound(() => this._startRequest(method, params));
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

    whenPickaxePoke () {
        return true;
    }

    whenChatPosted () {
        return true;
    }

    whenProjectileHit () {
        return true;
    }

    eventValue (args, util) {
        const thread = util && util.thread;
        if (!thread || thread.updateMonitor || !thread.extensionContext) return '';
        return readEventValue(
            thread.extensionContext.mcremoteEvent,
            Cast.toString(args.PROPERTY)
        );
    }

    eventStatus (args) {
        return readEventStatusValue(this._eventStatus, Cast.toString(args.PROPERTY));
    }

    _setBuildContext (method, params) {
        return this._request(method, params).then(result => {
            this._buildContext = buildContext(result, `${method} result`);
        }, error => {
            log.warn(`McRemote: ${method} failed: ${error.reason || error.message}`);
        });
    }

    setDimension (args) {
        let dimension;
        try {
            dimension = dimensionRef(Cast.toString(args.DIMENSION));
        } catch (error) {
            log.warn(`McRemote: build.setDimension failed: ${error.reason || error.message}`);
            return Promise.resolve();
        }
        return this._setBuildContext('build.setDimension', [dimension]);
    }

    setBuildOrigin (args) {
        return this._setBuildContext('build.setOrigin', [
            Cast.toNumber(args.X),
            0,
            Cast.toNumber(args.Z)
        ]);
    }

    /**
     * @param {unknown} value - Scratch mode input.
     * @returns {string} one BuildMode value.
     * @throws {Error} when the input is not a supported mode.
     * @private
     */
    _parseBuildMode (value) {
        const mode = Cast.toString(value)
            .trim()
            .toUpperCase();
        if (Object.prototype.hasOwnProperty.call(BuildMode, mode)) return mode;
        const error = new Error('Build mode must be DEBUG, TRACE, or FAST');
        error.reason = 'invalid_build_mode';
        throw error;
    }

    /**
     * @param {unknown} value - Scratch TRACE delay input in seconds.
     * @returns {number} finite non-negative seconds.
     * @throws {Error} when the value cannot be applied exactly.
     * @private
     */
    _parseTraceDelay (value) {
        const text = typeof value === 'number' ? String(value) : Cast.toString(value).trim();
        const delay = text === '' ? NaN : Number(text);
        if (Number.isFinite(delay) && delay >= 0 && delay <= MAX_TRACE_DELAY_SECONDS) return delay;
        const error = new Error(`TRACE delay must be between 0 and ${MAX_TRACE_DELAY_SECONDS} seconds`);
        error.reason = 'invalid_trace_delay';
        throw error;
    }

    /**
     * Surface a local input or delivery failure. Delivery failures are shown
     * once for the connection which was closed to preserve finite buffering.
     * @param {string} method - local block or wire method.
     * @param {Error} error - failure.
     * @returns {Promise} resolved command-block completion.
     * @private
     */
    _actionableCommandError (method, error) {
        const isDeliveryFailure = error.reason === 'backpressure' || error.reason === 'capacity_exhausted';
        if (isDeliveryFailure && this._buildDeliveryNoticeShown) return Promise.resolve();
        if (isDeliveryFailure) this._buildDeliveryNoticeShown = true;
        log.warn(`McRemote: ${method} failed: ${error.reason || error.message}`);
        this._lastError = this._errorInfo(error);
        this._emitObservation();
        if (this.runtime && typeof this.runtime.emit === 'function') {
            this.runtime.emit(Runtime.MCREMOTE_ACTIONABLE_ERROR, this._lastError);
        }
        return Promise.resolve();
    }

    setBuildMode (args) {
        let mode;
        let traceDelaySeconds;
        try {
            mode = this._parseBuildMode(args.MODE);
            traceDelaySeconds = this._parseTraceDelay(args.TRACE_DELAY);
        } catch (error) {
            return this._actionableCommandError('setBuildMode', error);
        }

        return this._enqueueOutbound(() => {
            const flush = this._startRequest('connection.flush', []);
            const transition = flush.completion.then(() => {
                this._buildMode = mode;
                this._traceDelaySeconds = traceDelaySeconds;
            });
            return {release: transition, completion: transition};
        }).then(() => {}, error => this._actionableCommandError('setBuildMode', error));
    }

    flushBuildCommands () {
        return this._request('connection.flush', []).then(
            () => {},
            error => this._actionableCommandError('connection.flush', error)
        );
    }

    postToChat (args) {
        return this._commandRequest('chat.post', [Cast.toString(args.MSG)]);
    }

    _blockSpec (args) {
        const blockId = Cast.toString(args.BLOCK);
        const currentCatalog = this._catalogState.status === CatalogStatus.CURRENT &&
            this._catalogState.catalog && this._catalogState.catalog.block ?
            this._catalogState.catalog.block :
            null;
        return {
            block_id: blockId,
            state: parseStateText(
                typeof args.STATE === 'undefined' ? '' : Cast.toString(args.STATE),
                blockId,
                currentCatalog
            ).state
        };
    }

    /**
     * Register one setter using the mode in force at its position in the
     * connection send sequence.
     * @param {string} method - world.setBlock or world.setBlocks.
     * @param {Array} params - positional wire params.
     * @returns {Promise} command completion for the calling Scratch thread.
     * @private
     */
    _setBlockCommand (method, params) {
        return this._enqueueOutbound(() => {
            const mode = this._buildMode;
            const traceDelaySeconds = this._traceDelaySeconds;
            if (mode === BuildMode.FAST) return this._startNotification(method, params);

            const request = this._startRequest(method, params);
            if (mode !== BuildMode.TRACE) return request;
            return {
                release: request.release,
                completion: request.completion.then(() => this._delay(traceDelaySeconds * 1000))
            };
        }).then(() => {}, error => {
            if (error.reason === 'backpressure' || error.reason === 'capacity_exhausted') {
                this._actionableCommandError(method, error);
            } else {
                log.warn(`McRemote: ${method} failed: ${error.reason || error.message}`);
            }
        });
    }

    setBlock (args) {
        let blockSpec;
        try {
            blockSpec = this._blockSpec(args);
        } catch (error) {
            return this._actionableCommandError('world.setBlock', error);
        }
        return this._setBlockCommand('world.setBlock', [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z),
            blockSpec
        ]);
    }

    setBlocks (args) {
        let blockSpec;
        try {
            blockSpec = this._blockSpec(args);
        } catch (error) {
            return this._actionableCommandError('world.setBlocks', error);
        }
        return this._setBlockCommand('world.setBlocks', [
            Cast.toNumber(args.X1),
            Cast.toNumber(args.Y1),
            Cast.toNumber(args.Z1),
            Cast.toNumber(args.X2),
            Cast.toNumber(args.Y2),
            Cast.toNumber(args.Z2),
            blockSpec
        ]);
    }

    _getBlockInfo (args, util) {
        const params = [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z)
        ];
        const isMonitorPoll = Boolean(util && util.thread && util.thread.updateMonitor);
        const cacheKey = params.join(',');
        if (isMonitorPoll) {
            const cached = this._blockInfoMonitorCache.get(cacheKey);
            if (cached && (Date.now() - cached.fetchedAt) < BLOCK_INFO_MONITOR_THROTTLE_MS) {
                return Promise.resolve(cached.value);
            }
            const pending = this._blockInfoMonitorPending.get(cacheKey);
            if (pending) return pending;
        }
        const request = this._request('world.getBlock', params).then(result => {
            try {
                return formatBlockInfoText(result);
            } catch (error) {
                return makeErrorText(error && error.reason ? error.reason : 'invalid_block_info');
            }
        }, error => remoteErrorText(error));
        if (!isMonitorPoll) return request;
        const monitored = request.then(value => {
            if (this._blockInfoMonitorPending.get(cacheKey) !== monitored) return value;
            this._blockInfoMonitorPending.delete(cacheKey);
            this._blockInfoMonitorCache.set(cacheKey, {value, fetchedAt: Date.now()});
            return value;
        });
        this._blockInfoMonitorPending.set(cacheKey, monitored);
        return monitored;
    }

    getBlock (args, util) {
        return this._getBlockInfo(args, util);
    }

    getBlocks (args, util) {
        const params = [
            Cast.toNumber(args.X1),
            Cast.toNumber(args.Y1),
            Cast.toNumber(args.Z1),
            Cast.toNumber(args.X2),
            Cast.toNumber(args.Y2),
            Cast.toNumber(args.Z2)
        ];
        const listReference = args.LIST;
        const list = util && util.target && listReference &&
            typeof util.target.lookupOrCreateList === 'function' ?
            util.target.lookupOrCreateList(listReference.id, listReference.name) :
            null;
        if (!list) {
            const error = new Error('McRemote block list is unavailable');
            error.reason = 'invalid_output_list';
            return this._actionableCommandError('world.getBlocks', error);
        }

        return this._request('world.getBlocks', params).then(result => {
            try {
                if (!Array.isArray(result)) throw new Error('world.getBlocks result must be an array');
                const values = result.map(formatBlockInfoText);
                if (params.every(Number.isInteger)) {
                    const expectedLength = (Math.abs(params[3] - params[0]) + 1) *
                        (Math.abs(params[4] - params[1]) + 1) *
                        (Math.abs(params[5] - params[2]) + 1);
                    if (values.length !== expectedLength) {
                        throw new Error('world.getBlocks result length does not match its inclusive bounds');
                    }
                }
                list.value = values;
                list._monitorUpToDate = false;
            } catch (error) {
                error.reason = error.reason || 'invalid_block_info';
                return this._actionableCommandError('world.getBlocks', error);
            }
        }, error => this._actionableCommandError('world.getBlocks', error));
    }

    _getHeight (params, util) {
        const isMonitorPoll = Boolean(util && util.thread && util.thread.updateMonitor);
        const cacheKey = params.join(',');
        if (isMonitorPoll) {
            const cached = this._heightMonitorCache.get(cacheKey);
            if (cached && (Date.now() - cached.fetchedAt) < HEIGHT_MONITOR_THROTTLE_MS) {
                return Promise.resolve(cached.value);
            }
            const pending = this._heightMonitorPending.get(cacheKey);
            if (pending) return pending;
        }

        const request = this._request('world.getHeight', params).then(result => {
            if (!Number.isInteger(result)) return makeErrorText('remote_error');
            this._heightNotFoundNoticeKeys.delete(cacheKey);
            return result;
        }, error => {
            if (error.reason === 'height_not_found' && !this._heightNotFoundNoticeKeys.has(cacheKey)) {
                this._heightNotFoundNoticeKeys.add(cacheKey);
                this._actionableCommandError('world.getHeight', error);
            }
            return remoteErrorText(error);
        });
        if (!isMonitorPoll) return request;
        const monitored = request.then(value => {
            if (this._heightMonitorPending.get(cacheKey) !== monitored) return value;
            this._heightMonitorPending.delete(cacheKey);
            this._heightMonitorCache.set(cacheKey, {value, fetchedAt: Date.now()});
            return value;
        });
        this._heightMonitorPending.set(cacheKey, monitored);
        return monitored;
    }

    getHeight (args, util) {
        return this._getHeight([
            Cast.toNumber(args.X),
            Cast.toNumber(args.Z)
        ], util);
    }

    getHeightBelow (args, util) {
        return this._getHeight([
            Cast.toNumber(args.X),
            Cast.toNumber(args.Z),
            Cast.toNumber(args.MAX_Y)
        ], util);
    }

    blockInfoId (args) {
        return blockInfoId(Cast.toString(args.BLOCK_INFO));
    }

    blockInfoState (args) {
        return blockInfoState(Cast.toString(args.BLOCK_INFO));
    }

    blockInfoStateProperty (args) {
        return blockInfoStateProperty(
            Cast.toString(args.BLOCK_INFO),
            Cast.toString(args.PROPERTY)
        );
    }

    blockInfoHasStateProperty (args) {
        return blockInfoHasStateProperty(
            Cast.toString(args.BLOCK_INFO),
            Cast.toString(args.PROPERTY)
        );
    }

    getSign (args) {
        const params = [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z)
        ];
        return this._request('world.getSign', params).then(result => {
            try {
                return formatSignInfoText(result);
            } catch (error) {
                return makeErrorText(error && error.reason ? error.reason : 'invalid_sign_info');
            }
        }, error => remoteErrorText(error));
    }

    /**
     * Validate a Scratch sign face menu selection.
     * @param {string} value - FACE argument.
     * @returns {string} the validated face.
     * @private
     */
    _signFace (value) {
        if (SIGN_FACES.includes(value)) return value;
        const error = new Error(`Sign face must be one of: ${SIGN_FACES.join(', ')}`);
        error.reason = 'invalid_sign_face';
        throw error;
    }

    /**
     * Validate a Scratch sign line index menu selection.
     * @param {string|number} value - LINE argument.
     * @returns {number} the validated 0-based line index.
     * @private
     */
    _signLineIndex (value) {
        const index = Cast.toNumber(value);
        if (SIGN_LINE_INDICES.includes(index)) return index;
        const error = new Error('Sign line index must be an integer between 0 and 3');
        error.reason = 'invalid_sign_line';
        throw error;
    }

    setSign (args) {
        let face;
        try {
            face = this._signFace(args.FACE);
        } catch (error) {
            return this._actionableCommandError('world.setSign', error);
        }
        return this._setBlockCommand('world.setSign', [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z),
            {
                [face]: [
                    Cast.toString(args.LINE0),
                    Cast.toString(args.LINE1),
                    Cast.toString(args.LINE2),
                    Cast.toString(args.LINE3)
                ]
            }
        ]);
    }

    updateSignLine (args) {
        let face;
        let lineIndex;
        try {
            face = this._signFace(args.FACE);
            lineIndex = this._signLineIndex(args.LINE);
        } catch (error) {
            return this._actionableCommandError('world.updateSignLine', error);
        }
        return this._setBlockCommand('world.updateSignLine', [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z),
            face,
            lineIndex,
            Cast.toString(args.TEXT)
        ]);
    }

    signLineText (args) {
        return signLineText(Cast.toString(args.SIGN_INFO), Cast.toString(args.FACE), Cast.toNumber(args.LINE));
    }

    signLineColor (args) {
        return signLineColor(Cast.toString(args.SIGN_INFO), Cast.toString(args.FACE), Cast.toNumber(args.LINE));
    }

    signLineHasDecoration (args) {
        return signLineHasDecoration(
            Cast.toString(args.SIGN_INFO),
            Cast.toString(args.FACE),
            Cast.toNumber(args.LINE),
            Cast.toString(args.DECORATION)
        );
    }

    signIsWaxed (args) {
        return signIsWaxed(Cast.toString(args.SIGN_INFO));
    }

    isMcRemoteError (args) {
        return isErrorText(Cast.toString(args.VALUE));
    }

    spawnParticle (args) {
        const params = [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z),
            Cast.toNumber(args.OFFSET_X),
            Cast.toNumber(args.OFFSET_Y),
            Cast.toNumber(args.OFFSET_Z),
            Cast.toString(args.PARTICLE),
            Cast.toNumber(args.SPEED),
            Cast.toNumber(args.COUNT)
        ];
        if (typeof args.FORCE !== 'undefined') params.push(Cast.toBoolean(args.FORCE));
        return this._commandRequest('world.spawnParticle', params);
    }

    spawnEntity (args, util) {
        const variableReference = args.VARIABLE;
        const variable = util && util.target && variableReference &&
            typeof util.target.lookupOrCreateVariable === 'function' ?
            util.target.lookupOrCreateVariable(variableReference.id, variableReference.name) :
            null;
        if (!variable || variable.isCloud) {
            const error = new Error('McRemote entity handles require a non-cloud variable');
            error.reason = 'invalid_output_variable';
            return this._actionableCommandError('world.spawnEntity', error);
        }

        return this._request('world.spawnEntity', [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z),
            Cast.toString(args.ENTITY)
        ]).then(handle => {
            variable.value = typeof handle === 'string' && /^mcr_eh_[\x21-\x7e]+$/.test(handle) ?
                handle :
                makeErrorText('remote_error');
        }, error => {
            variable.value = remoteErrorText(error);
        });
    }

    _directionReporter (method, params, axis) {
        const index = DIRECTION_AXES.indexOf(Cast.toString(axis));
        if (index < 0) return Promise.resolve(makeErrorText('invalid_params'));
        return this._request(method, params).then(result => {
            try {
                return directionResult(result)[index];
            } catch (error) {
                return remoteErrorText(error);
            }
        }, error => remoteErrorText(error));
    }

    _directionCommand (method, params) {
        return this._request(method, params).then(result => {
            try {
                directionResult(result);
            } catch (error) {
                return this._actionableCommandError(method, error);
            }
        }, error => this._actionableCommandError(method, error));
    }

    playerDirection (args) {
        return this._directionReporter('player.getDirection', [], args.AXIS);
    }

    setPlayerDirection (args) {
        return this._directionCommand('player.setDirection', [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z)
        ]);
    }

    entityDirection (args) {
        return this._directionReporter(
            'entity.getDirection',
            [Cast.toString(args.HANDLE)],
            args.AXIS
        );
    }

    setEntityDirection (args) {
        return this._directionCommand('entity.setDirection', [
            Cast.toString(args.HANDLE),
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z)
        ]);
    }

    strikeLightning (args) {
        const method = 'world.strikeLightning';
        return this._request(method, [
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z)
        ]).then(result => {
            if (result === null) return;
            const error = new Error('Invalid lightning result');
            error.reason = 'invalid_response';
            return this._actionableCommandError(method, error);
        }, error => this._actionableCommandError(method, error));
    }

    /**
     * Fetch the paired player's current dimension/position. Monitor-driven calls
     * (a checked stage monitor re-evaluates its reporter on every runtime
     * step) reuse a cached result for PLAYER_POS_MONITOR_THROTTLE_MS instead
     * of issuing a fresh bridge request; explicit script calls always fetch.
     * @param {BlockUtility} util - execution context for this block call.
     * @returns {Promise} resolves with the `player.getPos` result.
     * @private
     */
    _getPlayerPos (util) {
        const isMonitorPoll = Boolean(util && util.thread && util.thread.updateMonitor);
        if (isMonitorPoll && this._playerPosCache &&
            (Date.now() - this._playerPosCache.fetchedAt) < PLAYER_POS_MONITOR_THROTTLE_MS) {
            return Promise.resolve(this._playerPosCache.result);
        }
        return this._request('player.getPos', []).then(result => {
            const parsed = playerResult(result, false);
            this._playerPosCache = {result: parsed, fetchedAt: Date.now()};
            return parsed;
        });
    }

    /**
     * Fetch the paired player's current dimension, position and orientation.
     * Monitor-driven calls share a short-lived pose cache; explicit script
     * calls always fetch.
     * @param {BlockUtility} util - execution context for this block call.
     * @returns {Promise} resolves with the `player.getPose` result.
     * @private
     */
    _getPlayerPose (util) {
        const isMonitorPoll = Boolean(util && util.thread && util.thread.updateMonitor);
        if (isMonitorPoll && this._playerPoseCache &&
            (Date.now() - this._playerPoseCache.fetchedAt) < PLAYER_POSE_MONITOR_THROTTLE_MS) {
            return Promise.resolve(this._playerPoseCache.result);
        }
        return this._request('player.getPose', []).then(result => {
            const parsed = playerResult(result, true);
            this._playerPoseCache = {result: parsed, fetchedAt: Date.now()};
            return parsed;
        });
    }

    playerAttribute (args, util) {
        const property = Cast.toString(args.PROPERTY);
        const request = property === 'yaw' || property === 'pitch' ?
            this._getPlayerPose(util) :
            this._getPlayerPos(util);
        return request.then(result => {
            if (property === 'dimension') {
                return result.dimension;
            }
            if (property === 'yaw' || property === 'pitch') {
                return result && typeof result[property] === 'number' ? result[property] : '';
            }
            const index = {x: 0, y: 1, z: 2}[property];
            return result && Array.isArray(result.pos) && typeof index !== 'undefined' ?
                result.pos[index] :
                '';
        }, () => '');
    }

    setPlayerPos (args) {
        return this._commandRequest('player.setPos', [
            dimensionRef(Cast.toString(args.DIMENSION)),
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z)
        ]);
    }

    setPlayerPose (args) {
        return this._commandRequest('player.setPose', [
            dimensionRef(Cast.toString(args.DIMENSION)),
            Cast.toNumber(args.X),
            Cast.toNumber(args.Y),
            Cast.toNumber(args.Z),
            Cast.toNumber(args.YAW),
            Cast.toNumber(args.PITCH)
        ]);
    }

    setPlayerXYZ (args) {
        return this._request('player.getPos', []).then(
            result => this._commandRequest('player.setPos', [
                playerResult(result, false).dimension,
                Cast.toNumber(args.X),
                Cast.toNumber(args.Y),
                Cast.toNumber(args.Z)
            ]),
            error => {
                log.warn(`McRemote: player.getPos failed before setPlayerXYZ: ${error.reason || error.message}`);
            }
        );
    }
}

// Exposed so tests can build protocol-version-aware fixtures/mocks instead of
// hardcoding a major version that will silently go stale on the next bump.
Scratch3McRemoteBlocks.PROTOCOL_VERSION = PROTOCOL_VERSION;

module.exports = Scratch3McRemoteBlocks;
