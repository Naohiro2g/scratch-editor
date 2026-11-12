const DEFAULT_CONNECTION_POLICY = Object.freeze({
    requestIdleTimeoutMs: 15 * 60 * 1000,
    autoReconnect: true,
    connectTimeoutMs: 60 * 1000,
    reconnectInitialDelayMs: 500,
    reconnectMaxDelayMs: 30 * 1000,
    reconnectTimeoutMs: 5 * 60 * 1000
});

class McRemoteCompletionUnknownError extends Error {
    constructor (message, epoch, deliveryFailure = false) {
        super(message);
        this.name = 'McRemoteCompletionUnknownError';
        this.origin = 'client';
        this.completionUnknown = true;
        this.epoch = epoch;
        this.deliveryFailure = deliveryFailure;
    }
}

class McRemoteNotSentError extends Error {
    constructor (message, epoch, deliveryFailure = false) {
        super(message);
        this.name = 'McRemoteNotSentError';
        this.origin = 'client';
        this.notSent = true;
        this.epoch = epoch;
        this.deliveryFailure = deliveryFailure;
    }
}

// Events are snapshots: consumers cannot mutate a live session through them.
const freezeSnapshot = value => {
    if (Array.isArray(value)) return Object.freeze(value.map(freezeSnapshot));
    if (value && typeof value === 'object') {
        const result = {};
        for (const [key, item] of Object.entries(value)) result[key] = freezeSnapshot(item);
        return Object.freeze(result);
    }
    return value;
};

module.exports = {DEFAULT_CONNECTION_POLICY, McRemoteCompletionUnknownError, McRemoteNotSentError, freezeSnapshot};
