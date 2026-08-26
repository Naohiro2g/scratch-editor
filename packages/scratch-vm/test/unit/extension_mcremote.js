const crypto = require('crypto');
const test = require('tap').test;
const McRemote = require('../../src/extensions/scratch3_mcremote/index.js');
const {
    DISPLAY_ALIAS_WORDS,
    createDisplayAlias
} = require('../../src/extensions/scratch3_mcremote/display-alias');
const Runtime = require('../../src/engine/runtime');
const {canonicalStringify} = require('../../src/extensions/scratch3_mcremote/catalog');
const displayAliasFixture = require('../../../../mc-remote/live/test/fixtures/display-alias-v1.json');
const oneShotTransportFixture = require('../../../../mc-remote/bridge/test/fixtures/one-shot-transport-v1.json');
const eventFixture = require('../../../../mc-remote/protocol/test/fixtures/events-v23.json');
const dimensionFixture = require('../../../../mc-remote/protocol/test/fixtures/dimensions-v22.json');
const spawnFixture = require('../../../../mc-remote/protocol/test/fixtures/spawn-v22.json');

// Read from the extension itself so this harness tracks the current protocol
// automatically on the next major bump instead of a hardcoded regex going stale.
const mockHelloProtocolMajor = protocol => {
    const match = typeof protocol === 'string' && /^(\d+)\./.exec(protocol);
    return match ? match[1] : null;
};
const CLIENT_PROTOCOL_MAJOR = mockHelloProtocolMajor(McRemote.PROTOCOL_VERSION);

/**
 * Minimal WebSocket stand-in driven synchronously by the tests. The extension
 * only uses addEventListener, send, readyState and the static OPEN constant.
 */
class FakeWebSocket {
    constructor (url, protocols) {
        this.url = url;
        this.protocols = protocols;
        this.protocol = oneShotTransportFixture.selected_protocol;
        this.readyState = 0; // CONNECTING
        this.bufferedAmount = 0;
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
    close (code, reason) {
        this.closeCode = code;
        this.closeReason = reason;
        this.fireClose({code, reason});
    }
    _emit (type, event) {
        (this._listeners[type] || []).forEach(cb => cb(event));
    }
    fireOpen () {
        this.readyState = FakeWebSocket.OPEN;
        this._emit('open');
    }
    fireMessage (obj) {
        if (obj && obj.result && mockHelloProtocolMajor(obj.result.protocol) === CLIENT_PROTOCOL_MAJOR) {
            obj = Object.assign({}, obj, {
                result: Object.assign({}, dimensionFixture.build_context, obj.result)
            });
        }
        this._emit('message', {data: JSON.stringify(obj)});
    }
    fireClose (event) {
        this.readyState = 3; // CLOSED
        this._emit('close', event);
    }
    lastSent () {
        const message = JSON.parse(this.sent[this.sent.length - 1]);
        return message[oneShotTransportFixture.hint_key] ? JSON.parse(message.payload) : message;
    }
    lastTransportMessage () {
        return JSON.parse(this.sent[this.sent.length - 1]);
    }
}
FakeWebSocket.OPEN = 1;
FakeWebSocket.instances = [];

global.WebSocket = FakeWebSocket;

test('FakeWebSocket backfills the mock hello default build context by the client protocol major', t => {
    const socket = new FakeWebSocket('wss://example.test', []);
    let lastMessage;
    socket.addEventListener('message', event => {
        lastMessage = JSON.parse(event.data);
    });

    socket.fireMessage({jsonrpc: '2.0', id: 1, result: {protocol: McRemote.PROTOCOL_VERSION}});
    t.same(lastMessage.result.dimension, dimensionFixture.build_context.dimension,
        'a hello matching the client protocol major gets the default build context');

    const otherMajor = `${Number(CLIENT_PROTOCOL_MAJOR) + 1}.0.0`;
    socket.fireMessage({jsonrpc: '2.0', id: 2, result: {protocol: otherMajor}});
    t.notOk(Object.prototype.hasOwnProperty.call(lastMessage.result, 'dimension'),
        'a hello with a different protocol major does not get the default build context');
    t.end();
});

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

const newEventRuntime = () => {
    const runtime = newRuntime();
    runtime.startedEventThreads = [];
    runtime.threads = [];
    runtime.allScriptsByOpcodeDo = () => {};
    runtime.startHats = function (opcode, matchFields, target, options) {
        const thread = {
            opcode,
            updateMonitor: false,
            extensionContext: Object.freeze(Object.assign({}, options.extensionContext))
        };
        this.startedHats.push(opcode);
        this.startedEventThreads.push(thread);
        this.threads.push(thread);
        return [thread];
    };
    return runtime;
};

const observations = runtime => runtime.emitted
    .filter(event => event.event === Runtime.MCREMOTE_OBSERVATION_UPDATE)
    .map(event => event.payload);

const latestObservation = runtime => observations(runtime).slice(-1)[0];

const catalogs = runtime => runtime.emitted
    .filter(event => event.event === Runtime.MCREMOTE_CATALOG_UPDATE)
    .map(event => event.payload);

const latestCatalog = runtime => catalogs(runtime).slice(-1)[0];

const nextCatalogStatus = (runtime, status) => new Promise(resolve => {
    const emit = runtime.emit;
    runtime.emit = function (event, payload) {
        emit.call(this, event, payload);
        if (event === Runtime.MCREMOTE_CATALOG_UPDATE && payload.status === status) {
            runtime.emit = emit;
            resolve(payload);
        }
    };
});

const actionableErrors = runtime => runtime.emitted
    .filter(event => event.event === Runtime.MCREMOTE_ACTIONABLE_ERROR)
    .map(event => event.payload);

const waitFor = predicate => new Promise((resolve, reject) => {
    let attempts = 100;
    const check = () => {
        if (predicate()) return resolve();
        if (--attempts === 0) return reject(new Error('condition was not met'));
        setImmediate(check);
    };
    check();
});

test('McRemote display aliases use the shared WireScope vocabulary', t => {
    t.same(DISPLAY_ALIAS_WORDS, displayAliasFixture.words);
    const values = [0, (27 << 8) + 1];
    t.equal(createDisplayAlias(() => values.shift()), displayAliasFixture.example);
    t.end();
});

const catalogBody = {
    block: {
        'examplemod:ruby_block': {
            states: {},
            default_state: {}
        },
        'minecraft:oak_log': {
            states: {axis: ['x', 'y', 'z']},
            default_state: {axis: 'y'}
        }
    },
    entity: {'minecraft:allay': {}},
    particle: {'minecraft:ash': {}}
};

const catalogHash = crypto.createHash('sha256')
    .update(canonicalStringify(catalogBody), 'utf8')
    .digest('hex');

const catalogResult = Object.assign({catalogHash}, catalogBody);

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
            protocol: '23.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            catalogHash: null,
            world_constants: {y_sea: 63}
        }});
    return connected.then(() => ({blocks, socket}));
};

test('hello uses a JSON-RPC 2.0 request with protocol 23.0.0', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    t.equal(socket.url, `wss://bridge.mc-remote.com/?sandbox=${DEFAULT_SANDBOX_ROUTE}`);
    t.same(socket.protocols, [
        oneShotTransportFixture.probe_protocol,
        oneShotTransportFixture.selected_protocol
    ]);
    const hello = socket.lastSent();
    t.equal(hello.jsonrpc, '2.0');
    t.equal(hello.id, 1, 'client-numbered id starts at 1');
    t.equal(hello.method, 'hello');
    t.equal(hello.params.protocol, '23.0.0', 'clean protocol semver, no channel suffix');
    t.equal(hello.params.client.name, 'scratch-mcremote');
    t.equal(hello.params.client.version, '2200.0.0b5', 'client build label is diagnostic only');
    t.equal(hello.params.sandbox, void 0, 'sandbox routing is not part of hello');
    t.end();
});

test('connect fails closed when the Bridge does not select the one-shot transport', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    const result = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.protocol = oneShotTransportFixture.probe_protocol;
    socket.fireOpen();

    return t.rejects(result, {reason: 'bridge_transport_incompatible'}).then(() => {
        t.equal(socket.sent.length, 0, 'hello is not sent through an incompatible Bridge');
        t.end();
    });
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

    return t.rejects(blocks.connect(), {reason: 'connection_disabled'}).then(() => {
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
    t.equal(helloSent.displayAlias, '', 'alias is not issued before authenticated hello succeeds');
    t.equal(helloSent.frameLog.length, 1);
    t.equal(helloSent.frameLog[0].streamId, 'default');
    t.equal(helloSent.frameLog[0].direction, 'send');
    t.equal(helloSent.frameLog[0].method, 'hello');
    t.same(helloSent.frameLog[0].payload.params.auth, {token: '[redacted]'});
    t.equal(JSON.stringify(helloSent).indexOf('mcrs_saved'), -1, 'saved token is never exposed');

    socket.fireMessage({jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '23.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            catalogHash: null,
            world_constants: {y_sea: 63},
            permissions: {build: true},
            dimension: 'minecraft:overworld',
            origin: [200, 0, 200]
        }});

    return result.then(() => {
        const connected = latestObservation(runtime);
        t.equal(connected.status, 'connected');
        t.equal(connected.sourceKind, 'scratch');
        t.match(connected.displayAlias, /^[A-Z]+-[A-Z]+-[0-9]{6}$/);
        t.same(connected.hello, {
            protocol: '23.0.0',
            mc_version: '1.21.11',
            catalogHash: null,
            supported_mc_versions: ['1.21.11'],
            world_constants: {y_sea: 63},
            permissions: {build: true},
            dimension: 'minecraft:overworld',
            origin: [200, 0, 200]
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
            protocol: '23.0.0',
            mc_version: '26.1.2',
            supported_mc_versions: ['1.21.11'],
            y_sea: 63,
            catalogHash: null,
            dimension: 'myworld:world',
            origin: [200, 0, 200]
        }});

    return result.then(() => {
        t.same(latestObservation(runtime).hello, {
            protocol: '23.0.0',
            mc_version: '26.1.2',
            catalogHash: null,
            supported_mc_versions: ['1.21.11'],
            world_constants: {y_sea: 63},
            permissions: null,
            dimension: 'myworld:world',
            origin: [200, 0, 200]
        });
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
            t.same(socket.lastTransportMessage(), {
                [oneShotTransportFixture.hint_key]: oneShotTransportFixture.hint,
                payload: JSON.stringify(pairBegin)
            });
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
            t.same(socket.lastTransportMessage(), {
                [oneShotTransportFixture.hint_key]: oneShotTransportFixture.hint,
                payload: JSON.stringify(pairPoll)
            });
            t.equal(pairPoll.method, 'auth.pairPoll');
            t.same(pairPoll.params, {pairing_id: 'pair-1'});
            socket.fireMessage({jsonrpc: '2.0',
                id: 3,
                result: {status: 'ok', token: 'mcrs_new'}});
            return nextTurn();
        })
        .then(() => {
            const retryHello = socket.lastSent();
            t.equal(socket.lastTransportMessage().jsonrpc, '2.0', 'retry hello stays on the persistent transport');
            t.equal(retryHello.method, 'hello');
            t.same(retryHello.params.auth, {token: 'mcrs_new'});
            t.equal(global.localStorage.getItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE)), 'mcrs_new');
            t.same(runtime.startedHats, ['mcremote_whenPaired']);
            socket.fireMessage({jsonrpc: '2.0',
                id: 4,
                result: {
                    protocol: '23.0.0',
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
            t.equal(
                JSON.stringify(observations(runtime)).indexOf(oneShotTransportFixture.hint_key),
                -1,
                'Bridge transport hints are never exposed to WireScope observations'
            );
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

test('credential management methods stay on the persistent transport', t => {
    return newConnectedBlocks().then(({blocks, socket}) => {
        const response = blocks._request('auth.listCredentials', []);
        const request = socket.lastTransportMessage();
        t.equal(request.method, 'auth.listCredentials');
        t.equal(request[oneShotTransportFixture.hint_key], void 0);
        socket.fireMessage({jsonrpc: '2.0', id: request.id, result: {credentials: []}});
        return response.then(() => t.end());
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

test('hello accepts a server with a newer compatible protocol minor', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const blocks = new McRemote({});
    const result = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({jsonrpc: '2.0', id: 1, result: {protocol: '23.3.99'}});

    return result.then(() => {
        t.equal(blocks._connectionStatus, 'connected');
        t.end();
    });
});

test('hello rejects an incompatible server protocol before commands can run', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);
    const connection = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({jsonrpc: '2.0', id: 1, result: {protocol: '20.9.0'}});

    return Promise.all([
        connection.then(
            () => t.fail('connection should have rejected'),
            error => t.equal(error.reason, 'protocol_mismatch')
        ),
        blocks.postToChat({MSG: 'test'})
    ]).then(() => {
        const observation = latestObservation(runtime);
        t.equal(observation.status, 'error');
        t.equal(observation.lastError.reason, 'protocol_mismatch');
        t.equal(socket.sent.length, 1);
        t.end();
    });
});

test('hello rejects a server protocol minor older than the client', t => {
    const blocks = new McRemote({});
    t.equal(blocks._isProtocolCompatible('23.0.0', '23.1.0'), false);
    t.equal(blocks._isProtocolCompatible('23.1.0', '23.1.99'), true, 'patch is ignored');
    t.end();
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
            protocol: '23.0.0',
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

test('disconnected commands emit connection guidance only once per disconnected period', async t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);

    await blocks.postToChat({MSG: 'one'});
    await blocks.setBlock({X: 0, Y: 0, Z: 0, BLOCK: 'stone'});

    t.equal(actionableErrors(runtime).length, 1);
    t.equal(actionableErrors(runtime)[0].reason, 'not_connected');
    t.equal(latestObservation(runtime).lastError.reason, 'not_connected');
});

test('successful reconnect resets disconnected command guidance', async t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);
    await blocks.postToChat({MSG: 'before connection'});

    const connected = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({
        jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '23.0.0',
            catalogHash: null
        }
    });
    await connected;
    socket.fireClose({code: 1006, reason: 'network_lost'});
    await blocks.postToChat({MSG: 'after disconnect'});

    t.equal(actionableErrors(runtime).length, 2);
    t.equal(actionableErrors(runtime)[1].reason, 'not_connected');
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
            protocol: '23.0.0',
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

test('connectTo debug block uses the runtime-configured default sandbox route', t => {
    global.localStorage.clear();
    const runtime = newRuntime();
    runtime.getMcRemoteRuntimeConfig = () => ({
        bridgeUrl: 'wss://bridge-beta.mc-remote.com',
        defaultSandbox: 'sb-beta.mc-remote.com',
        connectionEnabled: true,
        releaseIdentity: 'beta'
    });
    const blocks = new McRemote(runtime);
    const connectTo = blocks.getInfo().blocks.find(block => block.opcode === 'connectTo');
    t.equal(connectTo.arguments.NAME.defaultValue, 'sb-beta.mc-remote.com');
    t.end();
});

test('build dimension block offers standard refs and accepts reporters', t => {
    global.localStorage.clear();
    const blocks = new McRemote({});
    const info = blocks.getInfo();
    const setDimension = info.blocks.find(block => block.opcode === 'setDimension');
    t.equal(setDimension.arguments.DIMENSION.defaultValue, 'overworld');
    t.equal(info.menus.dimensions.acceptReporters, true);
    t.same(info.menus.dimensions.items.map(item => item.value), ['overworld', 'the_nether', 'the_end']);
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

test('build mode and flush command blocks expose one shared stream control surface', t => {
    global.localStorage.clear();
    const blocks = new McRemote({});
    const info = blocks.getInfo();
    const setBuildMode = info.blocks.find(block => block.opcode === 'setBuildMode');
    const flushBuildCommands = info.blocks.find(block => block.opcode === 'flushBuildCommands');
    t.equal(setBuildMode.arguments.MODE.defaultValue, 'DEBUG');
    t.equal(setBuildMode.arguments.TRACE_DELAY.defaultValue, 0.25);
    t.same(info.menus.buildModes.items.map(item => item.value), ['DEBUG', 'TRACE', 'FAST']);
    t.ok(flushBuildCommands, 'explicit connection.flush command is visible');
    t.end();
});

test('b6 events expose three hats and thread-local accessors without raw poll controls', t => {
    const info = new McRemote({}).getInfo();
    const opcodes = info.blocks.filter(block => typeof block !== 'string').map(block => block.opcode);
    for (const opcode of [
        'whenPickaxePoke',
        'whenChatPosted',
        'whenProjectileHit',
        'eventValue',
        'eventStatus'
    ]) {
        t.ok(opcodes.includes(opcode), `${opcode} is public`);
    }
    t.notOk(opcodes.includes('eventsPoll'), 'raw events.poll is not a public block');
    t.notOk(opcodes.includes('eventsClear'), 'events.clear remains outside b6');
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

test('setDimension preserves a general DimensionRef and accepts canonical context', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setDimension({DIMENSION: 'myworld:world'});
        const msg = socket.lastSent();
        t.equal(msg.jsonrpc, '2.0');
        t.equal(msg.method, 'build.setDimension');
        t.equal(msg.id, 2, 'build state changes wait for acknowledgement');
        t.same(msg.params, ['myworld:world']);
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: dimensionFixture.custom_build_context});
        return result.then(value => {
            t.equal(value, void 0);
            t.end();
        });
    })
);

test('setDimension rejects case, whitespace, and malformed refs without sending', async t => {
    const {blocks, socket} = await newConnectedBlocks();
    const before = socket.sent.length;
    for (const dimension of dimensionFixture.invalid_refs) {
        await blocks.setDimension({DIMENSION: dimension});
    }
    t.equal(socket.sent.length, before);
});

test('reconnect reuses the sandbox token and starts build state from defaults', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'mcrs_saved');
        const setDimension = blocks.setDimension({DIMENSION: 'the_nether'});
        socket.fireMessage({jsonrpc: '2.0',
            id: 2,
            result: {
                dimension: 'minecraft:the_nether', origin: [200, 0, 200]
            }});
        return setDimension.then(() => {
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
                    protocol: '23.0.0',
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
                protocol: '23.0.0',
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
        const result = blocks.setDimension({DIMENSION: 'the_nether'});
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
        socket.fireMessage({jsonrpc: '2.0',
            id: 2,
            result: {
                dimension: 'minecraft:overworld', origin: [240, 0, 260]
            }});
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

test('setBlock sends a structured BlockSpec and waits for a null result in DEBUG mode', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        blocks._catalogState = {status: 'current', catalog: catalogBody};
        const result = blocks.setBlock({X: 1, Y: 2, Z: 3, BLOCK: 'oak_log', STATE: 'axis=z'});
        const msg = socket.lastSent();
        t.equal(msg.jsonrpc, '2.0');
        t.equal(msg.method, 'world.setBlock');
        t.equal(msg.id, 2, 'setBlock waits for acknowledgement');
        t.same(msg.params, [1, 2, 3, {block_id: 'oak_log', state: {axis: 'z'}}]);
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return result.then(() => t.end());
    })
);

test('setBlocks sends an empty state object without requiring a catalog', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setBlocks({
            X1: 1,
            Y1: 2,
            Z1: 3,
            X2: 4,
            Y2: 5,
            Z2: 6,
            BLOCK: 'minecraft:glass',
            STATE: ''
        });
        const msg = socket.lastSent();
        t.equal(msg.jsonrpc, '2.0');
        t.equal(msg.method, 'world.setBlocks');
        t.equal(msg.id, 2, 'setBlocks waits for acknowledgement');
        t.same(msg.params, [1, 2, 3, 4, 5, 6, {block_id: 'minecraft:glass', state: {}}]);
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return result.then(() => t.end());
    })
);

test('FAST mode is applied after a flush fence and sends setters as notifications', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const changingMode = blocks.setBuildMode({MODE: 'FAST', TRACE_DELAY: 0.25});
        const flush = socket.lastSent();
        t.equal(flush.method, 'connection.flush');
        t.same(flush.params, []);
        t.type(flush.id, 'number');

        const settingBlock = blocks.setBlock({X: 1, Y: 2, Z: 3, BLOCK: 'stone', STATE: ''});
        t.equal(socket.sent.length, 2, 'later setter is fenced until flush succeeds');
        socket.fireMessage({jsonrpc: '2.0', id: flush.id, result: null});

        return changingMode.then(() => settingBlock).then(() => {
            const notification = socket.lastSent();
            t.equal(notification.method, 'world.setBlock');
            t.equal(notification.id, void 0, 'FAST omits the JSON-RPC id');
            t.same(notification.params, [1, 2, 3, {block_id: 'stone', state: {}}]);
            t.end();
        });
    })
);

test('TRACE waits once after a successful setter response', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const delays = [];
        blocks._delay = ms => {
            delays.push(ms);
            return Promise.resolve();
        };
        const changingMode = blocks.setBuildMode({MODE: 'TRACE', TRACE_DELAY: 0.25});
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return changingMode.then(() => {
            const settingBlocks = blocks.setBlocks({
                X1: 0, Y1: 0, Z1: 0, X2: 2, Y2: 2, Z2: 2, BLOCK: 'stone', STATE: ''
            });
            const request = socket.lastSent();
            t.equal(request.method, 'world.setBlocks');
            t.type(request.id, 'number');
            t.same(delays, [], 'TRACE waits only after success');
            socket.fireMessage({jsonrpc: '2.0', id: request.id, result: null});
            return settingBlocks;
        }).then(() => {
            t.same(delays, [250], 'one setBlocks call causes one delay');
            t.end();
        });
    })
);

test('TRACE reports a setter error immediately without applying its delay', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const delays = [];
        blocks._delay = ms => {
            delays.push(ms);
            return Promise.resolve();
        };
        const changingMode = blocks.setBuildMode({MODE: 'TRACE', TRACE_DELAY: 0.25});
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return changingMode.then(() => {
            const settingBlock = blocks.setBlock({X: 0, Y: 0, Z: 0, BLOCK: 'stone', STATE: ''});
            const request = socket.lastSent();
            socket.fireMessage({
                jsonrpc: '2.0',
                id: request.id,
                error: {code: -32602, message: 'invalid block', data: {reason: 'invalid_block_state'}}
            });
            return settingBlock;
        }).then(() => {
            t.same(delays, [], 'failed setter does not delay the calling Scratch thread');
            t.end();
        });
    })
);

test('invalid TRACE delay leaves the current mode unchanged', t =>
    newConnectedBlocks(newRuntime()).then(({blocks, socket}) => {
        const result = blocks.setBuildMode({MODE: 'TRACE', TRACE_DELAY: 'not-a-number'});
        return result.then(() => {
            t.equal(socket.sent.length, 1, 'invalid input does not send connection.flush');
            const settingBlock = blocks.setBlock({X: 0, Y: 0, Z: 0, BLOCK: 'stone', STATE: ''});
            const request = socket.lastSent();
            t.type(request.id, 'number', 'DEBUG remains active');
            socket.fireMessage({jsonrpc: '2.0', id: request.id, result: null});
            return settingBlock;
        }).then(() => t.end());
    })
);

test('TRACE delay accepts the inclusive 0 to 2 second range and rejects a larger value', t =>
    newConnectedBlocks(newRuntime()).then(({blocks, socket}) => {
        const acceptedZero = blocks.setBuildMode({MODE: 'DEBUG', TRACE_DELAY: 0});
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return acceptedZero.then(() => {
            t.equal(blocks._traceDelaySeconds, 0);
            const acceptedUpper = blocks.setBuildMode({MODE: 'TRACE', TRACE_DELAY: 2});
            return nextTurn().then(() => {
                const flush = socket.lastSent();
                t.equal(flush.method, 'connection.flush');
                socket.fireMessage({jsonrpc: '2.0', id: flush.id, result: null});
                return acceptedUpper;
            });
        }).then(() => {
            t.equal(blocks._traceDelaySeconds, 2);
            const before = socket.sent.length;
            return blocks.setBuildMode({MODE: 'DEBUG', TRACE_DELAY: 2.1}).then(() => {
                t.equal(socket.sent.length, before, 'out-of-range delay sends no flush');
                t.equal(blocks._buildMode, 'TRACE');
                t.equal(blocks._traceDelaySeconds, 2);
                return blocks.setBuildMode({MODE: 'DEBUG', TRACE_DELAY: -0.1});
            })
                .then(() => {
                    t.equal(socket.sent.length, before, 'negative delay sends no flush');
                    t.equal(blocks._buildMode, 'TRACE');
                    t.equal(blocks._traceDelaySeconds, 2);
                    t.end();
                });
        });
    })
);

test('failed mode transition retains DEBUG and releases later registrations', t =>
    newConnectedBlocks(newRuntime()).then(({blocks, socket}) => {
        const changingMode = blocks.setBuildMode({MODE: 'FAST', TRACE_DELAY: 0.25});
        const flush = socket.lastSent();
        const settingBlock = blocks.setBlock({X: 0, Y: 0, Z: 0, BLOCK: 'stone', STATE: ''});
        socket.fireMessage({jsonrpc: '2.0',
            id: flush.id,
            error: {code: -32000, message: 'flush failed', data: {reason: 'transport_lost'}}});
        return changingMode.then(() => {
            const request = socket.lastSent();
            t.equal(request.method, 'world.setBlock');
            t.type(request.id, 'number', 'old DEBUG mode remains active');
            t.equal(blocks._lastError.reason, 'transport_lost');
            socket.fireMessage({jsonrpc: '2.0', id: request.id, result: null});
            return settingBlock;
        }).then(() => t.end());
    })
);

test('FAST applies finite WebSocket backpressure without dropping the notification', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const changingMode = blocks.setBuildMode({MODE: 'FAST', TRACE_DELAY: 0.25});
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return changingMode.then(() => {
            socket.bufferedAmount = 1024 * 1024;
            const settingBlock = blocks.setBlock({X: 0, Y: 0, Z: 0, BLOCK: 'stone', STATE: ''});
            t.equal(socket.sent.length, 2, 'notification waits while the browser buffer is full');
            socket.bufferedAmount = 0;
            return settingBlock;
        }).then(() => {
            const notification = socket.lastSent();
            t.equal(notification.method, 'world.setBlock');
            t.equal(notification.id, void 0);
            t.end();
        });
    })
);

test('a saturated outbound registration queue closes the connection without silent drops', t => {
    const runtime = newRuntime();
    return newConnectedBlocks(runtime).then(({blocks, socket}) => {
        const changingMode = blocks.setBuildMode({MODE: 'FAST', TRACE_DELAY: 0.25});
        let x = 0;
        const placements = Array.from({length: 257}, () => blocks.setBlock({
            X: x++,
            Y: 0,
            Z: 0,
            BLOCK: 'stone',
            STATE: ''
        }));

        return Promise.all([changingMode, ...placements]).then(() => {
            t.equal(socket.closeCode, 1011);
            t.equal(socket.closeReason, 'backpressure');
            t.equal(blocks._connectionStatus, 'closed');
            t.equal(actionableErrors(runtime).length, 1, 'delivery guidance is emitted once per connection');
            t.equal(actionableErrors(runtime)[0].reason, 'backpressure');
            t.end();
        });
    });
});

test('FAST notification is observable with a null request id and no synthetic response', t =>
    newConnectedBlocks(newRuntime()).then(({blocks, socket}) => {
        const changingMode = blocks.setBuildMode({MODE: 'FAST', TRACE_DELAY: 0.25});
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return changingMode.then(() => blocks.setBlock({X: 0, Y: 0, Z: 0, BLOCK: 'stone', STATE: ''})).then(() => {
            const frames = blocks._frameLog;
            const notification = frames[frames.length - 1];
            t.equal(notification.direction, 'send');
            t.equal(notification.id, void 0);
            t.equal(notification.method, 'world.setBlock');
            t.same(notification.payload, {
                jsonrpc: '2.0',
                method: 'world.setBlock',
                params: [0, 0, 0, {block_id: 'stone', state: {}}]
            });
            t.end();
        });
    })
);

test('flushBuildCommands sends the exact connection.flush request', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.flushBuildCommands();
        const request = socket.lastSent();
        t.equal(request.method, 'connection.flush');
        t.same(request.params, []);
        t.type(request.id, 'number');
        socket.fireMessage({jsonrpc: '2.0', id: request.id, result: null});
        return result.then(() => t.end());
    })
);

test('leaving FAST flushes earlier notifications before applying DEBUG', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const enteringFast = blocks.setBuildMode({MODE: 'FAST', TRACE_DELAY: 0.25});
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return enteringFast
            .then(() => blocks.setBlock({
                X: 0, Y: 0, Z: 0, BLOCK: 'stone', STATE: ''
            }))
            .then(() => {
                const notification = socket.lastSent();
                t.equal(notification.method, 'world.setBlock');
                t.equal(notification.id, void 0);

                const leavingFast = blocks.setBuildMode({MODE: 'DEBUG', TRACE_DELAY: 0.25});
                const flush = socket.lastSent();
                t.equal(flush.method, 'connection.flush');
                t.ok(socket.sent.indexOf(JSON.stringify(notification)) < socket.sent.length - 1,
                    'notification precedes the transition flush');
                socket.fireMessage({jsonrpc: '2.0', id: flush.id, result: null});
                return leavingFast;
            })
            .then(() => {
                t.equal(blocks._buildMode, 'DEBUG');
                t.end();
            });
    })
);

test('getBlock makes one request and resolves to canonical BlockInfoText', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.getBlock({X: 0, Y: 0, Z: 0});
        const msg = socket.lastSent();
        t.equal(msg.method, 'world.getBlock');
        t.equal(msg.id, 2, 'second request on the connection');
        socket.fireMessage({
            jsonrpc: '2.0', id: 2, result: {block_id: 'minecraft:oak_log', state: {axis: 'y'}}
        });
        return result.then(value => {
            t.equal(value, 'minecraft:oak_log[axis=y]');
            t.end();
        });
    })
);

test('getBlocks atomically replaces the selected list with ordered BlockInfoText values', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const list = {value: ['previous'], _monitorUpToDate: true};
        const util = {
            target: {
                lookupOrCreateList (id, name) {
                    t.equal(id, 'list-id');
                    t.equal(name, 'block list');
                    return list;
                }
            }
        };
        const result = blocks.getBlocks({
            X1: 1,
            Y1: 2,
            Z1: 3,
            X2: 1,
            Y2: 2,
            Z2: 4,
            LIST: {id: 'list-id', name: 'block list'}
        }, util);
        const request = socket.lastSent();
        t.equal(request.method, 'world.getBlocks');
        t.same(request.params, [1, 2, 3, 1, 2, 4]);
        t.same(list.value, ['previous'], 'destination is unchanged while the response is pending');
        socket.fireMessage({
            jsonrpc: '2.0',
            id: request.id,
            result: [
                {block_id: 'minecraft:stone', state: {}},
                {block_id: 'minecraft:oak_log', state: {axis: 'z'}}
            ]
        });
        return result.then(() => {
            t.same(list.value, ['minecraft:stone', 'minecraft:oak_log[axis=z]']);
            t.equal(list._monitorUpToDate, false);
            t.end();
        });
    })
);

test('getBlocks preserves the selected list when any returned block value is malformed', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const list = {value: ['last known good'], _monitorUpToDate: true};
        const util = {target: {lookupOrCreateList: () => list}};
        const result = blocks.getBlocks({
            X1: 0,
            Y1: 0,
            Z1: 0,
            X2: 0,
            Y2: 0,
            Z2: 1,
            LIST: {id: 'list-id', name: 'block list'}
        }, util);
        const request = socket.lastSent();
        socket.fireMessage({
            jsonrpc: '2.0',
            id: request.id,
            result: [
                {block_id: 'minecraft:stone', state: {}},
                {block_id: 'minecraft:oak_log'}
            ]
        });
        return result.then(() => {
            t.same(list.value, ['last known good']);
            t.equal(list._monitorUpToDate, true);
            t.end();
        });
    })
);

test('getSign makes one request and resolves to a SignInfoText usable by the line accessors', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.getSign({X: 1, Y: 2, Z: 3});
        const msg = socket.lastSent();
        t.equal(msg.method, 'world.getSign');
        const front = [
            {text: 'Hi', color: 'red', decorations: ['bold']},
            {text: '', color: 'black', decorations: []},
            {text: '', color: 'black', decorations: []},
            {text: '', color: 'black', decorations: []}
        ];
        const back = [
            {text: '', color: 'black', decorations: []},
            {text: '', color: 'black', decorations: []},
            {text: '', color: 'black', decorations: []},
            {text: '', color: 'black', decorations: []}
        ];
        socket.fireMessage({jsonrpc: '2.0', id: msg.id, result: {front, back, waxed: false}});
        return result.then(signInfo => {
            t.equal(blocks.signLineText({SIGN_INFO: signInfo, FACE: 'front', LINE: '0'}), 'Hi');
            t.equal(blocks.signLineColor({SIGN_INFO: signInfo, FACE: 'front', LINE: '0'}), 'red');
            t.ok(blocks.signLineHasDecoration({SIGN_INFO: signInfo, FACE: 'front', LINE: '0', DECORATION: 'bold'}));
            t.notOk(blocks.signIsWaxed({SIGN_INFO: signInfo}));
            t.end();
        });
    })
);

test('setSign replaces one face with plain-text lines and waits for a null result', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setSign({
            X: 1, Y: 2, Z: 3, FACE: 'front', LINE0: 'a', LINE1: 'b', LINE2: 'c', LINE3: 'd'
        });
        const msg = socket.lastSent();
        t.equal(msg.method, 'world.setSign');
        t.same(msg.params, [1, 2, 3, {front: ['a', 'b', 'c', 'd']}]);
        socket.fireMessage({jsonrpc: '2.0', id: msg.id, result: null});
        return result.then(() => t.end());
    })
);

test('updateSignLine sends the exact one-line PATCH shape', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.updateSignLine({X: 1, Y: 2, Z: 3, FACE: 'back', LINE: '2', TEXT: 'hi'});
        const msg = socket.lastSent();
        t.equal(msg.method, 'world.updateSignLine');
        t.same(msg.params, [1, 2, 3, 'back', 2, 'hi']);
        socket.fireMessage({jsonrpc: '2.0', id: msg.id, result: null});
        return result.then(() => t.end());
    })
);

test('a sign write error resolves the command block without rejecting the calling thread', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setSign({
            X: 1, Y: 2, Z: 3, FACE: 'front', LINE0: 'a', LINE1: '', LINE2: '', LINE3: ''
        });
        const msg = socket.lastSent();
        socket.fireMessage({
            jsonrpc: '2.0',
            id: msg.id,
            error: {code: -32000, message: 'sign is waxed', data: {reason: 'sign_waxed'}}
        });
        return result.then(() => t.end());
    })
);

test('getHeight returns an integer and uses the optional maxY as an inclusive third parameter', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.getHeightBelow({X: 7, Z: 9, MAX_Y: 20}, {});
        const request = socket.lastSent();
        t.equal(request.method, 'world.getHeight');
        t.same(request.params, [7, 9, 20]);
        socket.fireMessage({jsonrpc: '2.0', id: request.id, result: -1});
        return result.then(value => {
            t.equal(value, -1, 'negative relative heights remain valid values');
            t.end();
        });
    })
);

test('getHeight returns ErrorText and emits one actionable hint for height_not_found', t => {
    const runtime = newRuntime();
    return newConnectedBlocks(runtime).then(({blocks, socket}) => {
        const first = blocks.getHeight({X: 7, Z: 9}, {});
        let request = socket.lastSent();
        t.same(request.params, [7, 9]);
        socket.fireMessage({
            jsonrpc: '2.0',
            id: request.id,
            error: {code: -32000, message: 'not found', data: {reason: 'height_not_found'}}
        });
        return first.then(value => {
            t.equal(value, '⟦mcr-error:height_not_found⟧');
            const second = blocks.getHeight({X: 7, Z: 9}, {});
            request = socket.lastSent();
            socket.fireMessage({
                jsonrpc: '2.0',
                id: request.id,
                error: {code: -32000, message: 'not found', data: {reason: 'height_not_found'}}
            });
            return second;
        }).then(value => {
            t.equal(value, '⟦mcr-error:height_not_found⟧');
            t.equal(actionableErrors(runtime).filter(error => error.reason === 'height_not_found').length, 1);
            t.end();
        });
    });
});

test('one connection poller dispatches mixed b6 events with per-thread context and visible loss', async t => {
    const runtime = newEventRuntime();
    const {blocks, socket} = await newConnectedBlocks(runtime);
    const firstPoll = socket.lastSent();
    t.equal(firstPoll.method, 'events.poll');
    t.same(firstPoll.params, eventFixture.poll_requests.default,
        'Scratch omits options and delegates the default limit to the server');

    socket.fireMessage({jsonrpc: '2.0', id: firstPoll.id, result: eventFixture.poll_result});
    await waitFor(() => runtime.startedEventThreads.length === 3);
    t.same(runtime.startedHats, [
        'mcremote_whenPickaxePoke',
        'mcremote_whenChatPosted',
        'mcremote_whenProjectileHit'
    ], 'mixed events preserve FIFO hat dispatch');
    const [clickThread, chatThread, projectileThread] = runtime.startedEventThreads;
    t.equal(blocks.eventValue({PROPERTY: 'dimension'}, {thread: clickThread}), 'minecraft:overworld');
    t.equal(blocks.eventValue({PROPERTY: 'block'}, {thread: clickThread}), 'minecraft:stone');
    t.equal(blocks.eventValue({PROPERTY: 'item'}, {thread: clickThread}), 'minecraft:diamond_pickaxe');
    t.equal(blocks.eventValue({PROPERTY: 'message'}, {thread: chatThread}), 'hello');
    t.equal(blocks.eventValue({PROPERTY: 'target_block'}, {thread: projectileThread}),
        'minecraft:oak_log[axis=z]');
    t.equal(blocks.eventValue({PROPERTY: 'message'}, {thread: Object.assign({}, chatThread, {updateMonitor: true})}),
        '', 'monitor evaluation cannot reuse a hat thread event');
    t.not(clickThread.extensionContext, chatThread.extensionContext, 'each thread owns a distinct context object');

    await waitFor(() => socket.lastSent().method === 'events.poll' && socket.lastSent().id !== firstPoll.id);
    const secondPoll = socket.lastSent();
    t.same(secondPoll.params, [3]);
    socket.fireMessage({
        jsonrpc: '2.0',
        id: secondPoll.id,
        result: {
            events: [],
            through_sequence: 4,
            latest_sequence: 4,
            filtered_out: 0,
            overflow_dropped_total: 0,
            capacity_dropped_total: 1,
            explicitly_discarded_total: 0
        }
    });
    await waitFor(() => blocks.eventStatus({PROPERTY: 'capacity'}) === 1);
    t.equal(blocks.eventStatus({PROPERTY: 'cursor'}), 4);
    t.equal(blocks.eventStatus({PROPERTY: 'total_loss'}), 1);
    t.equal(actionableErrors(runtime).slice(-1)[0].reason, 'event_loss');

    socket.fireClose({code: 1000, reason: ''});
    t.equal(blocks.eventStatus({PROPERTY: 'cursor'}), 0, 'disconnect clears the epoch cursor');
    t.equal(clickThread.extensionContext, null, 'disconnect clears event context on active threads');
    const reconnected = blocks.connect();
    const nextSocket = FakeWebSocket.instances[1];
    nextSocket.fireOpen();
    nextSocket.fireMessage({
        jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '23.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            catalogHash: null,
            world_constants: {y_sea: 63}
        }
    });
    await reconnected;
    t.same(nextSocket.lastSent().params, [0], 'the new connection epoch starts from cursor zero');
    t.end();
});

test('build context updates only from a valid setter result and guards event dispatch', async t => {
    const runtime = newEventRuntime();
    const {blocks, socket} = await newConnectedBlocks(runtime);
    const oldContext = blocks._buildContext;
    const malformed = blocks.setDimension({DIMENSION: 'myworld:world'});
    const malformedRequest = socket.lastSent();
    socket.fireMessage({jsonrpc: '2.0',
        id: malformedRequest.id,
        result: {
            dimension: 'myworld:world'
        }});
    await t.rejects(malformed, {reason: 'invalid_params'});
    t.equal(blocks._buildContext, oldContext, 'malformed success does not change the context');

    const changed = blocks.setDimension({DIMENSION: 'myworld:world'});
    const changedRequest = socket.lastSent();
    socket.fireMessage({jsonrpc: '2.0', id: changedRequest.id, result: dimensionFixture.custom_build_context});
    await changed;
    t.same(blocks._buildContext, dimensionFixture.custom_build_context);

    blocks._dispatchEvent(eventFixture.poll_result.events[0]);
    t.equal(runtime.startedEventThreads.length, 0, 'an event captured under the old context is ignored');
    blocks._dispatchEvent(Object.assign({}, eventFixture.poll_result.events[0], dimensionFixture.custom_build_context));
    t.equal(runtime.startedEventThreads.length, 1, 'the matching dimension and origin start the hat');
});

test('a malformed event result stops only the poller without advancing its cursor', async t => {
    const runtime = newEventRuntime();
    const {blocks, socket} = await newConnectedBlocks(runtime);
    const poll = socket.lastSent();
    socket.fireMessage({
        jsonrpc: '2.0',
        id: poll.id,
        result: Object.assign({}, eventFixture.poll_result, {unknown: true})
    });
    await waitFor(() => actionableErrors(runtime).some(error => error.reason === 'invalid_event_response'));
    t.equal(blocks.eventStatus({PROPERTY: 'cursor'}), 0);
    const command = blocks.getHeight({X: 1, Z: 2}, {});
    const request = socket.lastSent();
    t.equal(request.method, 'world.getHeight', 'Minecraft control remains usable');
    socket.fireMessage({jsonrpc: '2.0', id: request.id, result: 10});
    t.equal(await command, 10);
    t.end();
});

test('spawnEntity writes its epoch handle or ErrorText to the selected scalar variable', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const variable = {value: 'previous', isCloud: false};
        const util = {target: {lookupOrCreateVariable: () => variable}};
        const args = {
            ENTITY: 'minecraft:allay',
            X: 1.25,
            Y: 2.5,
            Z: 3.75,
            VARIABLE: {id: 'variable-id', name: 'spawned entity'}
        };
        const success = blocks.spawnEntity(args, util);
        let request = socket.lastSent();
        t.equal(request.method, 'world.spawnEntity');
        t.same(request.params, spawnFixture.spawn_entity.params);
        t.equal(variable.value, 'previous', 'output changes only after the response');
        // protocol 23 handles use the mcr_eh_ prefix; spawnFixture.spawn_entity.result is the
        // protocol-22-labeled mceh_ example and is reused here only for params, not the result.
        socket.fireMessage({jsonrpc: '2.0', id: request.id, result: 'mcr_eh_example'});
        return success.then(() => {
            t.equal(variable.value, 'mcr_eh_example');
            const failure = blocks.spawnEntity(args, util);
            request = socket.lastSent();
            socket.fireMessage({
                jsonrpc: '2.0',
                id: request.id,
                error: {code: -32000, message: 'capacity', data: {reason: 'entity_capacity_exhausted'}}
            });
            return failure;
        }).then(() => {
            t.equal(variable.value, '⟦mcr-error:entity_capacity_exhausted⟧');
            t.end();
        });
    })
);

test('spawnEntity treats a protocol-22 mceh_ handle from the server as a remote_error', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const variable = {value: 'previous', isCloud: false};
        const util = {target: {lookupOrCreateVariable: () => variable}};
        const result = blocks.spawnEntity({
            ENTITY: 'minecraft:allay',
            X: 1.25,
            Y: 2.5,
            Z: 3.75,
            VARIABLE: {id: 'variable-id', name: 'spawned entity'}
        }, util);
        const request = socket.lastSent();
        socket.fireMessage({jsonrpc: '2.0', id: request.id, result: 'mceh_legacy'});
        return result.then(() => {
            t.equal(variable.value, '⟦mcr-error:remote_error⟧');
            t.end();
        });
    })
);

test('spawnParticle sends coordinate-first params and preserves optional force', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const baseArgs = {
            X: 1.25,
            Y: 2.5,
            Z: 3.75,
            OFFSET_X: 0,
            OFFSET_Y: 0.5,
            OFFSET_Z: 0,
            PARTICLE: 'minecraft:flame',
            SPEED: 0.1,
            COUNT: 4
        };
        const omitted = blocks.spawnParticle(baseArgs);
        let request = socket.lastSent();
        t.equal(request.method, 'world.spawnParticle');
        t.same(request.params, spawnFixture.spawn_particle.default_force.params);
        socket.fireMessage({
            jsonrpc: '2.0',
            id: request.id,
            result: spawnFixture.spawn_particle.default_force.result
        });
        return omitted.then(() => {
            const explicit = blocks.spawnParticle(Object.assign({}, baseArgs, {FORCE: 'false'}));
            request = socket.lastSent();
            t.same(request.params, spawnFixture.spawn_particle.explicit_false.params);
            socket.fireMessage({
                jsonrpc: '2.0',
                id: request.id,
                result: spawnFixture.spawn_particle.explicit_false.result
            });
            return explicit;
        }).then(() => t.end());
    })
);

test('getBlock returns allowlisted ErrorText for a JSON-RPC error', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.getBlock({X: 0, Y: 0, Z: 0});
        socket.fireMessage({jsonrpc: '2.0',
            id: 2,
            error: {
                code: -32602,
                message: 'invalid params',
                data: {reason: 'unknown_block', block_id: 'minecraft:nope'}
            }});
        return result.then(value => {
            t.equal(value, '⟦mcr-error:unknown_block⟧');
            t.end();
        });
    })
);

test('getBlock folds unknown remote reasons without reflecting server messages', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.getBlock({X: 0, Y: 0, Z: 0});
        socket.fireMessage({jsonrpc: '2.0',
            id: 2,
            error: {
                code: -32000,
                message: 'secret server detail',
                data: {reason: 'future_reason'}
            }});
        return result.then(value => {
            t.equal(value, '⟦mcr-error:remote_error⟧');
            t.equal(value.indexOf('secret'), -1);
            t.end();
        });
    })
);

test('block information accessors are pure and never send another request', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const before = socket.sent.length;
        const info = 'minecraft:repeater[delay=3,facing=east,locked=false,powered=true]';
        t.equal(blocks.blockInfoId({BLOCK_INFO: info}), 'minecraft:repeater');
        t.equal(blocks.blockInfoState({BLOCK_INFO: info}), 'delay=3,facing=east,locked=false,powered=true');
        t.equal(blocks.blockInfoStateProperty({BLOCK_INFO: info, PROPERTY: 'facing'}), 'east');
        t.equal(blocks.blockInfoHasStateProperty({BLOCK_INFO: info, PROPERTY: 'powered'}), true);
        t.equal(blocks.isMcRemoteError({VALUE: info}), false);
        t.equal(blocks.isMcRemoteError({VALUE: '⟦mcr-error:unknown_block⟧'}), true);
        t.equal(socket.sent.length, before);
        t.end();
    })
);

test('getBlock coalesces monitor requests but explicit calls always fetch', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const monitor = {thread: {updateMonitor: true}};
        const first = blocks.getBlock({X: 1, Y: 2, Z: 3}, monitor);
        const second = blocks.getBlock({X: 1, Y: 2, Z: 3}, monitor);
        t.equal(socket.sent.length, 2, 'hello plus one coalesced getBlock request');
        socket.fireMessage({
            jsonrpc: '2.0',
            id: 2,
            result: {block_id: 'minecraft:stone', state: {}}
        });
        return Promise.all([first, second]).then(values => {
            t.same(values, ['minecraft:stone', 'minecraft:stone']);
            const explicit = blocks.getBlock({X: 1, Y: 2, Z: 3}, {thread: {updateMonitor: false}});
            t.equal(socket.sent.length, 3, 'explicit call bypasses the monitor cache');
            socket.fireMessage({
                jsonrpc: '2.0',
                id: 3,
                result: {block_id: 'minecraft:gold_block', state: {}}
            });
            return explicit.then(value => {
                t.equal(value, 'minecraft:gold_block');
                t.end();
            });
        });
    })
);

test('disconnect clears block information monitor cache and pending requests', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const monitor = {thread: {updateMonitor: true}};
        const result = blocks.getBlock({X: 1, Y: 2, Z: 3}, monitor);
        t.equal(blocks._blockInfoMonitorPending.size, 1);
        socket.fireMessage({
            jsonrpc: '2.0',
            id: 2,
            result: {block_id: 'minecraft:stone', state: {}}
        });
        return result.then(() => {
            t.equal(blocks._blockInfoMonitorCache.size, 1);
            socket.fireClose();
            t.equal(blocks._blockInfoMonitorCache.size, 0);
            t.equal(blocks._blockInfoMonitorPending.size, 0);
            t.end();
        });
    })
);

test('an in-flight monitor response cannot repopulate cache after disconnect', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.getBlock({X: 1, Y: 2, Z: 3}, {thread: {updateMonitor: true}});
        t.equal(blocks._blockInfoMonitorPending.size, 1);
        socket.fireClose();
        return result.then(value => {
            t.equal(value, '⟦mcr-error:remote_error⟧');
            t.equal(blocks._blockInfoMonitorCache.size, 0);
            t.equal(blocks._blockInfoMonitorPending.size, 0);
            t.end();
        });
    })
);

test('malformed StateText is not sent and emits an actionable local reason', t =>
    newConnectedBlocks(newRuntime()).then(({blocks, socket}) => {
        blocks._catalogState = {status: 'current', catalog: catalogBody};
        const before = socket.sent.length;
        return blocks.setBlock({X: 0, Y: 0, Z: 0, BLOCK: 'oak_log', STATE: 'axis=z,'}).then(() => {
            t.equal(socket.sent.length, before);
            t.equal(blocks._lastError.reason, 'invalid_block_state');
            t.end();
        });
    })
);

test('playerAttribute reports dimension and position from player.getPos', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.playerAttribute({PROPERTY: 'x'});
        const msg = socket.lastSent();
        t.equal(msg.method, 'player.getPos');
        t.same(msg.params, []);
        socket.fireMessage({jsonrpc: '2.0',
            id: msg.id,
            result: {
                dimension: 'minecraft:overworld', pos: [5, 6, 7]
            }});
        return result.then(value => {
            t.equal(value, 5);
            t.end();
        });
    })
);

test('playerAttribute resolves the canonical dimension property', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.playerAttribute({PROPERTY: 'dimension'});
        const msg = socket.lastSent();
        socket.fireMessage({jsonrpc: '2.0',
            id: msg.id,
            result: {
                dimension: 'minecraft:the_nether', pos: [0, 64, 0]
            }});
        return result.then(value => {
            t.equal(value, 'minecraft:the_nether');
            t.end();
        });
    })
);

test('playerAttribute rejects a non-canonical dimension result', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.playerAttribute({PROPERTY: 'dimension'});
        const msg = socket.lastSent();
        socket.fireMessage({jsonrpc: '2.0',
            id: msg.id,
            result: {
                dimension: 'overworld', pos: [0, 64, 0]
            }});
        return result.then(value => {
            t.equal(value, '');
            t.end();
        });
    })
);

test('playerAttribute reports yaw and pitch from player.getPose', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const yaw = blocks.playerAttribute({PROPERTY: 'yaw'});
        const yawMessage = socket.lastSent();
        t.equal(yawMessage.method, 'player.getPose');
        t.same(yawMessage.params, []);
        socket.fireMessage({
            jsonrpc: '2.0',
            id: yawMessage.id,
            result: {dimension: 'minecraft:overworld', pos: [5, 6, 7], yaw: 135, pitch: -20}
        });
        return yaw.then(yawValue => {
            t.equal(yawValue, 135);
            const pitch = blocks.playerAttribute({PROPERTY: 'pitch'});
            const pitchMessage = socket.lastSent();
            t.equal(pitchMessage.method, 'player.getPose');
            socket.fireMessage({
                jsonrpc: '2.0',
                id: pitchMessage.id,
                result: {dimension: 'minecraft:overworld', pos: [5, 6, 7], yaw: 135, pitch: -20}
            });
            return pitch.then(pitchValue => {
                t.equal(pitchValue, -20);
                t.end();
            });
        });
    })
);

test('playerAttribute swallows a JSON-RPC error into empty string', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.playerAttribute({PROPERTY: 'y'});
        const msg = socket.lastSent();
        socket.fireMessage({jsonrpc: '2.0',
            id: msg.id,
            error: {code: -32000, message: 'player offline', data: {reason: 'player_offline'}}});
        return result.then(value => {
            t.equal(value, '');
            t.end();
        });
    })
);

test('playerAttribute throttles monitor-driven polls to one bridge request', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const monitorUtil = {thread: {updateMonitor: true}};
        const first = blocks.playerAttribute({PROPERTY: 'x'}, monitorUtil);
        const requestMsg = socket.lastSent();
        socket.fireMessage({jsonrpc: '2.0',
            id: requestMsg.id,
            result: {
                dimension: 'minecraft:overworld', pos: [5, 6, 7]
            }});
        return first.then(value => {
            t.equal(value, 5);
            const sentBefore = socket.sent.length;
            const second = blocks.playerAttribute({PROPERTY: 'y'}, monitorUtil);
            t.equal(socket.sent.length, sentBefore, 'cached result reused, no new bridge request sent');
            return second.then(secondValue => {
                t.equal(secondValue, 6, 'cached pos still answers a different property');
                t.end();
            });
        });
    })
);

test('playerAttribute throttles monitor-driven pose polls separately from position polls', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const monitorUtil = {thread: {updateMonitor: true}};
        const first = blocks.playerAttribute({PROPERTY: 'yaw'}, monitorUtil);
        const requestMsg = socket.lastSent();
        t.equal(requestMsg.method, 'player.getPose');
        socket.fireMessage({
            jsonrpc: '2.0',
            id: requestMsg.id,
            result: {dimension: 'minecraft:overworld', pos: [5, 6, 7], yaw: 90, pitch: 15}
        });
        return first.then(value => {
            t.equal(value, 90);
            const sentBefore = socket.sent.length;
            const second = blocks.playerAttribute({PROPERTY: 'pitch'}, monitorUtil);
            t.equal(socket.sent.length, sentBefore, 'cached pose reused, no new bridge request sent');
            return second.then(secondValue => {
                t.equal(secondValue, 15);
                const position = blocks.playerAttribute({PROPERTY: 'x'}, monitorUtil);
                const positionMessage = socket.lastSent();
                t.equal(positionMessage.method, 'player.getPos', 'position retains the existing wire method');
                socket.fireMessage({
                    jsonrpc: '2.0',
                    id: positionMessage.id,
                    result: {dimension: 'minecraft:overworld', pos: [8, 9, 10]}
                });
                return position.then(positionValue => {
                    t.equal(positionValue, 8);
                    t.end();
                });
            });
        });
    })
);

test('playerAttribute does not throttle explicit (non-monitor) calls', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const first = blocks.playerAttribute({PROPERTY: 'dimension'});
        const firstMsg = socket.lastSent();
        socket.fireMessage({jsonrpc: '2.0',
            id: firstMsg.id,
            result: {
                dimension: 'minecraft:overworld', pos: [0, 0, 0]
            }});
        return first.then(() => {
            const second = blocks.playerAttribute({PROPERTY: 'dimension'});
            const secondMsg = socket.lastSent();
            t.not(secondMsg.id, firstMsg.id, 'a second explicit call sends its own request');
            socket.fireMessage({jsonrpc: '2.0',
                id: secondMsg.id,
                result: {
                    dimension: 'minecraft:the_nether', pos: [0, 0, 0]
                }});
            return second.then(value => {
                t.equal(value, 'minecraft:the_nether');
                t.end();
            });
        });
    })
);

test('setPlayerPos is an acknowledged request with an explicit dimension', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setPlayerPos({DIMENSION: 'the_nether', X: 10, Y: 20, Z: 30});
        const msg = socket.lastSent();
        t.equal(msg.method, 'player.setPos');
        t.same(msg.params, ['the_nether', 10, 20, 30]);
        socket.fireMessage({jsonrpc: '2.0',
            id: msg.id,
            result: {
                dimension: 'minecraft:the_nether', pos: [10, 20, 30]
            }});
        return result.then(() => t.end());
    })
);

test('setPlayerPose sends dimension, position, yaw and pitch in one acknowledged request', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setPlayerPose({
            DIMENSION: 'the_nether',
            X: 10,
            Y: 20,
            Z: 30,
            YAW: 135,
            PITCH: -20
        });
        const msg = socket.lastSent();
        t.equal(msg.method, 'player.setPose');
        t.same(msg.params, ['the_nether', 10, 20, 30, 135, -20]);
        socket.fireMessage({
            jsonrpc: '2.0',
            id: msg.id,
            result: {dimension: 'minecraft:the_nether', pos: [10, 20, 30], yaw: 135, pitch: -20}
        });
        return result.then(() => t.end());
    })
);

test('setPlayerXYZ fetches the current dimension before teleporting', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        const result = blocks.setPlayerXYZ({X: 10, Y: 20, Z: 30});
        const getPosMsg = socket.lastSent();
        t.equal(getPosMsg.method, 'player.getPos');
        t.same(getPosMsg.params, []);
        socket.fireMessage({jsonrpc: '2.0',
            id: getPosMsg.id,
            result: {
                dimension: 'minecraft:the_nether', pos: [1, 2, 3]
            }});
        return nextTurn().then(() => {
            const setPosMsg = socket.lastSent();
            t.equal(setPosMsg.method, 'player.setPos');
            t.same(setPosMsg.params, ['minecraft:the_nether', 10, 20, 30]);
            socket.fireMessage({jsonrpc: '2.0',
                id: setPosMsg.id,
                result: {
                    dimension: 'minecraft:the_nether', pos: [10, 20, 30]
                }});
            return result.then(() => t.end());
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
        t.equal(closed.displayAlias, '');
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

test('hello uses a validated hash-matched catalog cache without a network request', async t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);
    blocks._catalogCache = {
        get: hash => Promise.resolve({catalog: catalogResult, fetchedAt: 1234, hash}),
        set: () => Promise.resolve(true)
    };
    const catalogReady = nextCatalogStatus(runtime, 'current');

    const connected = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({
        jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '23.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            catalogHash,
            world_constants: {y_sea: 63}
        }
    });

    await connected;
    await catalogReady;
    t.equal(socket.sent.length, 1, 'catalog.get is skipped on a valid cache hit');
    t.equal(latestCatalog(runtime).source, 'cache');
    t.equal(latestCatalog(runtime).fetchedAt, 1234);
    t.same(latestCatalog(runtime).catalog, catalogResult);
});

test('catalog cache miss fetches after hello without delaying connection', async t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    const writes = [];
    const blocks = new McRemote(runtime);
    blocks._catalogCache = {
        get: () => Promise.resolve(null),
        set: (hash, record) => {
            writes.push({hash, record});
            return Promise.resolve(true);
        }
    };

    const connected = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({
        jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '23.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            catalogHash,
            world_constants: {y_sea: 63}
        }
    });

    await connected;
    t.equal(latestCatalog(runtime).status, 'not_acquired', 'connect resolves before catalog response');
    await waitFor(() => socket.sent.some(payload => JSON.parse(payload).method === 'catalog.get'));
    const request = socket.sent.map(payload => JSON.parse(payload))
        .find(message => message.method === 'catalog.get');
    t.same(request.params, []);
    const catalogReady = nextCatalogStatus(runtime, 'current');
    socket.fireMessage({jsonrpc: '2.0', id: request.id, result: catalogResult});

    await catalogReady;
    t.equal(latestCatalog(runtime).source, 'network');
    t.equal(writes.length, 1);
    t.equal(writes[0].hash, catalogHash);
    t.same(writes[0].record.catalog, catalogResult);
});

test('invalid catalog is unavailable but leaves the connection usable', async t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);
    blocks._catalogCache = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(true)
    };

    const connected = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({
        jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '23.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            catalogHash,
            world_constants: {y_sea: 63}
        }
    });
    await connected;
    await waitFor(() => socket.sent.some(payload => JSON.parse(payload).method === 'catalog.get'));
    const request = socket.sent.map(payload => JSON.parse(payload))
        .find(message => message.method === 'catalog.get');
    const changedCatalog = Object.assign({}, catalogResult, {
        particle: {'minecraft:campfire_cosy_smoke': {}}
    });
    const catalogUnavailable = nextCatalogStatus(runtime, 'unavailable');
    socket.fireMessage({jsonrpc: '2.0', id: request.id, result: changedCatalog});

    await catalogUnavailable;
    t.equal(latestObservation(runtime).status, 'connected');
    t.equal(blocks._socket, socket);
});

test('disconnect hides catalog data and ignores an in-flight acquisition', async t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = newRuntime();
    const blocks = new McRemote(runtime);
    blocks._catalogCache = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(true)
    };

    const connected = blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();
    socket.fireMessage({
        jsonrpc: '2.0',
        id: 1,
        result: {
            protocol: '23.0.0',
            mc_version: '1.21.11',
            supported_mc_versions: ['1.21.11'],
            catalogHash,
            world_constants: {y_sea: 63}
        }
    });
    await connected;
    await waitFor(() => socket.sent.some(payload => JSON.parse(payload).method === 'catalog.get'));
    socket.fireClose({code: 1006, reason: 'network_lost'});

    await nextTurn();
    t.equal(latestCatalog(runtime).status, 'not_acquired');
    t.equal(latestCatalog(runtime).catalog, null);
});

const RealRuntime = require('../../src/engine/runtime');

const enabledConfig = {
    bridgeUrl: 'wss://bridge.example.test',
    defaultSandbox: DEFAULT_SANDBOX_ROUTE,
    connectionEnabled: true,
    releaseIdentity: 'test-build'
};

const disabledRuntime = () => Object.assign(newRuntime(), {
    getMcRemoteRuntimeConfig: () => Object.assign({}, enabledConfig, {connectionEnabled: false})
});

test('disableMcRemoteConnection turns the connection off for the life of the runtime', t => {
    const runtime = new RealRuntime();
    t.equal(runtime.getMcRemoteRuntimeConfig().connectionEnabled, true);
    runtime.disableMcRemoteConnection();
    t.equal(runtime.getMcRemoteRuntimeConfig().connectionEnabled, false);
    t.end();
});

test('runtime config cannot re-enable a connection disabled at build time', t => {
    const runtime = new RealRuntime();
    runtime.disableMcRemoteConnection();
    runtime.setMcRemoteRuntimeConfig(enabledConfig);
    t.equal(runtime.getMcRemoteRuntimeConfig().connectionEnabled, false);
    t.end();
});

test('connect on a disabled deployment opens no socket and reads no token', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    global.localStorage.setItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE), 'stored-token');
    const blocks = new McRemote(disabledRuntime());
    return blocks.connect().then(
        () => t.fail('connect should reject on a disabled deployment'),
        error => {
            t.equal(FakeWebSocket.instances.length, 0);
            t.equal(error.reason, 'connection_disabled');
            t.equal(global.localStorage.getItem(sessionTokenKey(DEFAULT_SANDBOX_ROUTE)), 'stored-token');
            t.end();
        }
    );
});

test('a disabled deployment is reported as disabled rather than as not connected', t => {
    FakeWebSocket.instances = [];
    global.localStorage.clear();
    const runtime = disabledRuntime();
    const blocks = new McRemote(runtime);
    return blocks._request('chat.post', ['hi']).then(
        () => t.fail('request should reject on a disabled deployment'),
        error => {
            t.equal(error.reason, 'connection_disabled');
            t.notMatch(error.message, /not connected to bridge/);
            t.end();
        }
    );
});

test('a disabled deployment emits showcase guidance instead of a connect prompt', async t => {
    const runtime = disabledRuntime();
    const blocks = new McRemote(runtime);

    await blocks.postToChat({MSG: 'hi'});
    await blocks.postToChat({MSG: 'again'});

    t.equal(actionableErrors(runtime).length, 1);
    t.equal(actionableErrors(runtime)[0].reason, 'connection_disabled');
});

test('a disabled deployment still shows every block', t => {
    const enabled = new McRemote(newRuntime()).getInfo();
    const disabled = new McRemote(disabledRuntime()).getInfo();
    t.same(disabled.blocks.map(block => block.opcode), enabled.blocks.map(block => block.opcode));
    t.end();
});
