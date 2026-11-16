const numericFields = (value, keys) => {
    const result = {};
    if (!value || typeof value !== 'object') return result;
    for (const key of keys) {
        if (Number.isFinite(value[key])) result[key] = value[key];
    }
    return result;
};

const errorDetails = value => {
    const result = numericFields(value, ['limit', 'requested']);
    const bounds = value.bounds;
    if (Array.isArray(bounds) && bounds.every(Number.isFinite)) result.bounds = bounds.slice();
    else if (bounds && typeof bounds === 'object') {
        result.bounds = numericFields(bounds, ['y_min', 'y_max', 'build_range']);
        if (bounds.center) result.bounds.center = numericFields(bounds.center, ['x', 'z']);
        if (bounds.world_border) {
            result.bounds.world_border = numericFields(bounds.world_border, ['size']);
            if (bounds.world_border.center) {
                result.bounds.world_border.center = numericFields(bounds.world_border.center, ['x', 'z']);
            }
        }
    }
    const point = value.violating;
    if (Array.isArray(point) && point.every(Number.isFinite)) result.violating = point.slice();
    else if (point && typeof point === 'object') result.violating = numericFields(point, ['x', 'y', 'z']);
    return result;
};

export {errorDetails};
