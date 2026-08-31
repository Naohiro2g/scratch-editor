const PROPERTY_PATTERN = /^[a-z0-9_]+$/;
const TOKEN_PATTERN = /^[a-z0-9_./:-]+$/;
const RESOURCE_ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const NUMBER_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE]-?[0-9]+)?$/;
const ERROR_TEXT_PATTERN = /^⟦mcr-error:([a-z][a-z0-9_]*)⟧$/u;

const REMOTE_ERROR_REASONS = new Set([
    'auth_required',
    'backpressure',
    'build_denied',
    'entity_capacity_exhausted',
    'entity_handle_not_found',
    'entity_not_spawnable',
    'entity_removed',
    'entity_spawn_failed',
    'entity_dimension_changed',
    'entity_not_found',
    'entity_unloaded',
    'entity_unavailable',
    'height_not_found',
    'internal_error',
    'invalid_params',
    'invalid_property_value',
    'not_a_sign',
    'particle_data_required',
    'permission_denied',
    'player_offline',
    'sign_update_failed',
    'sign_waxed',
    'teleport_failed',
    'unknown_block',
    'unknown_entity',
    'unknown_particle',
    'unknown_property',
    'unknown_dimension',
    'work_limit_exceeded',
    'zero_direction'
]);

const blockValueError = reason => {
    const error = new Error(reason);
    error.reason = reason;
    return error;
};

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const canonicalBlockId = blockId => {
    const id = String(blockId);
    return id.indexOf(':') === -1 ? `minecraft:${id}` : id;
};

const stripOuterAsciiSpaces = value => String(value).replace(/^ +| +$/g, '');

const stateValueText = value => {
    let text;
    if (typeof value === 'boolean') {
        text = value ? 'true' : 'false';
    } else if (typeof value === 'number' && Number.isFinite(value)) {
        text = Object.is(value, -0) ? '0' : String(value);
    } else if (typeof value === 'string') {
        text = value;
    } else {
        throw blockValueError('invalid_block_state');
    }
    if (!TOKEN_PATTERN.test(text)) throw blockValueError('unsupported_state_token');
    return text;
};

const formatStateText = state => {
    if (!isPlainObject(state)) throw blockValueError('invalid_block_state');
    return Object.keys(state)
        .sort()
        .map(property => {
            if (!PROPERTY_PATTERN.test(property)) throw blockValueError('invalid_block_state');
            return `${property}=${stateValueText(state[property])}`;
        })
        .join(',');
};

const catalogValueForToken = (allowed, token) => {
    const matches = allowed.filter(candidate => {
        if (typeof candidate === 'number') {
            return NUMBER_PATTERN.test(token) && Number.isFinite(candidate) && Number(token) === candidate;
        }
        return stateValueText(candidate) === token;
    });
    if (matches.length !== 1) return {found: false};
    return {found: true, value: matches[0]};
};

const parseStateText = (input, blockId, blockCatalog) => {
    const text = stripOuterAsciiSpaces(input);
    if (text === '') return {canonical: '', state: {}};
    if (/\s/.test(text)) throw blockValueError('invalid_block_state');
    if (!blockCatalog || !isPlainObject(blockCatalog)) {
        throw blockValueError('catalog_unavailable_for_state');
    }
    const entry = blockCatalog[canonicalBlockId(blockId)];
    if (!entry || !isPlainObject(entry.states)) throw blockValueError('unknown_block');

    const state = {};
    for (const pair of text.split(',')) {
        const match = /^([a-z0-9_]+)=([a-z0-9_./:-]+)$/.exec(pair);
        if (!match || own(state, match[1])) throw blockValueError('invalid_block_state');
        const property = match[1];
        const allowed = entry.states[property];
        if (!Array.isArray(allowed)) throw blockValueError('unknown_property');
        const resolved = catalogValueForToken(allowed, match[2]);
        if (!resolved.found) throw blockValueError('invalid_property_value');
        state[property] = resolved.value;
    }
    return {canonical: formatStateText(state), state};
};

const makeErrorText = reason => (
    typeof reason === 'string' && /^[a-z][a-z0-9_]*$/.test(reason) ?
        `⟦mcr-error:${reason}⟧` :
        '⟦mcr-error:remote_error⟧'
);

const errorTextReason = value => {
    const match = typeof value === 'string' && ERROR_TEXT_PATTERN.exec(value);
    return match ? match[1] : null;
};

const isErrorText = value => errorTextReason(value) !== null;

const remoteErrorText = error => {
    const reason = error && error.reason;
    return makeErrorText(REMOTE_ERROR_REASONS.has(reason) ? reason : 'remote_error');
};

const formatBlockInfoText = value => {
    if (!isPlainObject(value) || Object.keys(value).length !== 2 || !own(value, 'block_id') || !own(value, 'state')) {
        throw blockValueError('invalid_block_info');
    }
    if (typeof value.block_id !== 'string' || !RESOURCE_ID_PATTERN.test(value.block_id)) {
        throw blockValueError('invalid_block_info');
    }
    let stateText;
    try {
        stateText = formatStateText(value.state);
    } catch (error) {
        if (error && error.reason === 'unsupported_state_token') throw error;
        throw blockValueError('invalid_block_info');
    }
    return stateText ? `${value.block_id}[${stateText}]` : value.block_id;
};

const parseBlockInfoText = value => {
    const propagatedReason = errorTextReason(value);
    if (propagatedReason) return {errorText: value};
    if (typeof value !== 'string') throw blockValueError('invalid_block_info');
    const match = /^([a-z0-9_.-]+:[a-z0-9_./-]+)(?:\[([^\]]+)\])?$/.exec(value);
    if (!match) throw blockValueError('invalid_block_info');
    const properties = {};
    let previous = null;
    if (typeof match[2] === 'string') {
        for (const pair of match[2].split(',')) {
            const stateMatch = /^([a-z0-9_]+)=([a-z0-9_./:-]+)$/.exec(pair);
            if (!stateMatch || own(properties, stateMatch[1]) ||
                (previous !== null && previous >= stateMatch[1])) {
                throw blockValueError('invalid_block_info');
            }
            properties[stateMatch[1]] = stateMatch[2];
            previous = stateMatch[1];
        }
    }
    return {blockId: match[1], properties, stateText: match[2] || ''};
};

const accessBlockInfo = (value, accessor) => {
    try {
        const parsed = parseBlockInfoText(value);
        return parsed.errorText || accessor(parsed);
    } catch (error) {
        return makeErrorText(error && error.reason ? error.reason : 'invalid_block_info');
    }
};

const blockInfoId = value => accessBlockInfo(value, parsed => parsed.blockId);

const blockInfoState = value => accessBlockInfo(value, parsed => parsed.stateText);

const blockInfoStateProperty = (value, property) => accessBlockInfo(value, parsed => (
    own(parsed.properties, property) ?
        parsed.properties[property] :
        makeErrorText('unknown_state_property')
));

const blockInfoHasStateProperty = (value, property) => {
    try {
        const parsed = parseBlockInfoText(value);
        if (parsed.errorText) return false;
        return own(parsed.properties, property);
    } catch {
        return false;
    }
};

module.exports = {
    REMOTE_ERROR_REASONS,
    blockInfoHasStateProperty,
    blockInfoId,
    blockInfoState,
    blockInfoStateProperty,
    canonicalBlockId,
    errorTextReason,
    formatBlockInfoText,
    formatStateText,
    isErrorText,
    makeErrorText,
    parseBlockInfoText,
    parseStateText,
    remoteErrorText,
    stateValueText
};
