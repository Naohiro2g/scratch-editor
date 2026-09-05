const STORAGE_KEY = 'mcremote.connectionTarget.v1';

jest.mock('@scratch/scratch-vm', () => ({MCREMOTE_CLIENT_VERSION: '2301.0.0b7'}), {virtual: true});

describe('McRemote connection target persistence', () => {
    beforeEach(() => {
        jest.resetModules();
        window.localStorage.clear();
    });

    afterEach(() => {
        delete global.fetch;
    });

    const loadBetaProfile = async () => {
        global.fetch = jest.fn().mockImplementation(url => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(url.includes('mc-remote-product-config.json') ? {
                schema_version: 1,
                homepage_url: 'https://mc-remote.com/',
                notices: []
            } : {
                schema_version: 1,
                bridge_url: 'wss://bridge-beta.mc-remote.com',
                default_sandbox: 'sb-beta.mc-remote.com',
                connection_targets: [
                    {id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'},
                    {id: 'beta', label: 'Beta', sandbox: 'sb-beta.mc-remote.com'}
                ],
                connection_enabled: true
            })
        }));
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');
        await loadMcRemoteRuntimeConfig();
        return require('../../../src/lib/mcremote-connection-target-persistence.js');
    };

    test('returns no route before a deployment config is loaded', () => {
        const {detectMcRemoteConnectionTargetRoute} =
            require('../../../src/lib/mcremote-connection-target-persistence.js');
        expect(detectMcRemoteConnectionTargetRoute()).toBeNull();
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
