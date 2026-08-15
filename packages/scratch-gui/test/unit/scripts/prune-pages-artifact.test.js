import {planPagesArtifact, showcaseRuntimeConfig} from '../../../scripts/pages-artifact.mjs';

const ALL_ENTRY_HTML = [
    'index.html',
    'standalone.html',
    'blocks-only.html',
    'compatibility-testing.html',
    'player.html'
];

describe('planPagesArtifact', () => {
    test('keeps only the entry that applies the McRemote runtime config', () => {
        const plan = planPagesArtifact(ALL_ENTRY_HTML);

        expect(plan.keep).toEqual(['index.html']);
        expect(plan.remove.map(({html}) => html)).toEqual([
            'standalone.html',
            'blocks-only.html',
            'compatibility-testing.html',
            'player.html'
        ]);
    });

    test('removes the bundle of each dropped entry so it cannot be loaded directly', () => {
        const plan = planPagesArtifact(ALL_ENTRY_HTML);

        expect(plan.remove).toEqual([
            {html: 'standalone.html', chunk: 'guistandalone'},
            {html: 'blocks-only.html', chunk: 'blocksonly'},
            {html: 'compatibility-testing.html', chunk: 'compatibilitytesting'},
            {html: 'player.html', chunk: 'player'}
        ]);
    });

    test('rejects an unrecognized entry rather than publishing it unclassified', () => {
        expect(() => planPagesArtifact([...ALL_ENTRY_HTML, 'debug.html']))
            .toThrow(/debug\.html/);
    });

    test('rejects a build that is missing the runtime-config-aware entry', () => {
        expect(() => planPagesArtifact(['player.html']))
            .toThrow(/index\.html/);
    });

    test('ignores files that are not entry documents', () => {
        const plan = planPagesArtifact([...ALL_ENTRY_HTML, 'gui.js', 'static', 'chunks']);

        expect(plan.keep).toEqual(['index.html']);
        expect(plan.remove).toHaveLength(4);
    });
});

describe('showcaseRuntimeConfig', () => {
    const deployed = {
        bridge_url: 'wss://bridge.example.test',
        default_sandbox: 'sb.example.test',
        connection_targets: [{id: 'stable', sandbox: 'sb.example.test'}],
        connection_enabled: true,
        release_identity: 'local-development'
    };

    test('turns the connection off so the runtime guard agrees with the build', () => {
        expect(showcaseRuntimeConfig(deployed, 'abc123').connection_enabled).toBe(false);
    });

    test('stamps the release identity of the source being published', () => {
        expect(showcaseRuntimeConfig(deployed, 'abc123').release_identity).toBe('abc123');
    });

    test('leaves the rest of the configuration alone', () => {
        const showcase = showcaseRuntimeConfig(deployed, 'abc123');

        expect(showcase.bridge_url).toBe(deployed.bridge_url);
        expect(showcase.default_sandbox).toBe(deployed.default_sandbox);
        expect(showcase.connection_targets).toEqual(deployed.connection_targets);
    });

    test('rejects a release identity that would not identify anything', () => {
        expect(() => showcaseRuntimeConfig(deployed, '   ')).toThrow(/release identity/i);
    });

    test('prepends the showcase disclaimer notice when none are configured', () => {
        const showcase = showcaseRuntimeConfig(deployed, 'abc123');

        expect(showcase.notices).toEqual([
            {heading: 'Showcase build', body: 'This page is a showcase with the Minecraft connection turned off.'}
        ]);
    });

    test('prepends the showcase disclaimer ahead of configured notices, keeping them intact', () => {
        const withNotices = Object.assign({}, deployed, {
            notices: [{heading: 'New blocks', body: 'player.getPos and player.setPos are here.'}]
        });

        const showcase = showcaseRuntimeConfig(withNotices, 'abc123');

        expect(showcase.notices).toEqual([
            {heading: 'Showcase build', body: 'This page is a showcase with the Minecraft connection turned off.'},
            {heading: 'New blocks', body: 'player.getPos and player.setPos are here.'}
        ]);
    });
});
