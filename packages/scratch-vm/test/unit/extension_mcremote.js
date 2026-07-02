const test = require('tap').test;
const McRemote = require('../../src/extensions/scratch3_mcremote/index.js');

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
    fireClose () {
        this.readyState = 3; // CLOSED
        this._emit('close');
    }
    lastSent () {
        return JSON.parse(this.sent[this.sent.length - 1]);
    }
}
FakeWebSocket.OPEN = 1;
FakeWebSocket.instances = [];

global.WebSocket = FakeWebSocket;

const newConnectedBlocks = () => {
    FakeWebSocket.instances = [];
    const blocks = new McRemote({});
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
    const blocks = new McRemote({});
    blocks.connect();
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    t.equal(socket.url, 'wss://bridge.mc-remote.com');
    const hello = socket.lastSent();
    t.equal(hello.jsonrpc, '2.0');
    t.equal(hello.id, 1, 'client-numbered id starts at 1');
    t.equal(hello.method, 'hello');
    t.equal(hello.params.protocol, '21.0.0', 'clean protocol semver, no b1 suffix');
    t.equal(hello.params.client.name, 'scratch-mcremote');
    t.equal(hello.params.client.version, '2100.0.0b1', 'client build label is diagnostic only');
    t.end();
});

test('connectTo forwards the sandbox name in hello params', t =>
    newConnectedBlocks().then(() => {
        FakeWebSocket.instances = [];
        const blocks = new McRemote({});
        blocks.connectTo({NAME: 'sb2'});
        const socket = FakeWebSocket.instances[0];
        socket.fireOpen();
        t.equal(socket.lastSent().params.sandbox, 'sb2');
        t.end();
    })
);

test('connectTo default sandbox matches the bridge default target', t => {
    const blocks = new McRemote({});
    const connectTo = blocks.getInfo().blocks.find(block => block.opcode === 'connectTo');
    t.equal(connectTo.arguments.NAME.defaultValue, 'sb.mc-remote.com');
    t.end();
});

test('build world block uses the fixed dimension menu values', t => {
    const blocks = new McRemote({});
    const info = blocks.getInfo();
    const setWorld = info.blocks.find(block => block.opcode === 'setWorld');
    t.equal(setWorld.arguments.WORLD.defaultValue, 'overworld');
    t.same(info.menus.worlds.items.map(item => item.value), ['overworld', 'nether', 'the_end']);
    t.end();
});

test('setBuildOrigin block shows the fixed y value', t => {
    const blocks = new McRemote({});
    const setBuildOrigin = blocks.getInfo().blocks.find(block => block.opcode === 'setBuildOrigin');
    t.equal(setBuildOrigin.text, 'set build origin (X, Y, Z) to [X], 0, [Z]');
    t.same(Object.keys(setBuildOrigin.arguments), ['X', 'Z']);
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
        socket.fireMessage({jsonrpc: '2.0', id: 2, result: null});
        return result.then(() => t.end());
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

test('postToChat is an acknowledged request in b1', t =>
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

test('setBlock is an acknowledged request in b1', t =>
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

test('setBlocks is an acknowledged request in b1', t =>
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

test('replies for unknown ids are dropped', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        // Should not throw when no pending entry matches.
        socket.fireMessage({jsonrpc: '2.0', id: 999, result: 'ignored'});
        t.equal(blocks._pending.size, 0);
        t.end();
    })
);
