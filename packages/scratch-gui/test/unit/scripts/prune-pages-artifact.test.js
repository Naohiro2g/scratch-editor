import {planPagesArtifact} from '../../../scripts/pages-artifact.mjs';

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
