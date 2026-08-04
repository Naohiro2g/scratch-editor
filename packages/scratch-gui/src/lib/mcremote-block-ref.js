const pickerBlockId = id => (
    id.indexOf('minecraft:') === 0 ? id.slice('minecraft:'.length) : id
);

const catalogBlockId = input => (
    input.indexOf(':') === -1 ? `minecraft:${input}` : input
);

const stateValueText = value => {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
};

const buildBlockRef = (id, selectedStates) => {
    const base = pickerBlockId(id);
    const properties = Object.keys(selectedStates)
        .filter(property => selectedStates[property] !== null)
        .sort();
    if (properties.length === 0) return base;
    return `${base}[${properties.map(property =>
        `${property}=${stateValueText(selectedStates[property])}`
    ).join(',')}]`;
};

const findCatalogSelection = (input, blockCatalog) => {
    const match = /^([^[]+)(?:\[(.*)\])?$/.exec(input.trim());
    if (!match) return null;
    const id = catalogBlockId(match[1]);
    const entry = blockCatalog[id];
    if (!entry) return null;
    const selectedStates = {};
    if (match[2]) {
        for (const part of match[2].split(',')) {
            const separator = part.indexOf('=');
            if (separator === -1) return null;
            const property = part.slice(0, separator);
            const valueText = part.slice(separator + 1);
            const allowed = entry.states[property];
            if (!allowed) return null;
            const value = allowed.find(candidate => stateValueText(candidate) === valueText);
            if (typeof value === 'undefined') return null;
            selectedStates[property] = value;
        }
    }
    return {id, selectedStates};
};

export {
    buildBlockRef,
    catalogBlockId,
    findCatalogSelection,
    pickerBlockId,
    stateValueText
};
