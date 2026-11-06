import {getBlockNames, searchBlockIds} from '../../../src/lib/mcremote-block-names';
import names12111 from '../../../src/lib/mcremote-block-names/1.21.11.json';
import names262 from '../../../src/lib/mcremote-block-names/26.2.json';
import names263 from '../../../src/lib/mcremote-block-names/26.3.json';
import aliases12111 from '../../../src/lib/mcremote-block-aliases/1.21.11.json';
import aliases262 from '../../../src/lib/mcremote-block-aliases/26.2.json';
import aliases263 from '../../../src/lib/mcremote-block-aliases/26.3.json';

describe('McRemote block names', () => {
    test.each(['1.21.11', '26.2', '26.3'])('resolves Japanese and English names for Minecraft %s', version => {
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
        expect(getBlockNames('26.2', 'minecraft:poplar_log')).toBeNull();
        expect(getBlockNames('26.3', 'minecraft:poplar_log')).toEqual({
            ja: 'ポプラの原木',
            en: 'Poplar Log'
        });
    });

    test.each([
        ['1.21.11', names12111],
        ['26.2', names262],
        ['26.3', names263]
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

    test.each([
        ['1.21.11', aliases12111],
        ['26.2', aliases262],
        ['26.3', aliases263]
    ])('searches official creative category names for %s', (version, aliases) => {
        expect(Object.keys(aliases).length).toBeGreaterThan(1000);
        expect(aliases['minecraft:redstone_torch']).toEqual(expect.arrayContaining([
            'Functional Blocks', '機能的ブロック', 'Redstone Blocks', 'レッドストーン系ブロック'
        ]));
        const ids = ['minecraft:dirt', 'minecraft:gold_block', 'examplemod:gold_block', 'minecraft:white_wool'];
        expect(searchBlockIds(ids, version, '建築ブロック gold')).toEqual(['minecraft:gold_block']);
        expect(searchBlockIds(ids, version, 'colored blocks wool')).toEqual(['minecraft:white_wool']);
        expect(searchBlockIds(ids, version, '天然ブロック')).toEqual(['minecraft:dirt']);
        expect(searchBlockIds(ids, version, 'Ｂｕｉｌｄｉｎｇ　Ｂｌｏｃｋｓ　ＧＯＬＤ')).toEqual(['minecraft:gold_block']);
    });

    test('keeps all category memberships and restricts aliases to the exact version and namespace', () => {
        const ids = ['minecraft:piston', 'minecraft:redstone_torch', 'minecraft:poplar_log', 'examplemod:piston'];
        expect(searchBlockIds(ids, '26.3', 'レッドストーン piston')).toEqual(['minecraft:piston']);
        expect(searchBlockIds(ids, '26.3', '機能的ブロック redstone_torch')).toEqual(['minecraft:redstone_torch']);
        expect(searchBlockIds(ids, '26.3', 'レッドストーン redstone_torch')).toEqual(['minecraft:redstone_torch']);
        expect(searchBlockIds(ids, '26.3', '天然ブロック poplar')).toEqual(['minecraft:poplar_log']);
        expect(searchBlockIds(ids, '1.21.11', '天然ブロック poplar')).toEqual([]);
        expect(searchBlockIds(ids, 'unknown-version', 'レッドストーン')).toEqual([]);
        expect(searchBlockIds(['examplemod:piston'], '26.3', 'レッドストーン')).toEqual([]);
    });
});
