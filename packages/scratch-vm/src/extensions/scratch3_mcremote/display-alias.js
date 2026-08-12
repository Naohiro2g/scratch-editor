const DISPLAY_ALIAS_WORDS = Object.freeze([
    'MIND', 'STORM', 'SOCIETY', 'PAPERT', 'RESNICK', 'PIAGET', 'MINSKY', 'LIFE',
    'DNA', 'MUSIC', 'WAVE', 'BRAIN', 'SELF', 'APPLE', 'ORANGE', 'LEMON'
]);

const randomUint32 = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        return crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Math.floor(Math.random() * 0x100000000);
};

const createDisplayAlias = (random = randomUint32) => {
    const first = random();
    const second = random();
    return `${DISPLAY_ALIAS_WORDS[first % DISPLAY_ALIAS_WORDS.length]}-` +
        `${DISPLAY_ALIAS_WORDS[second % DISPLAY_ALIAS_WORDS.length]}-${String((second >>> 8) % 1000000)
            .padStart(6, '0')}`;
};

module.exports = {
    DISPLAY_ALIAS_WORDS,
    createDisplayAlias
};
