const test = require('tap').test;
const McRemote = require('../../src/extensions/scratch3_mcremote/index.js');
const Runtime = require('../../src/engine/runtime');

/**
 * Minimal WebSocket stand-in driven synchronously by the tests. The extension
 * only uses addEventListener, send, readyState and the static OPEN constant.
 */
class FakeWebSocket {
    constructor (url) {
        this.url = url;
        this.readyState = 0; // CONNECTING
        this.sent = [];
        this._listeners = {};
        FakeWebSocket.instances.push(this);
    }
    addEventListener (type, cb) {
        (this._listeners[type] = this._listeners[type] || []).push(cb);
    }
    send (data) {
        this.sent.push(data);
    }
    _emit (type, event) {
        (this._listeners[type] || []).forEach(cb => cb(event));
    }
    fireOpen () {
        this.readyState = FakeWebSocket.OPEN;
        this._emit('open');
    }
    fireMessage (obj) {
        this._emit('message', {data: JSON.stringify(obj)});
    }
    fireClose (event) {
        this.readyState = 3; // CLOSED
        this._emit('close', event);
    }
    lastSent () {
        return JSON.parse(this.sent[this.sent.length - 1]);
    }
}
FakeWebSocket.OPEN = 1;
FakeWebSocket.instances = [];

global.WebSocket = FakeWebSocket;

class FakeLocalStorage {
    constructor () {
        this._items = {};
    }
    getItem (key) {
        return Object.prototype.hasOwnProperty.call(this._items, key) ? this._items[key] : null;
    }
    setItem (key, value) {
        this._items[key] = String(value);
    }
    removeItem (key) {
        delete this._items[key];
    }
    clear () {
        this._items = {};
    }
}

global.localStorage = new FakeLocalStorage();

const nextTurn = () => Promise.resolve().then(() => {});
const DEFAULT_SANDBOX_ROUTE = 'sb.mc-remote.com';
const sessionTokenKey = sandboxRoute => `mcremote.sessionToken.v1:${encodeURIComponent(sandboxRoute)}`;

const newRuntime = () => ({
    startedHats: [],
    emitted: [],
    emit (event, payload) {
        this.emitted.push({event, payload});
    },
    startHats (opcode) {
        this.startedHats.push(opcode);
    }
});

const observations = runtime => runtime.emitted
    .filter(event => event.event === Runtime.MCREMOTE_OBSERVATION_UPDATE)
    .map(event => event.payload);

const latestObservation = runtime => observations(runtime).slice(-1)[0];

const newConnectedBlocks = runtime => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote(runtime || {});
    const connected = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    // hello is the first message; ack it so connect() resolves.
    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '21.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            catalogHash: null,
            world_constants: {y_sea: 63}
        }});
    return connected.then(() => ({blocks, socket}));
};

test('hello uses a JSON-RPC 2.0 request with protocol 21.0.0', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    t.equal(socket.url, `wss://bridge.mc-remote.com/?sandbox=${DEFAULT_SANDBOX_ROUTE}`);
    const hello = socket.lastSent();
    t.equal(hello.jsonrpc, '2.0');
    t.equal(hello.id, 1, 'client-numbered id starts at 1');
    t.equal(hello.method, 'hello');
    t.equal(hello.params.protocol, '21.0.0', 'clean protocol semver, no channel suffix');
    t.equal(hello.params.client.name, 'scratch-mcremote');
    t.equal(hello.params.client.version, '2100.0.0b2', 'client build label is diagnostic only');
    t.equal(hello.params.sandbox, void 0, 'sandbox routing is not part of hello');
    t.end();
});

test('connect uses the runtime McRemote connection target', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    runtime.getMcRemoteConnectionTarget = () => ({
        sandboxRoute: 'sb-dev.mc-remote.com',
        label: 'Development Sandbox'
    });
    const blocks = new McRemote(runtime);
    blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    t.equal(socket.url, 'wss://bridge.mc-remote.com/?sandbox=sb-dev.mc-remote.com');
    t.same(latestObservation(runtime).connectionTarget, {
        sandboxRoute: 'sb-dev.mc-remote.com',
        label: 'Development Sandbox'
    });
    t.equal(socket.lastSent().params.sandbox, void 0, 'hello payload stays route-free');
    t.end();
});

test('connect uses the runtime-configured bridge and default sandbox', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    runtime.getMcRemoteRuntimeConfig = () => ({
        bridgeUrl: 'wss://bridge.classroom.example/ws',
        defaultSandbox: 'minecraft.classroom.example',
        connectionEnabled: true,
        releaseIdentity: 'test-release'
    });
    const blocks = new McRemote(runtime);
    blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    t.equal(
        socket.url,
        'wss://bridge.classroom.example/ws?sandbox=minecraft.classroom.example'
    );
    t.equal(socket.lastSent().params.client.version, 'test-release');
    t.end();
});

test('disabled runtime config refuses before opening a WebSocket', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    runtime.getMcRemoteRuntimeConfig = () => ({
        bridgeUrl: 'wss://bridge.mc-remote.com',
        defaultSandbox: DEFAULT_SANDBOX_ROUTE,
        connectionEnabled: false,
        releaseIdentity: 'showcase'
    });
    const blocks = new McRemote(runtime);

    return t.rejects(blocks.connect(), /disabled by this deployment profile/).then(() => {
        t.equal(FakeWebSocket.instances.length, 0, 'no connection is attempted');
    });
});

test('hello includes a saved session token when available', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_saved');
    const blocks = new McRemote({});
    blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    const hello = socket.lastSent();
    t.same(hello.params.auth, {token: 'mcrs_saved'});
    t.end();
});

test('hello reads only the token scoped to the current sandbox route', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_default');
    global.localStorage.setItem(sessionTokenKey('sb-dev.mc-remote.com'), 'mcrs_dev');
    const runtime = newRuntime();
    runtime.getMcRemoteConnectionTarget = () => ({
        sandboxRoute: 'sb-dev.mc-remote.com',
        label: ''
    });
    const blocks = new McRemote(runtime);
    blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    const hello = socket.lastSent();
    t.same(hello.params.auth, {token: 'mcrs_dev'});
    t.end();
});

test('McRemote observation logs hello frames and redacts session tokens', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_saved');
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);
    const result = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    const helloSent = latestObservation(runtime);
    t.equal(helloSent.status, 'disconnected');
    t.equal(helloSent.frameLog.length, 1);
    t.equal(helloSent.frameLog[0].streamId, 'default');
    t.equal(helloSent.frameLog[0].direction, 'send');
    t.equal(helloSent.frameLog[0].method, 'hello');
    t.same(helloSent.frameLog[0].payload.params.auth, {token: '[redacted]'});
    t.equal(JSON.stringify(helloSent).indexOf('mcrs_saved'), -1, 'saved token is never exposed');

    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '21.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            catalogHash: null,
            world_constants: {y_sea: 63},
            permissions: {build: true}
        }});

    return result.then(() => {
        const connected = latestObservation(runtime);
        t.equal(connected.status, 'connected');
        t.same(connected.hello, {
            protocol: '21.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            world_constants: {y_sea: 63},
            permissions: {build: true}
        });
        t.equal(connected.frameLog.length, 2);
        t.equal(connected.frameLog[1].direction, 'receive');
        t.equal(connected.frameLog[1].method, 'hello');
        t.end();
    });
});

test('McRemote observation normalizes top-level y_sea into world constants', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);
    const result = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '21.0.0',
            mc_version: '26.1.2',
            supported_mc_versions: ['1.21.11'],
            y_sea: 63,
            catalogHash: null,
            world: 'world',
            origin: [200, 0, 200]
        }});

    return result.then(() => {
        t.same(latestObservation(runtime).hello.world_constants, {y_sea: 63});
        t.end();
    });
});

test('auth_required starts pair flow, stores token, retries hello and fires the hat', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);
    const result = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    t.equal(socket.lastSent().method, 'hello');
    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        error: {
            code: -32000,
            message: 'auth required',
            data: {reason: 'auth_required'}
        }});

    return nextTurn()
        .then(() => {
            const pairBegin = socket.lastSent();
            t.equal(pairBegin.method, 'auth.pairBegin');
            t.same(pairBegin.params.token_type, 'session');
            t.equal(pairBegin.params.client.name, 'scratch-mcremote');
            t.equal(latestObservation(runtime).status, 'pairing');
            socket.fireMessage({jsonrpc: '2.0',
                id: 2,
                result: {pairing_id: 'pair-1', pair_code: '827419', expires_in: 120}});
            return nextTurn();
        })
        .then(() => {
            t.equal(blocks.pairCode(), '827-419');
            t.equal(blocks.pairCommand(), '/mcremote pair 827-419');
            t.equal(latestObservation(runtime).pairCode, '827-419');
            t.equal(latestObservation(runtime).pairCommand, '/mcremote pair 827-419');
            const pairPoll = socket.lastSent();
            t.equal(pairPoll.method, 'auth.pairPoll');
            t.same(pairPoll.params, {pairing_id: 'pair-1'});
            socket.fireMessage({jsonrpc: '2.0',
                id: 3,
                result: {status: 'ok', token: 'mcrs_new'}});
            return nextTurn();
        })
        .then(() => {
            const retryHello = socket.lastSent();
            t.equal(retryHello.method, 'hello');
            t.same(retryHello.params.auth, {token: 'mcrs_new'});
            t.equal(global.localStorage.getItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE)), 'mcrs_new');
            t.same(runtime.startedHats, ['mcremote_whenPaired']);
            socket.fireMessage({jsonrpc: '2.0',
                id: 4,
                result: {
                    protocol: '21.0.0',
                    mc_version: '1.21.11',
                    supported_mc_versions: ['1.21.11'],
                    catalogHash: null,
                    world_constants: {y_sea: 63}
                }});
            return result;
        })
        .then(value => {
            t.equal(value, void 0);
            t.equal(latestObservation(runtime).status, 'connected');
            t.equal(latestObservation(runtime).pairCode, '');
            t.equal(JSON.stringify(latestObservation(runtime)).indexOf('mcrs_new'), -1, 'new token is never exposed');
            t.end();
        });
});

test('auth errors clear only the token scoped to the current sandbox route', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_bad');
    global.localStorage.setItem(sessionTokenKey('sb-dev.mc-remote.com'), 'mcrs_dev');
    const blocks = new McRemote({});
    blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        error: {
            code: -32000,
            message: 'token invalid',
            data: {reason: 'token_invalid'}
        }});
    return nextTurn().then(() => {
        t.equal(global.localStorage.getItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE)), null);
        t.equal(global.localStorage.getItem(sessionTokenKey('sb-dev.mc-remote.com')), 'mcrs_dev');
        t.end();
    });
});

test('non-auth hello errors surface as connection errors without clearing the sandbox token', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_allowed');
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);
    const result = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        error: {
            code: -32003,
            message: 'permission denied',
            data: {reason: 'permission_denied'}
        }});

    return result.then(
        () => t.fail('should have rejected'),
        err => {
            const observation = latestObservation(runtime);
            t.equal(err.reason, 'permission_denied');
            t.equal(observation.status, 'error');
            t.equal(observation.lastError.reason, 'permission_denied');
            t.equal(global.localStorage.getItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE)), 'mcrs_allowed');
            t.end();
        }
    );
});

test('commands are not sent after hello fails before connection is established', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_allowed');
    const blocks = new McRemote({});
    const connection = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        error: {
            code: -32000,
            message: 'permission_denied',
            data: {reason: 'permission_denied'}
        }});

    const command = blocks.postToChat({MSG: 'test'});
    return Promise.all([
        connection.then(
            () => t.fail('connection should have rejected'),
            err => t.equal(err.reason, 'permission_denied')
        ),
        command
    ]).then(() => {
        t.equal(socket.sent.length, 1);
        t.equal(socket.lastSent().method, 'hello');
        t.end();
    });
});

test('connectTo forwards the sandbox name in the bridge URL query', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    blocks.connectTo({NAME: 'sb2.mc-remote.com'});
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    t.equal(socket.url, 'wss://bridge.mc-remote.com/?sandbox=sb2.mc-remote.com');
    t.equal(socket.lastSent().params.sandbox, void 0, 'hello payload stays route-free');
    t.end();
});

test('connectTo URL-encodes the sandbox route hint', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    blocks.connectTo({NAME: 'sb dev.mc-remote.com'});
    const socket = FakeWebSocket.instances[0];
    t.equal(socket.url, 'wss://bridge.mc-remote.com/?sandbox=sb+dev.mc-remote.com');
    t.end();
});

test('connect block resolves without exposing the hello result', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    const result = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '21.0.0',
            mc_version: '1.21.11',
            catalogHash: null,
            world_constants: {y_sea: 63}
        }});
    return result.then(value => {
        t.equal(value, void 0);
        t.end();
    });
});

test('commands are not sent before hello completes', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    const result = blocks.postToChat({MSG: 'too early'});

    return result.then(() => {
        t.equal(socket.sent.length, 1);
        t.equal(socket.lastSent().method, 'hello');
        t.end();
    });
});

test('connect block reuses an in-flight connection instead of opening a duplicate socket', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    const first = blocks.connect();
    const second = blocks.connect();
    const socket = FakeWebSocket.instances[0];

    t.equal(FakeWebSocket.instances.length, 1);
    socket.fireOpen();
    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '21.0.0',
            mc_version: '1.21.11',
            catalogHash: null,
            world_constants: {y_sea: 63}
        }});
    return Promise.all([first, second]).then(() => {
        t.equal(FakeWebSocket.instances.length, 1);
        t.end();
    });
});

test('connect block reuses an open connection instead of opening a duplicate socket', t =>
    newConnectedBlocks().then(({blocks}) => blocks.connect().then(() => {
        t.equal(FakeWebSocket.instances.length, 1);
        t.end();
    }))
);

test('close before hello rejects the connect block instead of hanging', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    const result = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireClose();

    return result.then(
        () => t.fail('should have rejected'),
        err => {
            t.match(err.message, /closed/);
            t.end();
        }
    );
});

test('connectTo is kept as a hidden debug block with the default sandbox route', t => {
    global.localStorage.clear();
    const blocks = new McRemote({});
    const connectTo = blocks.getInfo().blocks.find(block => block.opcode === 'connectTo');
    t.equal(connectTo.hideFromPalette, true);
    t.equal(connectTo.arguments.NAME.defaultValue, 'sb.mc-remote.com');
    t.end();
});

test('build world block uses the fixed dimension menu values', t => {
    global.localStorage.clear();
    const blocks = new McRemote({});
    const info = blocks.getInfo();
    const setWorld = info.blocks.find(block => block.opcode === 'setWorld');
    t.equal(setWorld.arguments.WORLD.defaultValue, 'overworld');
    t.same(info.menus.worlds.items.map(item => item.value), ['overworld', 'nether', 'the_end']);
    t.end();
});

test('setBuildOrigin block shows the fixed y value', t => {
    global.localStorage.clear();
    const blocks = new McRemote({});
    const setBuildOrigin = blocks.getInfo().blocks.find(block => block.opcode === 'setBuildOrigin');
    t.equal(setBuildOrigin.text, 'set build origin (X, Y, Z) to [X], 0, [Z]');
    t.same(Object.keys(setBuildOrigin.arguments), ['X', 'Z']);
    t.end();
});

test('pairing reporter blocks are exposed', t => {
    global.localStorage.clear();
    const blocks = new McRemote({});
    const info = blocks.getInfo();
    t.ok(info.blocks.find(block => block.opcode === 'pairCode'));
    t.ok(info.blocks.find(block => block.opcode === 'pairCommand'));
    t.ok(info.blocks.find(block => block.opcode === 'whenPaired'));
    t.end();
});

test('setWorld is an acknowledged build-state request', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setWorld({WORLD: 'nether'});
        const msg = socket.lastSent();
        t.equal(msg.jsonrpc, '2.0');
        t.equal(msg.method, 'build.setWorld');
        t.equal(msg.id, 2, 'build state changes wait for acknowledgement');
        t.same(msg.params, ['nether']);
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: {ok: true}});
        return result.then(value => {
            t.equal(value, void 0);
            t.end();
        });
    })
);

test('reconnect reuses the sandbox token and starts build state from defaults', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_saved');
        const setWorld = blocks.setWorld({WORLD: 'nether'});
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: {ok: true}});
        return setWorld.then(() => {
            socket.fireClose();
            const reconnect = blocks.connect();
            const nextSocket = FakeWebSocket.instances[1];
            nextSocket.fireOpen();

            const hello = nextSocket.lastSent();
            t.equal(hello.id, 1, 'request ids reset per connection');
            t.equal(hello.method, 'hello');
            t.same(hello.params.auth, {token: 'mcrs_saved'});
            t.equal(nextSocket.sent.length, 1, 'build state is not replayed automatically');

            nextSocket.fireMessage({jsonrpc: '2.0',
                id: 1,
                result: {
                    protocol: '21.0.0',
                    mc_version: '1.21.11',
                    supported_mc_versions: ['1.21.11'],
                    catalogHash: null,
                    world_constants: {y_sea: 63}
                }});
            return reconnect;
        }).then(() => t.end());
    })
);

test('sandbox switch uses the token scoped to the newly selected route', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_default');
        global.localStorage.setItem(sessionTokenKey('sb-dev.mc-remote.com'), 'mcrs_dev');
        blocks.runtime.getMcRemoteConnectionTarget = () => ({
            sandboxRoute: 'sb-dev.mc-remote.com',
            label: 'Development Sandbox'
        });
        socket.fireClose();

        const reconnect = blocks.connect();
        const nextSocket = FakeWebSocket.instances[1];
        nextSocket.fireOpen();
        t.equal(nextSocket.url, 'wss://bridge.mc-remote.com/?sandbox=sb-dev.mc-remote.com');
        t.same(nextSocket.lastSent().params.auth, {token: 'mcrs_dev'});
        nextSocket.fireMessage({jsonrpc: '2.0',
            id: 1,
            result: {
                protocol: '21.0.0',
                mc_version: '1.21.11',
                supported_mc_versions: ['1.21.11'],
                catalogHash: null,
                world_constants: {y_sea: 63}
            }});
        return reconnect.then(() => t.end());
    })
);

test('permission_denied does not clear the current sandbox token', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_allowed');
        const result = blocks.setWorld({WORLD: 'nether'});
        socket.fireMessage({jsonrpc: '2.0',
            id: 2,
            error: {
                code: -32003,
                message: 'permission denied',
                data: {reason: 'permission_denied'}
            }});
        return result.then(() => {
            t.equal(global.localStorage.getItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE)), 'mcrs_allowed');
            t.end();
        });
    })
);

test('setBuildOrigin seals y at 0 for Scratch', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setBuildOrigin({X: 240, Z: 260});
        const msg = socket.lastSent();
        t.equal(msg.method, 'build.setOrigin');
        t.equal(msg.id, 2, 'build state changes wait for acknowledgement');
        t.same(msg.params, [240, 0, 260]);
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return result.then(() => t.end());
    })
);

test('postToChat is an acknowledged request', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.postToChat({MSG: 'hello'});
        const msg = socket.lastSent();
        t.equal(msg.jsonrpc, '2.0');
        t.equal(msg.method, 'chat.post');
        t.equal(msg.id, 2, 'chat.post waits for acknowledgement');
        t.same(msg.params, ['hello']);
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return result.then(() => t.end());
    })
);

test('setBlock is an acknowledged request', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setBlock({X: 1, Y: 2, Z: 3, BLOCK: 'minecraft:stone'});
        const msg = socket.lastSent();
        t.equal(msg.jsonrpc, '2.0');
        t.equal(msg.method, 'world.setBlock');
        t.equal(msg.id, 2, 'setBlock waits for acknowledgement');
        t.same(msg.params, [1, 2, 3, 'minecraft:stone']);
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return result.then(() => t.end());
    })
);

test('setBlocks is an acknowledged request', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setBlocks({
            X1: 1,
            Y1: 2,
            Z1: 3,
            X2: 4,
            Y2: 5,
            Z2: 6,
            BLOCK: 'minecraft:glass'
        });
        const msg = socket.lastSent();
        t.equal(msg.jsonrpc, '2.0');
        t.equal(msg.method, 'world.setBlocks');
        t.equal(msg.id, 2, 'setBlocks waits for acknowledgement');
        t.same(msg.params, [1, 2, 3, 4, 5, 6, 'minecraft:glass']);
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return result.then(() => t.end());
    })
);

test('getBlock is a request and resolves to the canonical ref', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.getBlock({X: 0, Y: 0, Z: 0});
        const msg = socket.lastSent();
        t.equal(msg.method, 'world.getBlock');
        t.equal(msg.id, 2, 'second request on the connection');
        socket.fireMessage({
            jsonrpc: '2.0', id: 2, result: 'minecraft:oak_log[axis=y]'
        });
        return result.then(value => {
            t.equal(value, 'minecraft:oak_log[axis=y]');
            t.end();
        });
    })
);

test('getBlock swallows a JSON-RPC error into empty string', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.getBlock({X: 0, Y: 0, Z: 0});
        socket.fireMessage({jsonrpc: '2.0',
            id: 2,
            error: {
                code: -32602,
                message: 'invalid params',
                data: {reason: 'unknown_block', ref: 'minecraft:nope'}
            }});
        return result.then(value => {
            t.equal(value, '');
            t.end();
        });
    })
);

test('a closed socket rejects pending requests instead of hanging', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const pending = blocks._request('world.getBlock', [0, 0, 0]);
        socket.fireClose();
        return pending.then(
            () => t.fail('should have rejected'),
            err => {
                t.match(err.message, /closed/);
                t.end();
            }
        );
    })
);

test('a closed socket emits a closed McRemote observation', t => {
    const runtime = newRuntime();
    return newConnectedBlocks(runtime).then(({socket}) => {
        socket.fireClose({code: 1011, reason: 'sandbox_unreachable'});
        const closed = latestObservation(runtime);
        t.equal(closed.status, 'closed');
        t.match(closed.lastError.message, /closed/);
        t.equal(closed.lastError.code, 1011);
        t.equal(closed.lastError.reason, 'sandbox_unreachable');
        t.end();
    });
});

test('replies for unknown ids are dropped', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        // Should not throw when no pending entry matches.
        socket.fireMessage({jsonrpc: '2.0', id: 999, result: 'ignored'});
        t.equal(blocks._pending.size, 0);
        t.end();
    })
);
