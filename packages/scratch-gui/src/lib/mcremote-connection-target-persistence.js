import {
    DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE,
    getMcRemoteConnectionTargetByRoute,
    normalizeMcRemoteConnectionTargetRoute
} from './mcremote-connection-targets.js';

const STORAGE_KEY = 'mcremote.connectionTarget.v1';

const storage = () => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
};

const detectMcRemoteConnectionTargetRoute = () => {
    const localStorage = storage();
    if (!localStorage) return DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE;

    try {
        const sandboxRoute = normalizeMcRemoteConnectionTargetRoute(localStorage.getItem(STORAGE_KEY));
        return getMcRemoteConnectionTargetByRoute(sandboxRoute).sandboxRoute;
    } catch {
        return DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE;
    }
};

const persistMcRemoteConnectionTargetRoute = function (route) {
    const target = getMcRemoteConnectionTargetByRoute(route);
    const localStorage = storage();
    if (!localStorage) return;

    try {
        localStorage.setItem(STORAGE_KEY, target.sandboxRoute);
    } catch {
        // localStorage can be unavailable in private browsing or tests.
    }
};

export {
    detectMcRemoteConnectionTargetRoute,
    persistMcRemoteConnectionTargetRoute
};
