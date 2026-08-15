import {getMcRemoteRuntimeConfig} from './mcremote-runtime-config.js';

const DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE = getMcRemoteRuntimeConfig().defaultSandbox;

const MCREMOTE_CONNECTION_TARGETS = getMcRemoteRuntimeConfig().connectionTargets;

const DEFAULT_MCREMOTE_CONNECTION_TARGET = MCREMOTE_CONNECTION_TARGETS.find(
    ({sandboxRoute}) => sandboxRoute === DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE
);

const normalizeMcRemoteConnectionTargetRoute = function (route) {
    return typeof route === 'string' ? route.trim() : '';
};

const getMcRemoteConnectionTargetByRoute = function (route) {
    const sandboxRoute = normalizeMcRemoteConnectionTargetRoute(route);
    return MCREMOTE_CONNECTION_TARGETS.find(({sandboxRoute: targetRoute}) => targetRoute === sandboxRoute) ||
        DEFAULT_MCREMOTE_CONNECTION_TARGET;
};

export {
    DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE,
    MCREMOTE_CONNECTION_TARGETS,
    getMcRemoteConnectionTargetByRoute,
    normalizeMcRemoteConnectionTargetRoute
};
