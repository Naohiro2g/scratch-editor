import {getBlockNames, searchBlockIds} from '../../../src/lib/mcremote-block-names';
import names12111 from '../../../src/lib/mcremote-block-names/1.21.11.json';
import names262 from '../../../src/lib/mcremote-block-names/26.2.json';

describe('McRemote block names', () => {
    test.each(['1.21.11', '26.2'])('resolves Japanese and English names for Minecraft %s', version => {
        expect(getBlockNames(version, 'minecraft:gold_block')).toEqual({
            ja: '金ブロック',
            en: 'Block of Gold'
        });
    });

    test('does not substitute names from another version or namespace', () => {
        expect(getBlockNames('unknown-version', 'minecraft:gold_block')).toBeNull();
        expect(getBlockNames('1.21.11', 'examplemod:gold_block')).toBeNull();
        expect(getBlockNames('1.21.11', 'minecraft:unknown_block')).toBeNull();
        expect(getBlockNames('1.21.11', 'minecraft:sulfur')).toBeNull();
        expect(getBlockNames('26.2', 'minecraft:sulfur')).not.toBeNull();
    });

    test.each([
        ['1.21.11', names12111],
        ['26.2', names262]
    ])('bundles only block IDs and their names for %s', (_version, names) => {
        expect(Object.keys(names).length).toBeGreaterThan(1000);
        for (const [id, translations] of Object.entries(names)) {
            expect(id).toMatch(/^minecraft:[a-z0-9_]+$/);
            expect(Object.keys(translations).sort()).toEqual(['en', 'ja']);
            expect(translations.en).toEqual(expect.any(String));
            expect(translations.ja).toEqual(expect.any(String));
            expect(translations.en).not.toMatch(/%[\ds]/);
            expect(translations.ja).not.toMatch(/%[\ds]/);
        }
    });

    test('searches only the supplied catalog IDs and retains their ordering', () => {
        const ids = ['minecraft:gold_block', 'examplemod:gold_block', 'minecraft:oak_log'];
        expect(searchBlockIds(ids, '1.21.11', '金ブロック')).toEqual(['minecraft:gold_block']);
        expect(searchBlockIds(ids, '1.21.11', 'gold block')).toEqual([
            'minecraft:gold_block', 'examplemod:gold_block'
        ]);
        expect(searchBlockIds(ids, '1.21.11', '  \u3000  ')).toEqual(ids);
        expect(searchBlockIds([], '1.21.11', '金ブロック')).toEqual([]);
    });
});
