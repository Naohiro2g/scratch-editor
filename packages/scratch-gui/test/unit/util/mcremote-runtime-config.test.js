describe('McRemote runtime config', () => {
    beforeEach(() => {
        jest.resetModules();
        global.fetch = jest.fn();
    });

    afterEach(() => {
        delete global.fetch;
    });

    test('loads and normalizes the deployment JSON', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.classroom.example/ws',
                default_sandbox: 'minecraft.classroom.example',
                connection_enabled: true,
                release_identity: 'release-123'
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toEqual({
            bridgeUrl: 'wss://bridge.classroom.example/ws',
            defaultSandbox: 'minecraft.classroom.example',
            connectionEnabled: true,
            releaseIdentity: 'release-123'
        });
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('mc-remote-runtime-config.json'),
            {cache: 'no-store', credentials: 'same-origin'}
        );
    });

    test('fails closed when the deployment JSON cannot be loaded', async () => {
        global.fetch.mockResolvedValue({ok: false, status: 404});
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: false,
            releaseIdentity: 'runtime-config-unavailable'
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('loadMcRemoteRuntimeConfig'));
        warn.mockRestore();
    });
});
