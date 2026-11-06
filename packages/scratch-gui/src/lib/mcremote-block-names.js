import names12111 from './mcremote-block-names/1.21.11.json';
import names262 from './mcremote-block-names/26.2.json';
import names263 from './mcremote-block-names/26.3.json';
import aliases12111 from './mcremote-block-aliases/1.21.11.json';
import aliases262 from './mcremote-block-aliases/26.2.json';
import aliases263 from './mcremote-block-aliases/26.3.json';

const namesByVersion = new Map([
    ['1.21.11', names12111],
    ['26.2', names262],
    ['26.3', names263]
]);

const aliasesByVersion = new Map([
    ['1.21.11', aliases12111],
    ['26.2', aliases262],
    ['26.3', aliases263]
]);

const getBlockNames = (mcVersion, id) => {
    const names = namesByVersion.get(mcVersion);
    return (names && names[id]) || null;
};

const normalizeSearch = text => text.normalize('NFKC').toLowerCase();

const searchBlockIds = (blockIds, mcVersion, query) => {
    const normalizedQuery = normalizeSearch(query).trim();
    if (!normalizedQuery) return blockIds;
    const terms = normalizedQuery.split(/\s+/);
    const aliases = aliasesByVersion.get(mcVersion);
    return blockIds.filter(id => {
        const names = getBlockNames(mcVersion, id);
        const extraTerms = (aliases && aliases[id]) || [];
        const text = normalizeSearch([
            id,
            names ? names.ja || '' : '',
            names ? names.en : '',
            ...extraTerms
        ].join(' '));
        return terms.every(term => text.includes(term));
    });
};

export {getBlockNames, searchBlockIds};
