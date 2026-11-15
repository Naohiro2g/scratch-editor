const test = require('tap').test;
const McRemote = require('../../src/extensions/scratch3_mcremote');
const Runtime = require('../../src/engine/runtime');

test('ID-scoped tokens stay separate on the same host and do not reuse host-scoped credentials', t => {
    const values = new Map([['mcremote.sessionToken.v1:minecraft', 'legacy-token']]);
    const previous = global.localStorage;
    global.localStorage = {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    };
    t.teardown(() => {
        global.localStorage = previous;
    });
    const runtime = new Runtime();
    runtime.setMcRemoteRuntimeConfig({targetRouting: 'id',
        defaultSandbox: 'minecraft',
        bridgeUrl: 'ws://127.0.0.1:8602',
        connectionEnabled: true,
        releaseIdentity: '2321.1.0'});
    const blocks = new McRemote(runtime);
    t.equal(blocks._readSessionToken(), '', 'a legacy host token is not reused as an ID token');
    blocks._saveSessionToken('minecraft-token');
    runtime.setMcRemoteConnectionTarget({sandboxRoute: 'unity', label: 'Unity箱庭'});
    t.equal(blocks._readSessionToken(), '');
    blocks._saveSessionToken('unity-token');
    runtime.setMcRemoteConnectionTarget({sandboxRoute: 'minecraft', label: '名前を変更'});
    t.equal(blocks._readSessionToken(), 'minecraft-token');
    blocks._clearSessionToken();
    runtime.setMcRemoteConnectionTarget({sandboxRoute: 'unity', label: 'Unity箱庭'});
    t.equal(blocks._readSessionToken(), 'unity-token', 'clearing one target does not clear the other');
    t.end();
});

test('connect closes an active old target before dialing the selected ID', async t => {
    const previous = global.WebSocket;
    global.WebSocket = {OPEN: 1};
    t.teardown(() => {
        global.WebSocket = previous;
    });
    const runtime = new Runtime();
    runtime.setMcRemoteRuntimeConfig({targetRouting: 'id',
        defaultSandbox: 'minecraft',
        bridgeUrl: 'ws://127.0.0.1:8602',
        connectionEnabled: true,
        releaseIdentity: '2321.1.0'});
    const blocks = new McRemote(runtime);
    blocks._connectionTarget = {sandboxRoute: 'minecraft', label: 'Minecraft'};
    blocks._connectionStatus = 'connected';
    blocks._hasConnected = true;
    let closed = false;
    const oldSocket = {readyState: 1,
        close: () => {
            closed = true;
        }};
    blocks._socket = oldSocket;
    let dialed = '';
    blocks._dial = async () => {
        t.equal(closed, true, 'old transport closes before the new dial');
        dialed = blocks._bridgeUrl(blocks._connectionTarget.sandboxRoute);
    };
    runtime.setMcRemoteConnectionTarget({sandboxRoute: 'unity', label: 'Unity箱庭'});
    await blocks.connect();
    t.equal(closed, true);
    t.equal(dialed, 'ws://127.0.0.1:8602/?sandbox=unity');
    t.equal(blocks._hasConnected, false, 'old target reconnect context is not reused');
    t.end();
});

const switchingFixture = t => {
    const previous = global.WebSocket;
    global.WebSocket = {OPEN: 1};
    t.teardown(() => {
        global.WebSocket = previous;
    });
    const runtime = new Runtime();
    const blocks = new McRemote(runtime);
    blocks._connectionTarget = {sandboxRoute: 'minecraft', label: 'Minecraft'};
    blocks._socket = {readyState: 1, close: () => {}};
    blocks._dial = async () => {};
    return {runtime, blocks};
};

test('a late pairPoll response cannot save an old target token under the new target', async t => {
    const {runtime, blocks} = switchingFixture(t);
    let reply;
    blocks._request = () => new Promise(resolve => {
        reply = resolve;
    });
    let saved = false;
    blocks._saveSessionToken = () => {
        saved = true;
    };
    const polling = blocks._pollPair('old-pair', Date.now() + 60000);
    runtime.setMcRemoteConnectionTarget({sandboxRoute: 'unity', label: 'Unity箱庭'});
    await blocks.connect();
    reply({status: 'ok', token: 'old-target-token'});
    await t.rejects(polling, {localReason: 'connection_target_changed'});
    t.equal(saved, false);
    t.end();
});

test('an old pairing cleanup does not erase the new pairing code', async t => {
    const {runtime, blocks} = switchingFixture(t);
    let rejectPair;
    let pairStarted;
    const started = new Promise(resolve => {
        pairStarted = resolve;
    });
    blocks._hello = async () => {
        throw Object.assign(new Error('auth required'), {reason: 'auth_required'});
    };
    blocks._pair = () => new Promise((resolve, reject) => {
        rejectPair = reject;
        pairStarted();
    });
    const authenticating = blocks._authenticate();
    await started;
    runtime.setMcRemoteConnectionTarget({sandboxRoute: 'unity', label: 'Unity箱庭'});
    await blocks.connect();
    blocks._pairingInProgress = true;
    blocks._setPairCode('654-321');
    rejectPair(new Error('old pairing retired'));
    await t.rejects(authenticating);
    t.equal(blocks.pairCode(), '654-321');
    t.equal(blocks._pairingInProgress, true);
    t.end();
});

test('a retry waiting for an old target cannot redial the newly selected target', async t => {
    const blocks = new McRemote(new Runtime());
    blocks._hasConnected = true;
    let attempts = 0;
    let release;
    blocks._open = async () => {
        attempts++;
        throw new Error('network failure');
    };
    blocks._delay = () => new Promise(resolve => {
        release = resolve;
    });
    const reconnecting = blocks._ensureConnection();
    await Promise.resolve();
    await Promise.resolve();
    blocks._targetGeneration++;
    release();
    await t.rejects(reconnecting, {localReason: 'connection_target_changed'});
    t.equal(attempts, 1);
    t.end();
});


test('switching targets settles a connect still waiting for WebSocket open', async t => {
    const previous = global.WebSocket;
    global.WebSocket = class {
        static get OPEN () {
            return 1;
        }
        constructor () {
            this.readyState = 0;
        }
        addEventListener () {}
        close () {
            this.readyState = 3;
        }
    };
    t.teardown(() => {
        global.WebSocket = previous;
    });
    const runtime = new Runtime();
    runtime.setMcRemoteConnectionTarget({sandboxRoute: 'minecraft'});
    const blocks = new McRemote(runtime);
    const connecting = blocks.connect();
    const retired = t.rejects(connecting, {localReason: 'connection_target_changed'});
    runtime.setMcRemoteConnectionTarget({sandboxRoute: 'unity'});
    blocks._dial = async () => {};
    await blocks.connect();
    await retired;
    t.equal(blocks._connectionTarget.sandboxRoute, 'unity');
    t.end();
});
