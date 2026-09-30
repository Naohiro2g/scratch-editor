import names12111 from './mcremote-block-names/1.21.11.json';
import names262 from './mcremote-block-names/26.2.json';

const namesByVersion = new Map([
    ['1.21.11', names12111],
    ['26.2', names262]
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
    return blockIds.filter(id => {
        const names = getBlockNames(mcVersion, id);
        const text = normalizeSearch(`${id} ${names ? names.ja || '' : ''} ${names ? names.en : ''}`);
        return terms.every(term => text.includes(term));
    });
};

export {getBlockNames, searchBlockIds};
