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
                    {id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'},
                    {id: 'beta', label: 'Classroom', sandbox: 'minecraft.classroom.example'}
                ],
                connection_enabled: true,
                wirescope_url: 'https://wirescope.classroom.example/live',
                release_identity: 'release-123'
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toEqual({
            bridgeUrl: 'wss://bridge.classroom.example/ws',
            defaultSandbox: 'minecraft.classroom.example',
            connectionTargets: [
                {id: 'stable', sandboxRoute: 'sb.mc-remote.com', label: 'Stable'},
                {id: 'beta', sandboxRoute: 'minecraft.classroom.example', label: 'Classroom'}
            ],
            connectionEnabled: true,
            wireScopeUrl: 'https://wirescope.classroom.example/live',
            releaseIdentity: 'release-123',
            homepageUrl: null,
            notices: [],
            storagePersistEnabled: false
        });
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('mc-remote-runtime-config.json'),
            {cache: 'no-store', credentials: 'same-origin'}
        );
    });

    test('allows a plain WebSocket bridge only for HTTP loopback development', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'ws://127.0.0.1:8080',
                default_sandbox: '127.0.0.1',
                connection_targets: [
                    {id: 'local', label: 'Localhost', sandbox: '127.0.0.1'}
                ],
                connection_enabled: true,
                release_identity: 'local-development'
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            bridgeUrl: 'ws://127.0.0.1:8080/',
            defaultSandbox: '127.0.0.1',
            connectionEnabled: true,
            releaseIdentity: 'local-development'
        });
    });

    test('rejects a plain WebSocket bridge outside loopback development', () => {
        const {isAllowedBridgeUrl} = require('../../../src/lib/mcremote-runtime-config.js');

        expect(isAllowedBridgeUrl(
            new URL('ws://127.0.0.1:8080'),
            new URL('https://localhost:8601')
        )).toBe(false);
        expect(isAllowedBridgeUrl(
            new URL('ws://bridge.example.test'),
            new URL('http://localhost:8601')
        )).toBe(false);
        expect(isAllowedBridgeUrl(
            new URL('ws://127.0.0.1:8080'),
            new URL('http://scratch.example.test')
        )).toBe(false);
    });

    test('allows WireScope only on a distinct trusted origin', () => {
        const {isAllowedWireScopeUrl} = require('../../../src/lib/mcremote-runtime-config.js');

        expect(isAllowedWireScopeUrl(
            new URL('https://live.example.test/wirescope'),
            new URL('https://scratch.example.test/editor')
        )).toBe(true);
        expect(isAllowedWireScopeUrl(
            new URL('https://scratch.example.test/wirescope'),
            new URL('https://scratch.example.test/editor')
        )).toBe(false);
        expect(isAllowedWireScopeUrl(
            new URL('http://127.0.0.1:4173'),
            new URL('http://localhost:8601')
        )).toBe(true);
        expect(isAllowedWireScopeUrl(
            new URL('https://live.example.test/?grant=secret'),
            new URL('https://scratch.example.test/editor')
        )).toBe(false);
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
                    {id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}
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

    test('fails closed when a connection target is missing a label', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123'
            })
        });
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: false,
            releaseIdentity: 'runtime-config-unavailable'
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('id, label, and sandbox'));
        warn.mockRestore();
    });

    test('normalizes notices with an optional link', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}],
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
                connection_targets: [{id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}],
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
                connection_targets: [{id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}],
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

    test('normalizes an optional homepage_url', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123',
                homepage_url: 'https://mc-remote.com/'
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            homepageUrl: 'https://mc-remote.com/'
        });
    });

    test('defaults homepageUrl to null when homepage_url is absent', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123'
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            homepageUrl: null
        });
    });

    test('defaults storagePersistEnabled to false when storage_persist_enabled is absent', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123'
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            storagePersistEnabled: false
        });
    });

    test('normalizes an explicit storage_persist_enabled', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123',
                storage_persist_enabled: true
            })
        });
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            storagePersistEnabled: true
        });
    });

    test('fails closed when storage_persist_enabled is not a boolean', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123',
                storage_persist_enabled: 'yes'
            })
        });
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: false,
            releaseIdentity: 'runtime-config-unavailable'
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('storage_persist_enabled'));
        warn.mockRestore();
    });

    test('fails closed when homepage_url uses a non-http(s) scheme', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                bridge_url: 'wss://bridge.mc-remote.com',
                default_sandbox: 'sb.mc-remote.com',
                connection_targets: [{id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'}],
                connection_enabled: true,
                release_identity: 'release-123',
                homepage_url: 'ftp://mc-remote.com/'
            })
        });
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: false,
            releaseIdentity: 'runtime-config-unavailable'
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('homepage_url'));
        warn.mockRestore();
    });
});
