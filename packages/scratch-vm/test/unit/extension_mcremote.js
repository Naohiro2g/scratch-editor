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
            protocol: '21.0.0', mc_version: '1.21.11', catalogHash: null
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

test('setBlock is a fire-and-forget notification (no id)', t =>
    newConnectedBlocks().then(({blocks, socket}) => {
        blocks.setBlock({X: 1, Y: 2, Z: 3, BLOCK: 'minecraft:stone'});
        const msg = socket.lastSent();
        t.equal(msg.jsonrpc, '2.0');
        t.equal(msg.method, 'world.setBlock');
        t.notOk('id' in msg, 'notification omits id');
        t.same(msg.params, [1, 2, 3, 'minecraft:stone']);
        t.end();
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
