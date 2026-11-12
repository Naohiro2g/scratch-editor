const test = require('tap').test;
const McRemote = require('../../src/extensions/scratch3_mcremote');
const Runtime = require('../../src/engine/runtime');
const crypto = require('crypto');
const {canonicalStringify} = require('../../src/extensions/scratch3_mcremote/catalog');

const turns = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
};

class Clock {
    constructor () {
        this.time = 0;
        this.tasks = new Map();
        this.next = 0;
    }
    now () {
        return this.time;
    }
    random () {
        return 0.5;
    }
    setTimeout (fn, ms) {
        const id = ++this.next;
        this.tasks.set(id, {fn, at: this.time + ms});
        return id;
    }
    clearTimeout (id) {
        this.tasks.delete(id);
    }
    async tick (ms) {
        const until = this.time + ms;
        for (;;) {
            await turns();
            const next = [...this.tasks.entries()].filter(([, task]) => task.at <= until)
                .sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            this.time = next[1].at;
            this.tasks.delete(next[0]);
            next[1].fn();
        }
        this.time = until;
        await turns();
    }
}

class Socket {
    constructor () {
        this.readyState = 0;
        this.bufferedAmount = 0;
        this.protocol = 'mcremote.bridge.one-shot.v1';
        this.sent = [];
        this.listeners = {};
        Socket.instances.push(this);
    }
    addEventListener (name, fn) {
        (this.listeners[name] = this.listeners[name] || []).push(fn);
    }
    emit (name, event = {}) {
        (this.listeners[name] || []).forEach(fn => fn(event));
    }
    open () {
        this.readyState = 1; this.emit('open');
    }
    send (json) {
        const envelope = JSON.parse(json);
        this.sent.push(envelope.payload ? JSON.parse(envelope.payload) : envelope);
    }
    reply (result, id = this.sent[this.sent.length - 1].id) {
        this.emit('message', {data: JSON.stringify({jsonrpc: '2.0', id, result})});
    }
    fail (reason, id = this.sent[this.sent.length - 1].id) {
        this.emit('message', {data: JSON.stringify({jsonrpc: '2.0',
            id,
            error: {code: -32000, message: reason, data: {reason}}})});
    }
    close (code = 1006, reason = 'network_lost') {
        this.readyState = 3;
        this.emit('close', {code, reason});
    }
}
Socket.OPEN = 1;
Socket.instances = [];
const hello = overrides => Object.assign({protocol: '23.2.1',
    catalogHash: null,
    dimension: 'minecraft:overworld',
    origin: [200, 0, 200],
    server: {version: 'a'},
    session: {id: 'a'}}, overrides);
const setup = (policy = {}) => {
    Socket.instances = [];
    global.WebSocket = Socket;
    const values = new Map();
    global.localStorage = {getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)};
    const events = [];
    const hats = [];
    const runtime = {emit: (type, payload) => events.push({type, payload}), startHats: name => hats.push(name)};
    const blocks = new McRemote(runtime, policy);
    const clock = new Clock();
    blocks._connectionClock = clock;
    return {blocks, clock, events, hats, values};
};
const connected = async policy => {
    const state = setup(policy);
    const opening = state.blocks.connect();
    const socket = Socket.instances[0];
    socket.open();
    await turns();
    socket.reply(hello());
    await opening;
    return {...state, socket};
};

test('close diagnostics stay on the connection, sent requests fail without a wire code or reason', async t => {
    const {blocks, socket, events} = await connected();
    const result = blocks._request('world.getBlock', [0, 0, 0]).catch(error => error);
    socket.close(1011, 'private_transport_detail');
    const error = await result;
    t.equal(error.name, 'McRemoteCompletionUnknownError');
    t.equal(error.code, undefined);
    t.equal(error.reason, undefined);
    t.equal(error.origin, 'client');
    const observation = events.filter(event => event.type === Runtime.MCREMOTE_OBSERVATION_UPDATE).pop().payload;
    t.equal(observation.lastError.code, 1011);
    t.equal(observation.lastError.reason, 'private_transport_detail');
    t.equal(socket.sent.length, 2, 'lost request is never resent');
});

test('response idle clock resets on receive, extends per call and retires every pending request', async t => {
    const {blocks, socket, clock} = await connected({requestIdleTimeoutMs: 100});
    const first = blocks._request('world.getBlock', [0, 0, 0]).catch(error => error);
    await clock.tick(90);
    const second = blocks._request('world.getBlock', [1, 0, 0], {requestIdleTimeoutMs: 200}).catch(error => error);
    socket.reply({block_id: 'minecraft:stone', state: {}}, socket.sent[1].id);
    await first;
    await clock.tick(190);
    t.equal(socket.readyState, 1, 'the extended wait starts at the last reception');
    await clock.tick(10);
    t.equal(socket.readyState, 3, 'idle timeout retires the connection');
    if (socket.readyState !== 3) socket.close();
    t.equal((await second).name, 'McRemoteCompletionUnknownError');
    t.equal(blocks._pending.size, 0);
});

test('overlapping calls share one reconnect and restore only confirmed build', async t => {
    const {blocks, socket, events} = await connected();
    const changing = blocks._setBuildContext('build.setOrigin', [10, 0, 20]);
    socket.reply({dimension: 'minecraft:the_nether', origin: [10, 0, 20]});
    await changing;
    const lostSetter = blocks._request('build.setOrigin', [99, 0, 99]).catch(error => error);
    socket.close();
    await lostSetter;
    const first = blocks._request('world.getBlock', [0, 0, 0]).catch(error => error);
    const second = blocks._request('world.getBlock', [1, 0, 0]).catch(error => error);
    await turns();
    t.equal(Socket.instances.length, 2, 'one socket for concurrent reconnect callers');
    const replacement = Socket.instances[1];
    if (!replacement) return;
    replacement.open();
    await turns();
    t.same(replacement.sent[0].params.build, {dimension: 'minecraft:the_nether', origin: [10, 0, 20]});
    replacement.reply(hello({dimension: 'minecraft:the_nether',
        origin: [10, 0, 20],
        session: {id: 'b'},
        server: {version: 'b'}}));
    await turns();
    const requests = replacement.sent.filter(message => message.method === 'world.getBlock');
    t.equal(requests.length, 2);
    requests.forEach(message => replacement.reply({block_id: 'minecraft:stone', state: {}}, message.id));
    await Promise.all([first, second]);
    const event = events.find(item => item.type === Runtime.MCREMOTE_CONNECTION_EVENT &&
        item.payload.type === 'reconnected').payload;
    t.match(event, {epoch: 2, previousEpoch: 1, eventLoss: true, sessionChanged: true, serverChanged: true});
    t.ok(Object.isFrozen(event), 'connection notifications are read-only');
    t.equal(replacement.sent.some(message => message.method === 'build.setOrigin'), false, 'no replay of setter');
});

test('reconnect auth_required is not sent and never starts automatic pairing', async t => {
    const {blocks, socket} = await connected();
    socket.close();
    const call = blocks._request('world.getBlock', [0, 0, 0]).catch(error => error);
    await turns();
    const replacement = Socket.instances[1];
    t.ok(replacement, 'next call starts reconnect');
    if (!replacement) return;
    replacement.open();
    await turns();
    replacement.fail('auth_required');
    const error = await call;
    t.equal(error.name, 'McRemoteNotSentError');
    t.equal(error.notSent, true);
    t.equal(error.reason, undefined);
    t.same(replacement.sent.map(message => message.method), ['hello']);
});

test('automatic reconnect can be disabled', async t => {
    const {blocks, socket} = await connected({autoReconnect: false});
    socket.close();
    const error = await blocks._request('world.getBlock', [0, 0, 0]).catch(failure => failure);
    t.equal(error.name, 'McRemoteNotSentError');
    t.equal(Socket.instances.length, 1);
});

test('token rejection returns to tokenless hello without pairing UI or a paired hat', async t => {
    const {blocks, hats} = setup();
    blocks._saveSessionToken('mcrs_test');
    const opening = blocks.connect();
    opening.catch(() => {});
    const socket = Socket.instances[0];
    socket.open();
    await turns();
    socket.fail('token_revoked');
    await turns();
    t.equal(socket.sent[1].method, 'hello');
    if (socket.sent[1].method !== 'hello') {
        socket.close(); await opening.catch(() => {}); return;
    }
    t.equal(socket.sent[1].params.auth, undefined);
    socket.reply(hello());
    await opening;
    t.same(hats, []);
    t.equal(blocks.pairCode(), '');
});

test('pairing hat fires after successful hello, and local expiry never sends an expired poll', async t => {
    const {blocks, hats, clock} = setup();
    const opening = blocks.connect();
    opening.catch(() => {});
    const socket = Socket.instances[0];
    socket.open();
    await turns();
    socket.fail('auth_required');
    await turns();
    socket.reply({pairing_id: 'test-pair', pair_code: '123456', expires_in: 120});
    await turns();
    socket.reply({status: 'ok', token: 'mcrs_test'});
    await turns();
    t.same(hats, [], 'saving token does not fire a successful-pairing hat');
    socket.reply(hello());
    await opening;
    t.same(hats, ['mcremote_whenPaired']);
    const count = socket.sent.length;
    const expired = blocks._pollPair('test-pair', clock.now() - 1).catch(failure => failure);
    t.equal(socket.sent.length, count, 'expiry is checked before poll');
    if (socket.sent.length !== count) {
        socket.close(); await expired; return;
    }
    const error = await expired;
    t.equal(error.origin, 'client');
    t.equal(error.localReason, 'pair_expired');
    t.equal(error.code, undefined);
    t.equal(error.reason, undefined);
});

test('a lost pairing poll continues on a new socket with the same pairing id', async t => {
    const {blocks, clock, hats} = setup();
    const opening = blocks.connect();
    opening.catch(() => {});
    const socket = Socket.instances[0];
    socket.open();
    await turns();
    socket.fail('auth_required');
    await turns();
    socket.reply({pairing_id: 'test-pair', pair_code: '123456', expires_in: 120});
    await turns();
    t.equal(socket.sent[socket.sent.length - 1].method, 'auth.pairPoll');
    socket.close(1011, 'one_shot_incomplete_response');
    await turns();
    await clock.tick(1000);
    const replacement = Socket.instances[1];
    t.ok(replacement, 'poll continuation opens transport without starting a second pairing');
    if (!replacement) {
        await opening.catch(() => {}); return;
    }
    replacement.open();
    await turns();
    t.same(replacement.sent[0].params, {pairing_id: 'test-pair'});
    t.equal(replacement.sent[0].method, 'auth.pairPoll');
    replacement.reply({status: 'ok', token: 'mcrs_test'});
    await turns();
    t.equal(replacement.sent[1].method, 'hello');
    replacement.reply(hello());
    await opening;
    t.same(hats, ['mcremote_whenPaired']);
    t.equal(Socket.instances.flatMap(item => item.sent).filter(message =>
        message.method === 'auth.pairBegin').length, 1);
});

test('a failed final hello after pairing transport recovery closes the replacement and fires no hat', async t => {
    const {blocks, clock, hats} = setup();
    const opening = blocks.connect().catch(error => error);
    const first = Socket.instances[0];
    first.open();
    await turns();
    first.fail('auth_required');
    await turns();
    first.reply({pairing_id: 'test-pair', pair_code: '123456', expires_in: 120});
    await turns();
    first.close();
    await clock.tick(1000);
    const second = Socket.instances[1];
    second.open();
    await turns();
    second.reply({status: 'ok', token: 'mcrs_test'});
    await turns();
    second.fail('token_revoked');
    t.equal((await opening).reason, 'token_revoked');
    t.equal(second.readyState, 3, 'the replacement transport is retired');
    t.equal(blocks._socket, null);
    t.same(hats, []);
    t.equal(blocks._readSessionToken(), '');
});

test('a request waiting for transport capacity is not sent when the connection closes', async t => {
    const {blocks, socket, clock} = await connected();
    socket.bufferedAmount = 1024 * 1024;
    const first = blocks._request('world.getBlock', [0, 0, 0]).catch(error => error);
    const second = blocks._request('world.getBlock', [1, 0, 0]).catch(error => error);
    socket.close();
    await clock.tick(4);
    for (const error of await Promise.all([first, second])) {
        t.equal(error.name, 'McRemoteNotSentError');
        t.equal(error.completionUnknown, undefined);
        t.equal(error.code, undefined);
        t.equal(error.reason, undefined);
    }
    t.equal(socket.sent.length, 1, 'only hello was accepted');
});

test('retry intervals grow with jitter and the terminal caller remains not sent', async t => {
    const {blocks, socket, clock} = await connected({reconnectInitialDelayMs: 100,
        reconnectMaxDelayMs: 200,
        reconnectTimeoutMs: 650});
    socket.close();
    const call = blocks._request('world.getBlock', [0, 0, 0]).catch(error => error);
    await turns();
    t.equal(Socket.instances.length, 2);
    Socket.instances[1].emit('error');
    await clock.tick(99);
    t.equal(Socket.instances.length, 2);
    await clock.tick(1);
    t.equal(Socket.instances.length, 3);
    Socket.instances[2].emit('error');
    await clock.tick(199);
    t.equal(Socket.instances.length, 3);
    await clock.tick(1);
    t.equal(Socket.instances.length, 4);
    Socket.instances[3].emit('error');
    await clock.tick(200);
    t.equal(Socket.instances.length, 5);
    Socket.instances[4].emit('error');
    await clock.tick(150);
    t.equal((await call).name, 'McRemoteNotSentError');
    t.equal(Socket.instances.length, 5);
    t.equal(Socket.instances.flatMap(item => item.sent)
        .filter(message => message.method === 'world.getBlock').length, 0);
});

test('a failed socket opening during pairing is retried and bounded by the pairing deadline', async t => {
    const {blocks, clock} = setup();
    const opening = blocks.connect().catch(error => error);
    const first = Socket.instances[0];
    first.open();
    await turns();
    first.fail('auth_required');
    await turns();
    first.reply({pairing_id: 'test-pair', pair_code: '123456', expires_in: 2});
    await turns();
    first.close();
    await clock.tick(1000);
    const second = Socket.instances[1];
    second.emit('error');
    await clock.tick(1000);
    let settled = false;
    opening.then(() => {
        settled = true;
    });
    await turns();
    t.equal(settled, true, 'opening failure cannot suppress expiry forever');
    if (!settled) return;
    const error = await opening;
    t.equal(error.localReason, 'pair_expired');
    t.equal(error.reason, undefined);
    t.equal(Socket.instances.length, 2);
});

test('a retired hello cannot publish connected state after its response microtask', async t => {
    const {blocks} = setup();
    const opening = blocks.connect().catch(error => error);
    const socket = Socket.instances[0];
    socket.open();
    await turns();
    socket.reply(hello());
    socket.close();
    await opening;
    await turns();
    t.not(blocks._connectionStatus, 'connected');
    t.equal(blocks._connectionEpoch, 0);
    t.equal(blocks._lastSuccessfulHello, null);
});

test('a retired capacity waiter cannot reject a new request reusing its id', async t => {
    const {blocks, socket, clock} = await connected();
    socket.bufferedAmount = 1024 * 1024;
    const retired = blocks._request('world.getBlock', [0, 0, 0]).catch(error => error);
    socket.close();
    await retired;
    let outcome = 'pending';
    const following = blocks._request('world.getBlock', [1, 0, 0]).then(value => {
        outcome = 'success';
        return value;
    }, error => {
        outcome = error.name;
    });
    await turns();
    const replacement = Socket.instances[1];
    replacement.open();
    await turns();
    replacement.reply(hello());
    await turns();
    const request = replacement.sent[1];
    t.equal(request.id, 2, 'request id is scoped to the new transport');
    await clock.tick(4);
    t.equal(outcome, 'pending', 'old asynchronous cleanup cannot settle a new operation');
    t.ok(blocks._pending.has(2));
    replacement.reply({block_id: 'minecraft:stone', state: {}}, request.id);
    await following;
    t.equal(outcome, 'success');
});

test('cleanup of an old bootstrap cannot close a subsequent independent connect', async t => {
    const {blocks} = setup();
    const opening = blocks.connect();
    const first = Socket.instances[0];
    first.open();
    await turns();
    const next = opening.catch(() => blocks.connect()).catch(error => error);
    first.close();
    await turns();
    const second = Socket.instances[1];
    t.equal(second.readyState, 0, 'old bootstrap cannot close the new connecting socket');
    if (second.readyState !== 0) return;
    second.open();
    await turns();
    second.reply(hello());
    await next;
    t.equal(blocks._socket, second);
    t.equal(blocks._connectionStatus, 'connected');
});

test('reconnect invalidates cursor and rejects an old catalog body before fetching the new hash', async t => {
    const {blocks, socket} = await connected();
    const catalog = block => {
        const body = {block: {[block]: {states: {}, default_state: {}}}, entity: {}, particle: {}};
        return Object.assign({catalogHash: crypto.createHash('sha256').update(canonicalStringify(body))
            .digest('hex')}, body);
    };
    const oldCatalog = catalog('minecraft:stone');
    const newCatalog = catalog('minecraft:dirt');
    const lookups = [];
    blocks._catalogState = {status: 'current', catalogHash: oldCatalog.catalogHash, catalog: oldCatalog};
    blocks._catalogCache = {get: hash => {
        lookups.push(hash);
        return Promise.resolve({catalog: oldCatalog, fetchedAt: 1});
    },
    set: () => Promise.resolve()};
    blocks._eventStatus.cursor = 7;
    socket.close();
    t.equal(blocks._eventStatus.cursor, 0);
    const call = blocks._request('world.getBlock', [0, 0, 0]);
    await turns();
    const replacement = Socket.instances[1];
    replacement.open();
    await turns();
    replacement.reply(hello({catalogHash: newCatalog.catalogHash}));
    await turns();
    t.same(lookups, [newCatalog.catalogHash]);
    t.not(blocks._catalogState.status, 'current', 'old catalog cannot become current during revalidation');
    const request = replacement.sent.find(message => message.method === 'world.getBlock');
    replacement.reply({block_id: 'minecraft:dirt', state: {}}, request.id);
    await call;
    // Hashing uses WebCrypto in browsers and may complete outside the microtask queue in Node.
    for (let i = 0; i < 100 && !replacement.sent.some(message => message.method === 'catalog.get'); i++) {
        await new Promise(resolve => setImmediate(resolve));
    }
    const fetch = replacement.sent.find(message => message.method === 'catalog.get');
    t.ok(fetch, 'invalid cached body falls back to the network');
    replacement.reply(newCatalog, fetch.id);
    await blocks._catalogPromise;
    t.equal(blocks._catalogState.status, 'current');
    t.equal(blocks._catalogState.catalogHash, newCatalog.catalogHash);
    t.equal(blocks._catalogState.catalog.block['minecraft:stone'], void 0);
    t.ok(blocks._catalogState.catalog.block['minecraft:dirt']);
});

test('a delivery notice cannot overwrite the connection transport diagnostic', async t => {
    const {blocks, socket, events} = await connected();
    const waiting = blocks._request('connection.flush', []).catch(error => error);
    socket.close(1011, 'backpressure');
    await blocks._actionableCommandError('connection.flush', await waiting);
    const observation = events.filter(event => event.type === Runtime.MCREMOTE_OBSERVATION_UPDATE).pop().payload;
    t.match(observation.transportDiagnostic, {code: 1011, reason: 'backpressure'});
    t.equal(observation.lastError.reason, void 0);
    t.equal(observation.lastError.completionUnknown, true);
});

test('transport capacity timeout settles unsent requests and FAST notifications as not sent', async t => {
    const {blocks, socket, clock} = await connected();
    socket.bufferedAmount = 1024 * 1024;
    const request = blocks._request('world.getBlock', [0, 0, 0]).catch(error => error);
    const notification = blocks._startNotification('world.setBlock',
        [0, 0, 0, {block_id: 'minecraft:stone', state: {}}]).completion.catch(error => error);
    await clock.tick(5000);
    t.equal(socket.readyState, 3);
    if (socket.readyState !== 3) {
        socket.close(); await clock.tick(4);
    }
    for (const error of await Promise.all([request, notification])) {
        t.equal(error.name, 'McRemoteNotSentError');
        t.equal(error.reason, void 0);
        t.equal(error.code, void 0);
    }
    t.equal(socket.sent.length, 1);
});

test('expected_hello exposes a retired plugin session behind an open Bridge without replaying the request', async t => {
    const {blocks, socket} = await connected();
    const rejected = blocks._request('world.getBlock', [0, 0, 0]).catch(error => error);
    const unanswered = blocks._request('world.setBlock',
        [1, 0, 0, {block_id: 'minecraft:stone', state: {}}]).catch(error => error);
    socket.emit('message', {data: JSON.stringify({jsonrpc: '2.0',
        id: socket.sent[1].id,
        error: {code: -32600, message: 'expected hello', data: {reason: 'expected_hello'}}})});
    const error = await rejected;
    t.match(error, {origin: 'server', reason: 'expected_hello', code: -32600});
    t.equal(blocks._connectionStatus, 'closed', 'server-mandated close retires the logical session');
    if (socket.readyState !== 3) socket.close();
    t.equal((await unanswered).name, 'McRemoteCompletionUnknownError');
    const next = blocks._request('world.getBlock', [2, 0, 0]);
    await turns();
    const replacement = Socket.instances[1];
    replacement.open();
    await turns();
    t.equal(replacement.sent[0].method, 'hello');
    replacement.reply(hello());
    await turns();
    replacement.reply({block_id: 'minecraft:stone', state: {}});
    await next;
    t.same(replacement.sent.map(message => message.method), ['hello', 'world.getBlock']);
    t.equal(socket.sent.length, 3, 'no replay of the rejected getter or unanswered setter');
});
