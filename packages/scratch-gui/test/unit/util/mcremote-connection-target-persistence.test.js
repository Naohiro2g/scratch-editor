const STORAGE_KEY = 'mcremote.connectionTarget.v1';

describe('McRemote connection target persistence', () => {
    beforeEach(() => {
        jest.resetModules();
        window.localStorage.clear();
    });

    afterEach(() => {
        delete global.fetch;
    });

    const loadBetaProfile = async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge-beta.mc-remote.com',
                default_sandbox: 'sb-beta.mc-remote.com',
                connection_targets: [
                    {id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'},
                    {id: 'beta', label: 'Beta', sandbox: 'sb-beta.mc-remote.com'}
                ],
                connection_enabled: true,
                release_identity: 'beta'
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');
        await loadMcRemoteRuntimeConfig();
        return require('../../../src/lib/mcremote-connection-target-persistence.js');
    };

    test('returns the default route when localStorage is empty', () => {
        const {detectMcRemoteConnectionTargetRoute} =
            require('../../../src/lib/mcremote-connection-target-persistence.js');
        expect(detectMcRemoteConnectionTargetRoute()).toEqual('sb.mc-remote.com');
    });

    test('persists a route in the deployment profile', async () => {
        const {detectMcRemoteConnectionTargetRoute, persistMcRemoteConnectionTargetRoute} =
            await loadBetaProfile();
        persistMcRemoteConnectionTargetRoute('sb.mc-remote.com');

        expect(window.localStorage.getItem(STORAGE_KEY)).toEqual('sb.mc-remote.com');
        expect(detectMcRemoteConnectionTargetRoute()).toEqual('sb.mc-remote.com');
    });

    test('replaces a removed sb-dev route with the deployment default', async () => {
        window.localStorage.setItem(STORAGE_KEY, 'sb-dev.mc-remote.com');
        const {detectMcRemoteConnectionTargetRoute} = await loadBetaProfile();

        expect(detectMcRemoteConnectionTargetRoute()).toEqual('sb-beta.mc-remote.com');
        expect(window.localStorage.getItem(STORAGE_KEY)).toEqual('sb-beta.mc-remote.com');
    });
});
