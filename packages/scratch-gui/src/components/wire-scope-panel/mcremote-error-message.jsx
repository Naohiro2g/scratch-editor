import operationLabels from './mcremote-operation-labels';
import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, useIntl} from 'react-intl';

const messages = defineMessages({
    operation: {id: 'gui.mcremote.error.operation', defaultMessage: 'This operation'},
    unity: {
        id: 'gui.mcremote.server.unity',
        defaultMessage: 'Unity sandbox',
        description: 'Learner-facing diagnostic: unity'
    },
    unsupported: {
        id: 'gui.mcremote.error.unsupported',
        defaultMessage: '“{operation}” is not available on the current target.',
        description: 'Learner-facing diagnostic: unsupported'
    },
    unsupportedNamed: {
        id: 'gui.mcremote.error.unsupportedNamed',
        defaultMessage: '“{operation}” is not available on “{server}”.',
        description: 'Learner-facing diagnostic: unsupportedNamed'
    },
    height: {
        id: 'gui.mcremote.error.height',
        defaultMessage: 'Height {y} is outside the world. Available heights: {min} to {max}.',
        description: 'Learner-facing diagnostic: height'
    },
    outside: {
        id: 'gui.mcremote.error.outside',
        defaultMessage: 'The specified point is outside the world.',
        description: 'Learner-facing diagnostic: outside'
    },
    range: {
        id: 'gui.mcremote.error.range',
        defaultMessage: 'The specified point is outside the building range.',
        description: 'Learner-facing diagnostic: range'
    },
    count: {
        id: 'gui.mcremote.error.count',
        defaultMessage: 'Too many blocks in one operation. Requested: {requested}. Limit: {limit}.',
        description: 'Learner-facing diagnostic: count'
    },
    point: {
        id: 'gui.mcremote.error.point',
        defaultMessage: 'Offending point (absolute world coordinates): x={x}, y={y}, z={z}.',
        description: 'Learner-facing diagnostic: point'
    },
    rangeDetails: {
        id: 'gui.mcremote.error.rangeDetails',
        defaultMessage: 'Build origin: x={x}, z={z}. Range: ±{range}.',
        description: 'Learner-facing diagnostic: rangeDetails'
    },
    borderDetails: {
        id: 'gui.mcremote.error.borderDetails',
        defaultMessage: 'World border: center x={x}, z={z}; size {size}.',
        description: 'Learner-facing diagnostic: borderDetails'
    },
    details: {
        id: 'gui.mcremote.error.details',
        defaultMessage: 'Error details',
        description: 'Learner-facing diagnostic: details'
    }
});

const ErrorMessage = ({error, server}) => {
    const intl = useIntl();
    const data = error.data || {};
    const bounds = data.bounds || {};
    const point = data.violating;
    const reason = error.reason || data.reason;
    let message = error.message;
    if (reason === 'method_not_found' || error.code === -32601) {
        const name = server && server.name;
        const operation = intl.formatMessage(operationLabels[error.method] || messages.operation);
        message = intl.formatMessage(name ? messages.unsupportedNamed : messages.unsupported,
            {operation, server: name === 'mc-remote-unity-sandbox' ? intl.formatMessage(messages.unity) : name});
    } else if (reason === 'out_of_bounds') {
        message = intl.formatMessage(messages.outside);
        if (point && Number.isFinite(point.y) && Number.isFinite(bounds.y_min) && Number.isFinite(bounds.y_max) &&
            (point.y < bounds.y_min || point.y > bounds.y_max)) {
            message = intl.formatMessage(messages.height, {y: point.y, min: bounds.y_min, max: bounds.y_max});
        }
    } else if (reason === 'build_range_exceeded') {
        message = intl.formatMessage(messages.range);
    } else if (reason === 'block_count_limit_exceeded') {
        message = intl.formatMessage(messages.count, {
            requested: Number.isFinite(data.requested) ? intl.formatNumber(data.requested) : '—',
            limit: Number.isFinite(data.limit) ? intl.formatNumber(data.limit) : '—'
        });
    }
    return (
        <div role="alert">
            <strong>{message}</strong>
            {point && ['x', 'y', 'z'].every(key => Number.isFinite(point[key])) ? (
                <p>{intl.formatMessage(messages.point, point)}</p>
            ) : null}
            {Number.isFinite(bounds.build_range) && bounds.center &&
                ['x', 'z'].every(key => Number.isFinite(bounds.center[key])) ? (
                    <p>{intl.formatMessage(messages.rangeDetails, {...bounds.center, range: bounds.build_range})}</p>
                ) : null}
            {bounds.world_border && Number.isFinite(bounds.world_border.size) && bounds.world_border.center &&
                ['x', 'z'].every(key => Number.isFinite(bounds.world_border.center[key])) ? (
                    <p>{intl.formatMessage(messages.borderDetails,
                        {...bounds.world_border.center, size: bounds.world_border.size})}</p>
                ) : null}
            <details>
                <summary>{intl.formatMessage(messages.details)}</summary>
                {error.method ? <code>{error.method}</code> : null}
                <pre>{JSON.stringify({code: error.code, reason, data}, null, 2)}</pre>
            </details>
        </div>
    );
};

ErrorMessage.propTypes = {
    error: PropTypes.object.isRequired,
    server: PropTypes.shape({name: PropTypes.string, version: PropTypes.string})
};

export default ErrorMessage;
