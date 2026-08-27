const {formatBlockInfoText} = require('./block-value');
const {dimensionKey} = require('./dimension');

const POLL_RESULT_FIELDS = [
    'events',
    'through_sequence',
    'latest_sequence',
    'filtered_out',
    'overflow_dropped_total',
    'capacity_dropped_total',
    'explicitly_discarded_total'
];

const invalidEventResponse = message => {
    const error = new Error(`Invalid events.poll response: ${message}`);
    error.reason = 'invalid_event_response';
    return error;
};

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const exactFields = (value, fields, context) => {
    if (!isObject(value)) throw invalidEventResponse(`${context} must be an object`);
    const allowed = new Set(fields);
    for (const field of Object.keys(value)) {
        if (!allowed.has(field)) throw invalidEventResponse(`${context} has unknown field ${field}`);
    }
};

const requiredString = (value, context, allowEmpty = false) => {
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
        throw invalidEventResponse(`${context} must be ${allowEmpty ? 'a' : 'a non-empty'} string`);
    }
    return value;
};

const integer = (value, context, minimum) => {
    if (!Number.isInteger(value) || (typeof minimum === 'number' && value < minimum)) {
        const suffix = typeof minimum === 'number' ? ` >= ${minimum}` : '';
        throw invalidEventResponse(`${context} must be an integer${suffix}`);
    }
    return value;
};

const finiteNumber = (value, context) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalidEventResponse(`${context} must be a finite number`);
    }
    return value;
};

const tuple = (value, context, parseItem) => {
    if (!Array.isArray(value) || value.length !== 3) {
        throw invalidEventResponse(`${context} must contain exactly three values`);
    }
    return value.map((item, index) => parseItem(item, `${context}[${index}]`));
};

const scalar = (value, context) => {
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    throw invalidEventResponse(`${context} must be a non-null JSON scalar`);
};

const blockValue = (value, context) => {
    exactFields(value, ['block_id', 'state'], context);
    const blockId = requiredString(value.block_id, `${context}.block_id`);
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(blockId)) {
        throw invalidEventResponse(`${context}.block_id must be canonical`);
    }
    exactFields(value.state, Object.keys(value.state || {}), `${context}.state`);
    const state = {};
    for (const [property, item] of Object.entries(value.state)) {
        if (!/^[a-z0-9_]+$/.test(property)) {
            throw invalidEventResponse(`${context}.state has an invalid property`);
        }
        state[property] = scalar(item, `${context}.state.${property}`);
    }
    return {block_id: blockId, state};
};

const face = (value, context) => {
    const token = requiredString(value, context);
    if (!/^[a-z_]+$/.test(token)) throw invalidEventResponse(`${context} must be a face token`);
    return token;
};

const commonEvent = (value, fields, context) => {
    exactFields(value, ['sequence', 'type', 'dimension', 'origin', ...fields], context);
    return {
        sequence: integer(value.sequence, `${context}.sequence`, 1),
        type: requiredString(value.type, `${context}.type`),
        dimension: dimensionKey(value.dimension, `${context}.dimension`),
        origin: tuple(value.origin, `${context}.origin`, integer)
    };
};

const projectileTarget = (value, context) => {
    if (!isObject(value)) throw invalidEventResponse(`${context} must be an object`);
    if (value.kind === 'player') {
        exactFields(value, ['kind'], context);
        return {kind: 'player'};
    }
    if (value.kind === 'entity') {
        exactFields(value, ['kind', 'handle'], context);
        const handle = requiredString(value.handle, `${context}.handle`);
        if (!/^mcr_eh_[\x21-\x7e]+$/.test(handle)) {
            throw invalidEventResponse(`${context}.handle must be an entity handle`);
        }
        return {kind: 'entity', handle};
    }
    if (value.kind === 'block') {
        exactFields(value, ['kind', 'block', 'pos', 'face'], context);
        const result = {
            kind: 'block',
            block: blockValue(value.block, `${context}.block`),
            pos: tuple(value.pos, `${context}.pos`, integer)
        };
        if (typeof value.face !== 'undefined') result.face = face(value.face, `${context}.face`);
        return result;
    }
    throw invalidEventResponse(`${context}.kind must be block, entity, or player`);
};

const eventDto = (value, index) => {
    const context = `result.events[${index}]`;
    if (!isObject(value)) throw invalidEventResponse(`${context} must be an object`);
    if (value.type === 'pickaxe_poke') {
        const item = requiredString(value.item, `${context}.item`);
        if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(item)) {
            throw invalidEventResponse(`${context}.item must be canonical`);
        }
        return Object.assign(commonEvent(value, ['pos', 'face', 'block', 'hand', 'item'], context), {
            pos: tuple(value.pos, `${context}.pos`, integer),
            face: face(value.face, `${context}.face`),
            block: blockValue(value.block, `${context}.block`),
            hand: value.hand === 'main' || value.hand === 'off' ? value.hand : (() => {
                throw invalidEventResponse(`${context}.hand must be main or off`);
            })(),
            item
        });
    }
    if (value.type === 'chat_posted') {
        return Object.assign(commonEvent(value, ['message'], context), {
            message: requiredString(value.message, `${context}.message`, true)
        });
    }
    if (value.type === 'projectile_hit') {
        const projectile = requiredString(value.projectile, `${context}.projectile`);
        if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(projectile)) {
            throw invalidEventResponse(`${context}.projectile must be canonical`);
        }
        return Object.assign(commonEvent(value, ['projectile', 'pos', 'target'], context), {
            projectile,
            pos: tuple(value.pos, `${context}.pos`, finiteNumber),
            target: projectileTarget(value.target, `${context}.target`)
        });
    }
    throw invalidEventResponse(`${context}.type is not a b6 event`);
};

const deepFreeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
};

const initialEventStatus = () => ({
    cursor: 0,
    latestSequence: 0,
    overflowDroppedTotal: 0,
    capacityDroppedTotal: 0,
    explicitlyDiscardedTotal: 0
});

const validateEventPollResult = (value, afterSequence, previousStatus) => {
    exactFields(value, POLL_RESULT_FIELDS, 'result');
    if (!Array.isArray(value.events)) throw invalidEventResponse('result.events must be an array');
    const throughSequence = integer(value.through_sequence, 'result.through_sequence', 0);
    const latestSequence = integer(value.latest_sequence, 'result.latest_sequence', 0);
    if (throughSequence < afterSequence || throughSequence > latestSequence) {
        throw invalidEventResponse('result cursor bounds are inconsistent');
    }
    if (latestSequence < previousStatus.latestSequence) {
        throw invalidEventResponse('result.latest_sequence moved backwards');
    }
    if (value.filtered_out !== 0 || value.explicitly_discarded_total !== 0) {
        throw invalidEventResponse('filter and explicit discard totals must remain zero until filter is implemented');
    }
    const overflowDroppedTotal = integer(value.overflow_dropped_total, 'result.overflow_dropped_total', 0);
    const capacityDroppedTotal = integer(value.capacity_dropped_total, 'result.capacity_dropped_total', 0);
    if (overflowDroppedTotal < previousStatus.overflowDroppedTotal ||
        capacityDroppedTotal < previousStatus.capacityDroppedTotal) {
        throw invalidEventResponse('result loss counters moved backwards');
    }
    const events = value.events.map(eventDto);
    let priorSequence = afterSequence;
    for (const event of events) {
        if (event.sequence <= priorSequence || event.sequence > throughSequence) {
            throw invalidEventResponse('result event sequences are not strictly ordered within the cursor');
        }
        priorSequence = event.sequence;
    }
    const status = {
        cursor: throughSequence,
        latestSequence,
        overflowDroppedTotal,
        capacityDroppedTotal,
        explicitlyDiscardedTotal: 0
    };
    return deepFreeze({
        events,
        cursor: throughSequence,
        status,
        lossDelta: (overflowDroppedTotal - previousStatus.overflowDroppedTotal) +
            (capacityDroppedTotal - previousStatus.capacityDroppedTotal)
    });
};

const at = (value, index) => (
    Array.isArray(value) && typeof value[index] !== 'undefined' ? value[index] : ''
);

const eventValue = (event, property) => {
    if (!event || typeof event !== 'object') return '';
    switch (property) {
    case 'sequence': return event.sequence;
    case 'type': return event.type;
    case 'dimension': return event.dimension;
    case 'origin_x': return at(event.origin, 0);
    case 'origin_y': return at(event.origin, 1);
    case 'origin_z': return at(event.origin, 2);
    case 'x': return at(event.pos, 0);
    case 'y': return at(event.pos, 1);
    case 'z': return at(event.pos, 2);
    case 'face': return event.face || '';
    case 'hand': return event.hand || '';
    case 'item': return event.item || '';
    case 'message': return typeof event.message === 'string' ? event.message : '';
    case 'block': return event.block ? formatBlockInfoText(event.block) : '';
    case 'projectile': return event.projectile || '';
    case 'target_kind': return event.target ? event.target.kind : '';
    case 'target_x': return event.target ? at(event.target.pos, 0) : '';
    case 'target_y': return event.target ? at(event.target.pos, 1) : '';
    case 'target_z': return event.target ? at(event.target.pos, 2) : '';
    case 'target_face': return event.target && event.target.face ? event.target.face : '';
    case 'target_block': return event.target && event.target.block ? formatBlockInfoText(event.target.block) : '';
    case 'target_handle': return event.target && event.target.handle ? event.target.handle : '';
    default: return '';
    }
};

const eventStatusValue = (status, property) => {
    if (!status) return 0;
    switch (property) {
    case 'cursor': return status.cursor;
    case 'latest': return status.latestSequence;
    case 'overflow': return status.overflowDroppedTotal;
    case 'capacity': return status.capacityDroppedTotal;
    case 'discarded': return status.explicitlyDiscardedTotal;
    case 'total_loss': return status.overflowDroppedTotal + status.capacityDroppedTotal +
        status.explicitlyDiscardedTotal;
    default: return 0;
    }
};

module.exports = {
    eventStatusValue,
    eventValue,
    initialEventStatus,
    validateEventPollResult
};
