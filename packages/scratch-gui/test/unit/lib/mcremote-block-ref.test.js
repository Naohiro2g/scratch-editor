import {
    buildStateText,
    findCatalogSelection,
    pickerBlockId
} from '../../../src/lib/mcremote-block-ref';

describe('McRemote block reference picker helpers', () => {
    const blocks = {
        'minecraft:oak_log': {
            states: {axis: ['x', 'y', 'z']},
            default_state: {axis: 'y'}
        },
        'examplemod:machine': {
            states: {facing: ['north', 'south'], powered: [false, true]},
            default_state: {facing: 'north', powered: false}
        }
    };

    test('shortens only the special minecraft namespace', () => {
        expect(pickerBlockId('minecraft:oak_log')).toBe('oak_log');
        expect(pickerBlockId('examplemod:machine')).toBe('examplemod:machine');
    });

    test('emits StateText only for explicit states in canonical property order', () => {
        expect(buildStateText({
            powered: true,
            facing: 'south',
            omitted: null
        })).toBe('facing=south,powered=true');
    });

    test('recognizes separate block ID and StateText while keeping JSON-native types', () => {
        expect(findCatalogSelection('oak_log', 'axis=z', blocks)).toEqual({
            id: 'minecraft:oak_log',
            selectedStates: {axis: 'z'}
        });
        expect(findCatalogSelection('examplemod:machine', 'powered=false', blocks)).toEqual({
            id: 'examplemod:machine',
            selectedStates: {powered: false}
        });
    });

    test('rejects malformed, duplicate, unknown and type-mismatched StateText', () => {
        expect(findCatalogSelection('oak_log', 'axis=z,', blocks)).toBeNull();
        expect(findCatalogSelection('oak_log', 'axis=z,axis=y', blocks)).toBeNull();
        expect(findCatalogSelection('oak_log', 'powered=false', blocks)).toBeNull();
        expect(findCatalogSelection('examplemod:machine', 'powered=0', blocks)).toBeNull();
    });
});
