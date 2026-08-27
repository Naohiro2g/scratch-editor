const {isErrorText, makeErrorText} = require('./block-value');

const FACES = ['front', 'back'];

const DECORATIONS = ['bold', 'italic', 'obfuscated', 'strikethrough', 'underlined'];

const COLOR_TOKEN_PATTERN = new RegExp(
    '^(?:black|dark_blue|dark_green|dark_aqua|dark_red|dark_purple|gold|gray|dark_gray|' +
    'blue|green|aqua|red|light_purple|yellow|white|#[0-9a-fA-F]{6})$'
);

const signValueError = reason => {
    const error = new Error(reason);
    error.reason = reason;
    return error;
};

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const validateLineValue = value => {
    if (!isPlainObject(value) || Object.keys(value).length !== 3 ||
        !own(value, 'text') || !own(value, 'color') || !own(value, 'decorations')) {
        throw signValueError('invalid_sign_info');
    }
    if (typeof value.text !== 'string') throw signValueError('invalid_sign_info');
    if (typeof value.color !== 'string' || !COLOR_TOKEN_PATTERN.test(value.color)) {
        throw signValueError('invalid_sign_info');
    }
    if (!Array.isArray(value.decorations) || value.decorations.some(token => !DECORATIONS.includes(token))) {
        throw signValueError('invalid_sign_info');
    }
    return {text: value.text, color: value.color, decorations: value.decorations.slice()};
};

const validateFace = value => {
    if (!Array.isArray(value) || value.length !== 4) throw signValueError('invalid_sign_info');
    return value.map(validateLineValue);
};

/**
 * Validate a `world.getSign` wire result and pack it into an opaque
 * SignInfoText the caller can hold in a Scratch variable and later pass to
 * the `signLine*`/`signIsWaxed` accessors without another network request.
 * @param {object} result - `world.getSign` result.
 * @returns {string} SignInfoText (JSON; format is an implementation detail).
 */
const formatSignInfoText = result => {
    if (!isPlainObject(result) || Object.keys(result).length !== 3 ||
        !own(result, 'front') || !own(result, 'back') || !own(result, 'waxed')) {
        throw signValueError('invalid_sign_info');
    }
    if (typeof result.waxed !== 'boolean') throw signValueError('invalid_sign_info');
    return JSON.stringify({
        front: validateFace(result.front),
        back: validateFace(result.back),
        waxed: result.waxed
    });
};

const parseSignInfoText = value => {
    if (isErrorText(value)) return {errorText: value};
    if (typeof value !== 'string') throw signValueError('invalid_sign_info');
    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw signValueError('invalid_sign_info');
    }
    if (!isPlainObject(parsed) || !Array.isArray(parsed.front) || parsed.front.length !== 4 ||
        !Array.isArray(parsed.back) || parsed.back.length !== 4 || typeof parsed.waxed !== 'boolean') {
        throw signValueError('invalid_sign_info');
    }
    return parsed;
};

const lineAt = (parsed, face, lineIndex) => {
    if (!FACES.includes(face)) throw signValueError('invalid_sign_face');
    const index = Number(lineIndex);
    if (!Number.isInteger(index) || index < 0 || index > 3) throw signValueError('invalid_sign_line');
    return parsed[face][index];
};

const accessSignInfo = (value, accessor) => {
    try {
        const parsed = parseSignInfoText(value);
        return parsed.errorText || accessor(parsed);
    } catch (error) {
        return makeErrorText(error && error.reason ? error.reason : 'invalid_sign_info');
    }
};

const signLineText = (value, face, lineIndex) => accessSignInfo(value, parsed => lineAt(parsed, face, lineIndex).text);

const signLineColor = (value, face, lineIndex) => (
    accessSignInfo(value, parsed => lineAt(parsed, face, lineIndex).color)
);

const signLineHasDecoration = (value, face, lineIndex, decoration) => {
    try {
        const parsed = parseSignInfoText(value);
        if (parsed.errorText) return false;
        return lineAt(parsed, face, lineIndex).decorations.includes(decoration);
    } catch {
        return false;
    }
};

const signIsWaxed = value => {
    try {
        const parsed = parseSignInfoText(value);
        return parsed.errorText ? false : parsed.waxed;
    } catch {
        return false;
    }
};

module.exports = {
    DECORATIONS,
    FACES,
    formatSignInfoText,
    signIsWaxed,
    signLineColor,
    signLineHasDecoration,
    signLineText
};
