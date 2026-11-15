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
