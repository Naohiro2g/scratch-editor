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

const buildStateText = selectedStates => {
    const properties = Object.keys(selectedStates)
        .filter(property => selectedStates[property] !== null)
        .sort();
    return properties.map(property =>
        `${property}=${stateValueText(selectedStates[property])}`
    ).join(',');
};

const findCatalogSelection = (blockIdInput, stateTextInput, blockCatalog) => {
    const id = catalogBlockId(blockIdInput.trim());
    const entry = blockCatalog[id];
    if (!entry) return null;
    const selectedStates = {};
    const stateText = stateTextInput.replace(/^ +| +$/g, '');
    if (stateText) {
        if (/\s/.test(stateText)) return null;
        for (const part of stateText.split(',')) {
            const match = /^([a-z0-9_]+)=([a-z0-9_./:-]+)$/.exec(part);
            if (!match || Object.prototype.hasOwnProperty.call(selectedStates, match[1])) return null;
            const property = match[1];
            const valueText = match[2];
            const allowed = entry.states[property];
            if (!allowed) return null;
            const value = allowed.find(candidate => (
                typeof candidate === 'number' ?
                    /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE]-?[0-9]+)?$/.test(valueText) &&
                        Number(valueText) === candidate :
                    stateValueText(candidate) === valueText
            ));
            if (typeof value === 'undefined') return null;
            selectedStates[property] = value;
        }
    }
    return {id, selectedStates};
};

export {
    buildStateText,
    catalogBlockId,
    findCatalogSelection,
    pickerBlockId,
    stateValueText
};
