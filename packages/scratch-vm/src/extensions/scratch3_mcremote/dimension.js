const DIMENSION_REF_PATTERN = /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/;
const DIMENSION_KEY_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const invalidDimension = context => {
    const error = new Error(`${context} must be a Minecraft dimension reference`);
    error.reason = 'invalid_params';
    return error;
};

const dimensionRef = (value, context = 'dimension') => {
    if (typeof value !== 'string' || !DIMENSION_REF_PATTERN.test(value)) throw invalidDimension(context);
    return value;
};

const dimensionKey = (value, context = 'dimension') => {
    if (typeof value !== 'string' || !DIMENSION_KEY_PATTERN.test(value)) throw invalidDimension(context);
    return value;
};

const buildContext = (value, context = 'build context') => {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== 2 ||
        !Object.prototype.hasOwnProperty.call(value, 'dimension') ||
        !Object.prototype.hasOwnProperty.call(value, 'origin') ||
        !Array.isArray(value.origin) || value.origin.length !== 3 ||
        value.origin.some(item => typeof item !== 'number' || !Number.isFinite(item))) {
        throw invalidDimension(context);
    }
    return Object.freeze({
        dimension: dimensionKey(value.dimension, `${context}.dimension`),
        origin: Object.freeze(value.origin.slice())
    });
};

const sameBuildContext = (left, right) => Boolean(left && right &&
    left.dimension === right.dimension &&
    left.origin.length === right.origin.length &&
    left.origin.every((value, index) => value === right.origin[index]));

module.exports = {
    buildContext,
    dimensionKey,
    dimensionRef,
    sameBuildContext
};
