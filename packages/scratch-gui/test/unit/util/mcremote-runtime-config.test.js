jest.mock('@scratch/scratch-vm', () => ({MCREMOTE_CLIENT_VERSION: '2301.0.0b7'}), {virtual: true});

const runtimeValue = overrides => ({
    schema_version: 1,
    bridge_url: 'wss://bridge.classroom.example/ws',
    default_sandbox: 'minecraft.classroom.example',
    connection_targets: [
        {id: 'stable', label: 'Stable', sandbox: 'sb.mc-remote.com'},
        {id: 'classroom', label: 'Classroom', sandbox: 'minecraft.classroom.example'}
    ],
    connection_enabled: true,
    ...overrides
});

const productValue = overrides => ({
    schema_version: 1,
    homepage_url: 'https://mc-remote.com/',
    notices: [{heading: 'Product notice', body: 'Product body'}],
    ...overrides
});

const response = value => ({ok: true, json: () => Promise.resolve(value)});

const mockConfigs = (runtime = runtimeValue(), product = productValue()) => {
    global.fetch.mockImplementation(url => Promise.resolve(response(
        url.includes('mc-remote-product-config.json') ? product : runtime
    )));
};

describe('McRemote runtime config', () => {
    beforeEach(() => {
        jest.resetModules();
        global.fetch = jest.fn();
    });

    afterEach(() => {
        delete global.fetch;
    });

    test('loads the deployment and image-owned files independently', async () => {
        mockConfigs(runtimeValue({wirescope_url: 'https://wirescope.classroom.example/live'}));
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toEqual({
            bridgeUrl: 'wss://bridge.classroom.example/ws',
            defaultSandbox: 'minecraft.classroom.example',
            connectionTargets: [
                {id: 'stable', sandboxRoute: 'sb.mc-remote.com', label: 'Stable'},
                {id: 'classroom', sandboxRoute: 'minecraft.classroom.example', label: 'Classroom'}
            ],
            connectionEnabled: true,
            wireScopeUrl: 'https://wirescope.classroom.example/live',
            releaseIdentity: '2301.0.0b7',
            homepageUrl: 'https://mc-remote.com/',
            notices: [{heading: 'Product notice', body: 'Product body', link: null}],
            storagePersistEnabled: false
        });
        expect(global.fetch).toHaveBeenCalledTimes(2);
        for (const fileName of ['mc-remote-runtime-config.json', 'mc-remote-product-config.json']) {
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining(fileName),
                {cache: 'no-store', credentials: 'same-origin'}
            );
        }
    });

    test('places operator notices before product notices', async () => {
        mockConfigs(runtimeValue({notices: [{heading: 'Operator notice', body: 'Operator body'}]}));
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            notices: [
                {heading: 'Operator notice', body: 'Operator body', link: null},
                {heading: 'Product notice', body: 'Product body', link: null}
            ]
        });
    });

    test('accepts a disabled deployment without connection fields', async () => {
        mockConfigs({schema_version: 1, connection_enabled: false});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            bridgeUrl: null,
            defaultSandbox: null,
            connectionTargets: [],
            connectionEnabled: false,
            releaseIdentity: '2301.0.0b7'
        });
    });

    test('allows a plain WebSocket bridge only for HTTP loopback development', async () => {
        mockConfigs(runtimeValue({
            bridge_url: 'ws://127.0.0.1:8080',
            default_sandbox: '127.0.0.1',
            connection_targets: [{id: 'local', label: 'Localhost', sandbox: '127.0.0.1'}]
        }));
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            bridgeUrl: 'ws://127.0.0.1:8080/',
            defaultSandbox: '127.0.0.1',
            connectionEnabled: true
        });
    });

    test('rejects a plain WebSocket bridge outside loopback development', () => {
        const {isAllowedBridgeUrl} = require('../../../src/lib/mcremote-runtime-config.js');

        expect(isAllowedBridgeUrl(new URL('ws://127.0.0.1:8080'), new URL('https://localhost:8601'))).toBe(false);
        expect(isAllowedBridgeUrl(new URL('ws://bridge.example.test'), new URL('http://localhost:8601'))).toBe(false);
        expect(isAllowedBridgeUrl(new URL('ws://127.0.0.1:8080'), new URL('http://scratch.example.test')))
            .toBe(false);
    });

    test('allows WireScope only on a distinct trusted origin', () => {
        const {isAllowedWireScopeUrl} = require('../../../src/lib/mcremote-runtime-config.js');

        expect(isAllowedWireScopeUrl(
            new URL('https://live.example.test/wirescope'), new URL('https://scratch.example.test/editor')
        )).toBe(true);
        expect(isAllowedWireScopeUrl(
            new URL('https://scratch.example.test/wirescope'), new URL('https://scratch.example.test/editor')
        )).toBe(false);
        expect(isAllowedWireScopeUrl(
            new URL('http://127.0.0.1:4173'), new URL('http://localhost:8601')
        )).toBe(true);
        expect(isAllowedWireScopeUrl(
            new URL('https://live.example.test/?grant=secret'), new URL('https://scratch.example.test/editor')
        )).toBe(false);
    });

    test('fails closed when the deployment file cannot be loaded', async () => {
        global.fetch.mockImplementation(url => Promise.resolve(
            url.includes('mc-remote-product-config.json') ? response(productValue()) : {ok: false, status: 404}
        ));
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: false,
            releaseIdentity: '2301.0.0b7',
            homepageUrl: 'https://mc-remote.com/'
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('mc-remote-runtime-config.json'));
        warn.mockRestore();
    });

    test.each([
        ['schema version', {schema_version: 2, connection_enabled: false}, 'schema_version'],
        ['top-level unknown field', {
            schema_version: 1,
            connection_enabled: false,
            release_identity: 'deployment-owned'
        }, 'additional properties'],
        ['nested unknown field', runtimeValue({
            connection_targets: [{
                id: 'classroom', label: 'Classroom', sandbox: 'minecraft.classroom.example', upstream_port: 25575
            }]
        }), 'additional properties'],
        ['missing enabled fields', {schema_version: 1, connection_enabled: true}, 'required property']
    ])('fails closed for an invalid runtime %s', async (description, runtime, message) => {
        mockConfigs(runtime);
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({connectionEnabled: false});
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(message));
        warn.mockRestore();
    });

    test('fails closed when the default sandbox is absent from connection targets', async () => {
        mockConfigs(runtimeValue({default_sandbox: 'missing.example.org'}));
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({connectionEnabled: false});
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('default_sandbox'));
        warn.mockRestore();
    });

    test('fails closed when a connection target is missing its label', async () => {
        mockConfigs(runtimeValue({
            connection_targets: [{id: 'classroom', sandbox: 'minecraft.classroom.example'}]
        }));
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({connectionEnabled: false});
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('required property'));
        warn.mockRestore();
    });

    test('normalizes operator notices with an optional link', async () => {
        mockConfigs(runtimeValue({
            notices: [
                {heading: 'No link', body: 'Plain text'},
                {
                    heading: 'With link',
                    body: 'Structured link',
                    link: {href: 'https://example.com/help', label: 'Help'}
                }
            ]
        }), productValue({notices: []}));
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            notices: [
                {heading: 'No link', body: 'Plain text', link: null},
                {
                    heading: 'With link',
                    body: 'Structured link',
                    link: {href: 'https://example.com/help', label: 'Help'}
                }
            ]
        });
    });

    test('fails closed when an operator notice is missing its body', async () => {
        mockConfigs(runtimeValue({notices: [{heading: 'Missing body'}]}));
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({connectionEnabled: false});
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('required property'));
        warn.mockRestore();
    });

    test('fails closed when a notice link uses a non-http(s) scheme', async () => {
        mockConfigs(runtimeValue({
            notices: [{heading: 'Bad link', body: 'body', link: {href: 'ftp://example.com/file', label: 'click'}}]
        }));
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({connectionEnabled: false});
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('notices[0].link.href'));
        warn.mockRestore();
    });

    test('keeps a valid runtime connection when product config is invalid', async () => {
        mockConfigs(runtimeValue(), productValue({schema_version: 2}));
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: true,
            homepageUrl: null,
            notices: []
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('mc-remote-product-config.json'));
        warn.mockRestore();
    });

    test('normalizes the image-owned homepage URL', async () => {
        mockConfigs();
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({homepageUrl: 'https://mc-remote.com/'});
    });

    test.each([
        ['is absent', {schema_version: 1, notices: []}, 'required property'],
        ['uses a non-http scheme', productValue({homepage_url: 'ftp://mc-remote.com/'}), 'homepage_url']
    ])('keeps the runtime connection when the product homepage %s', async (description, product, message) => {
        mockConfigs(runtimeValue(), product);
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({
            connectionEnabled: true,
            homepageUrl: null
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(message));
        warn.mockRestore();
    });

    test('defaults storage persistence to false when the optional field is absent', async () => {
        mockConfigs();
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');
        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({storagePersistEnabled: false});
    });

    test('normalizes an explicit storage persistence opt-in', async () => {
        mockConfigs(runtimeValue({storage_persist_enabled: true}));
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');
        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({storagePersistEnabled: true});
    });

    test('fails closed when storage persistence is not a boolean', async () => {
        mockConfigs(runtimeValue({storage_persist_enabled: 'yes'}));
        const log = require('../../../src/lib/log.js').default;
        const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
        const {loadMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

        await expect(loadMcRemoteRuntimeConfig()).resolves.toMatchObject({connectionEnabled: false});
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('storage_persist_enabled'));
        warn.mockRestore();
    });
});
