import reducer, {
    mcremoteCatalogInitialState,
    updateMcRemoteCatalog
} from '../../../src/reducers/mcremote-catalog';

describe('McRemote catalog reducer', () => {
    test('starts without a usable catalog', () => {
        let state;
        expect(reducer(state, {})).toEqual(mcremoteCatalogInitialState);
    });

    test('replaces the full runtime-only snapshot', () => {
        const snapshot = {
            status: 'current',
            mcVersion: '1.21.11',
            catalogHash: 'abc',
            source: 'cache',
            catalog: {block: {}}
        };
        let state;
        expect(reducer(state, updateMcRemoteCatalog(snapshot))).toEqual({
            ...mcremoteCatalogInitialState,
            ...snapshot
        });
    });
});
