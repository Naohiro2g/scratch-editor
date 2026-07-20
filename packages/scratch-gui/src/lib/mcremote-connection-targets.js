import {defineMessages} from 'react-intl';
import {getMcRemoteRuntimeConfig} from './mcremote-runtime-config.js';

const DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE = getMcRemoteRuntimeConfig().defaultSandbox;

const connectionTargetLabels = defineMessages({
    sandbox: {
        id: 'gui.mcremote.connectionTarget.sandbox',
        defaultMessage: 'Sandbox',
        description: 'Menu label for the default McRemote Sandbox server'
    },
    stable: {
        id: 'gui.mcremote.connectionTarget.stable',
        defaultMessage: 'Stable',
        description: 'Menu label for the stable McRemote Sandbox channel'
    },
    beta: {
        id: 'gui.mcremote.connectionTarget.beta',
        defaultMessage: 'Beta',
        description: 'Menu label for the beta McRemote Sandbox channel'
    },
    alpha: {
        id: 'gui.mcremote.connectionTarget.alpha',
        defaultMessage: 'Alpha',
        description: 'Menu label for the alpha McRemote Sandbox channel'
    },
    dev: {
        id: 'gui.mcremote.connectionTarget.dev',
        defaultMessage: 'Dev',
        description: 'Menu label for the dev McRemote Sandbox channel'
    }
});

const MCREMOTE_CONNECTION_TARGETS = Object.freeze(getMcRemoteRuntimeConfig().connectionTargets.map(target =>
    Object.freeze({
        ...target,
        label: Object.prototype.hasOwnProperty.call(connectionTargetLabels, target.id) ?
            connectionTargetLabels[target.id] :
            connectionTargetLabels.sandbox
    })
));

const DEFAULT_MCREMOTE_CONNECTION_TARGET = MCREMOTE_CONNECTION_TARGETS.find(
    target => target.sandboxRoute === DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE
);

const normalizeMcRemoteConnectionTargetRoute = function (route) {
    return typeof route === 'string' ? route.trim() : '';
};

const getMcRemoteConnectionTargetByRoute = function (route) {
    const sandboxRoute = normalizeMcRemoteConnectionTargetRoute(route);
    // eslint-disable-next-line arrow-parens
    return MCREMOTE_CONNECTION_TARGETS.find(target => target.sandboxRoute === sandboxRoute) ||
        DEFAULT_MCREMOTE_CONNECTION_TARGET;
};

export {
    DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE,
    MCREMOTE_CONNECTION_TARGETS,
    getMcRemoteConnectionTargetByRoute,
    normalizeMcRemoteConnectionTargetRoute
};
