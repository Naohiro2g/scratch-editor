const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const log = require('../../util/log');

/**
 * Default Scratch Bridge endpoint. The bridge terminates wss from the browser
 * and forwards to the McRemote plugin over plain TCP (see protocol v1 draft).
 * @type {string}
 */
const DEFAULT_BRIDGE_URL = 'wss://scratch-bridge.mc-remote.com';

/**
 * Protocol v1 (DRAFT). The extension speaks a JSON envelope to the bridge; the
 * bridge maps each message 1:1 onto the existing RaspberryJuice-style TCP
 * command set so that the same protocol works bridge-relayed or direct.
 *
 *   hello          -> auth (pair / session_token) + sandbox + build context
 *   chat.post      -> ("msg")                        // no reply
 *   world.setBlock -> (x,y,z,id,[data])              // no reply
 *   world.setBlocks-> (x0,y0,z0,x1,y1,z1,id,[data])  // no reply
 *   world.getBlock -> (x,y,z) => id:int              // reply
 *
 * The exact envelope shape is pending confirmation in mc-remote-knowledge
 * (13-scratch-client). This scaffold sends `{cmd, args}` lines.
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
         * Pending getBlock-style requests awaiting a reply line, keyed by id.
         * @type {Map<number, {resolve: Function, reject: Function}>}
         * @private
         */
        this._pending = new Map();

        /**
         * Monotonic request id for reply correlation.
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
                        // eslint-disable-next-line @stylistic/max-len
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
            });
        });
    }

    /**
     * Send the protocol v1 hello handshake.
     * TODO(protocol-v1): carry auth (pair / session_token) and build context
     * (setWorld / setBuildOrigin equivalents). Pending knowledge-repo spec.
     * @param {string} [sandbox] - optional named sandbox to target.
     * @returns {Promise} resolves when the handshake is acknowledged.
     * @private
     */
    _hello (sandbox) {
        return this._request('hello', sandbox ? [sandbox] : []);
    }

    /**
     * Handle an inbound message line from the bridge, correlating replies.
     * @param {MessageEvent} event - the socket message event.
     * @private
     */
    _onMessage (event) {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch (e) {
            log.warn(`McRemote: dropping non-JSON bridge message: ${event.data}`);
            return;
        }
        const pending = this._pending.get(msg.id);
        if (!pending) return;
        this._pending.delete(msg.id);
        if (msg.error) {
            pending.reject(new Error(msg.error));
        } else {
            pending.resolve(msg.result);
        }
    }

    /**
     * Send a command and await its reply (for getBlock-style commands).
     * @param {string} cmd - the protocol v1 command name.
     * @param {Array} args - positional arguments.
     * @returns {Promise} resolves with the reply result.
     * @private
     */
    _request (cmd, args) {
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('not connected to bridge'));
        }
        const id = this._nextRequestId++;
        return new Promise((resolve, reject) => {
            this._pending.set(id, {resolve, reject});
            this._socket.send(JSON.stringify({id, cmd, args}));
        });
    }

    /**
     * Send a fire-and-forget command (no reply expected).
     * @param {string} cmd - the protocol v1 command name.
     * @param {Array} args - positional arguments.
     * @private
     */
    _send (cmd, args) {
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
            log.warn(`McRemote: ${cmd} dropped, not connected to bridge`);
            return;
        }
        this._socket.send(JSON.stringify({cmd, args}));
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
