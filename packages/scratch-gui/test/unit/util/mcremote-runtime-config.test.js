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
                connection_targets: [
                    {id: 'stable', sandbox: 'sb.mc-remote.com'},
                    {id: 'beta', sandbox: 'minecraft.classroom.example'}
                ],
                connection_enabled: true,
                release_identity: 'release-123'
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toEqual({
            bridgeUrl: 'wss://bridge.classroom.example/ws',
            defaultSandbox: 'minecraft.classroom.example',
            connectionTargets: [
                {id: 'stable', sandboxRoute: 'sb.mc-remote.com'},
                {id: 'beta', sandboxRoute: 'minecraft.classroom.example'}
            ],
            connectionEnabled: true,
            releaseIdentity: 'release-123',
            notices: []
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

    test('fails closed when the default sandbox is absent from connection targets', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb-beta.mc-remote.com',
                connection_targets: [
                    {id: 'stable', sandbox: 'sb.mc-remote.com'}
                ],
                connection_enabled: true,
                release_identity: 'beta'
            })
        });
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: false,
            releaseIdentity: 'runtime-config-unavailable'
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('default_sandbox'));
        warn.mockRestore();
    });

    test('normalizes notices with an optional link', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123',
                notices: [
                    {heading: 'New blocks', body: 'player.getPos and player.setPos are here.'},
                    {
                        heading: 'Showcase build',
                        body: 'This build cannot connect to a Minecraft world.',
                        link: {href: 'https://example.com/mc-remote', label: 'Learn more'}
                    }
                ]
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            notices: [
                {heading: 'New blocks', body: 'player.getPos and player.setPos are here.', link: null},
                {
                    heading: 'Showcase build',
                    body: 'This build cannot connect to a Minecraft world.',
                    link: {href: 'https://example.com/mc-remote', label: 'Learn more'}
                }
            ]
        });
    });

    test('fails closed when a notice is missing a required field', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123',
                notices: [{heading: 'Missing body'}]
            })
        });
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: false,
            releaseIdentity: 'runtime-config-unavailable'
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('notices[0]'));
        warn.mockRestore();
    });

    test('fails closed when a notice link uses a non-http(s) scheme', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123',
                notices: [{
                    heading: 'Bad link',
                    body: 'body',
                    link: {href: 'ftp://example.com/file', label: 'click'}
                }]
            })
        });
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: false,
            releaseIdentity: 'runtime-config-unavailable'
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('notices[0].link.href'));
        warn.mockRestore();
    });
});
