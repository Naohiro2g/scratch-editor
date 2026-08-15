import {
    buildBlockRef,
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

    test('emits only explicit states in canonical property order', () => {
        expect(buildBlockRef('examplemod:machine', {
            powered: true,
            facing: 'south',
            omitted: null
        })).toBe('examplemod:machine[facing=south,powered=true]');
    });

    test('recognizes short vanilla input and keeps JSON-native state types', () => {
        expect(findCatalogSelection('oak_log[axis=z]', blocks)).toEqual({
            id: 'minecraft:oak_log',
            selectedStates: {axis: 'z'}
        });
        expect(findCatalogSelection('examplemod:machine[powered=false]', blocks)).toEqual({
            id: 'examplemod:machine',
            selectedStates: {powered: false}
        });
    });
});
