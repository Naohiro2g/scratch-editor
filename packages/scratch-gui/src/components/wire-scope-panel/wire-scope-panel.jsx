import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import {getMcRemoteConnectionTargetByRoute} from '../../lib/mcremote-connection-targets.js';
import {launchWireScope} from '../../lib/mcremote-wirescope-source';
import {HIGH_CONTRAST_MODE} from '../../lib/settings/color-mode/index.js';
import styles from './wire-scope-panel.css';

const messages = defineMessages({
    title: {
        id: 'gui.mcremote.wireScope.title',
        defaultMessage: 'WireScope mini',
        description: 'Title for the compact McRemote connection observer'
    },
    statusLabel: {
        id: 'gui.mcremote.wireScope.status',
        defaultMessage: 'Status',
        description: 'Label for the McRemote connection status'
    },
    statusDisconnected: {
        id: 'gui.mcremote.wireScope.statusDisconnected',
        defaultMessage: 'Not connected',
        description: 'McRemote connection status when no bridge connection is open'
    },
    statusPairing: {
        id: 'gui.mcremote.wireScope.statusPairing',
        defaultMessage: 'Pair waiting',
        description: 'McRemote connection status while waiting for Minecraft pairing'
    },
    statusConnected: {
        id: 'gui.mcremote.wireScope.statusConnected',
        defaultMessage: 'Connected',
        description: 'McRemote connection status when the bridge handshake completed'
    },
    statusClosed: {
        id: 'gui.mcremote.wireScope.statusClosed',
        defaultMessage: 'Disconnected',
        description: 'McRemote connection status after a bridge connection closes'
    },
    statusError: {
        id: 'gui.mcremote.wireScope.statusError',
        defaultMessage: 'Error',
        description: 'McRemote connection status when the bridge connection fails'
    },
    configuredTarget: {
        id: 'gui.mcremote.wireScope.configuredTarget',
        defaultMessage: 'Configured target',
        description: 'Label for the connection target chosen in Settings'
    },
    actualTarget: {
        id: 'gui.mcremote.wireScope.actualTarget',
        defaultMessage: 'Actual target',
        description: 'Label for the connection target the bridge is currently connected to'
    },
    reconnectStatus: {
        id: 'gui.mcremote.wireScope.reconnectStatus',
        defaultMessage: 'Reconnect',
        description: 'Label for whether the McRemote connection needs to be established again'
    },
    reconnectNeeded: {
        id: 'gui.mcremote.wireScope.reconnectNeeded',
        defaultMessage: 'Needed',
        description: 'Shown when the actual connection does not match the configured target'
    },
    reconnectNotNeeded: {
        id: 'gui.mcremote.wireScope.reconnectNotNeeded',
        defaultMessage: 'Up to date',
        description: 'Shown when the actual connection matches the configured target'
    },
    reconnectPending: {
        id: 'gui.mcremote.wireScope.reconnectPending',
        defaultMessage: 'Pairing…',
        description: 'Shown while a connection attempt is in progress'
    },
    collapse: {
        id: 'gui.mcremote.wireScope.collapse',
        defaultMessage: 'Collapse WireScope mini',
        description: 'Accessible label for the control that hides WireScope mini details'
    },
    expand: {
        id: 'gui.mcremote.wireScope.expand',
        defaultMessage: 'Expand WireScope mini',
        description: 'Accessible label for the control that shows WireScope mini details'
    },
    pairCode: {
        id: 'gui.mcremote.wireScope.pairCode',
        defaultMessage: 'Pair code',
        description: 'Label for the current McRemote pair code'
    },
    pairCommand: {
        id: 'gui.mcremote.wireScope.pairCommand',
        defaultMessage: 'Pair command',
        description: 'Label for the current McRemote pair command'
    },
    observationTarget: {
        id: 'gui.mcremote.wireScope.observationTarget',
        defaultMessage: 'Observation target',
        description: 'Label for the non-secret observation target alias'
    },
    actionRequired: {
        id: 'gui.mcremote.wireScope.actionRequired',
        defaultMessage: 'Next step',
        description: 'Label for an action that resolves the current McRemote error'
    },
    actionConnect: {
        id: 'gui.mcremote.wireScope.actionConnect',
        defaultMessage: 'Run the connect block first.',
        description: 'Action shown after a McRemote command runs while disconnected'
    },
    actionConnectionDisabled: {
        id: 'gui.mcremote.wireScope.actionConnectionDisabled',
        defaultMessage: 'Minecraft commands are turned off on this showcase page.',
        description: 'Action shown when a deployment intentionally disables McRemote connectivity'
    },
    actionProtocolMismatch: {
        id: 'gui.mcremote.wireScope.actionProtocolMismatch',
        defaultMessage: 'Use matching Scratch and McRemote server versions.',
        description: 'Action shown when Scratch and the McRemote server use incompatible protocols'
    },
    actionPairAgain: {
        id: 'gui.mcremote.wireScope.actionPairAgain',
        defaultMessage: 'Run the connect block and pair again.',
        description: 'Action shown when a McRemote session credential is no longer valid'
    },
    actionRetry: {
        id: 'gui.mcremote.wireScope.actionRetry',
        defaultMessage: 'Check the connection and try again.',
        description: 'Fallback action shown for a McRemote connection error'
    },
    openIndependent: {
        id: 'gui.mcremote.wireScope.openIndependent',
        defaultMessage: 'Open WireScope',
        description: 'Button that opens the independent read-only WireScope observer'
    }
});

const EMPTY = '-';
const AUTH_REASONS = [
    'auth_required',
    'token_expired',
    'token_revoked',
    'token_not_found',
    'token_invalid'
];

const statusInfo = function (status) {
    switch (status) {
    case 'pairing':
        return {message: messages.statusPairing, className: styles.statusPairing, icon: '...'};
    case 'connected':
        return {message: messages.statusConnected, className: styles.statusConnected, icon: 'OK'};
    case 'closed':
        return {message: messages.statusClosed, className: styles.statusClosed, icon: 'X'};
    case 'error':
        return {message: messages.statusError, className: styles.statusError, icon: '!'};
    case 'disconnected':
    default:
        return {message: messages.statusDisconnected, className: styles.statusDisconnected, icon: '-'};
    }
};

const routeOf = function (target) {
    return target && target.sandboxRoute ? String(target.sandboxRoute).trim() : '';
};

const targetText = function (target) {
    const sandboxRoute = routeOf(target);
    if (!sandboxRoute) return EMPTY;

    const knownTarget = getMcRemoteConnectionTargetByRoute(sandboxRoute);
    let label = '';
    if (target.label) {
        label = String(target.label);
    } else if (knownTarget.sandboxRoute === sandboxRoute) {
        label = knownTarget.label;
    }
    return label ? `${label} - ${sandboxRoute}` : sandboxRoute;
};

const reconnectInfo = function (status, configuredRoute, actualRoute) {
    if (status === 'connected' && configuredRoute && configuredRoute === actualRoute) {
        return {message: messages.reconnectNotNeeded, className: styles.reconnectOk, icon: 'OK'};
    }
    if (status === 'pairing') {
        return {message: messages.reconnectPending, className: styles.reconnectPending, icon: '...'};
    }
    return {message: messages.reconnectNeeded, className: styles.reconnectNeeded, icon: '!'};
};

const actionMessage = function (lastError) {
    if (!lastError) return null;
    if (lastError.reason === 'not_connected') return messages.actionConnect;
    if (lastError.reason === 'connection_disabled') return messages.actionConnectionDisabled;
    if (lastError.reason === 'protocol_mismatch') return messages.actionProtocolMismatch;
    if (AUTH_REASONS.indexOf(lastError.reason) !== -1) return messages.actionPairAgain;
    return messages.actionRetry;
};

const WireScopePanel = ({connectionTarget, snapshot, colorMode, wireScopeUrl}) => {
    const intl = useIntl();
    const [isCollapsed, setIsCollapsed] = useState(true);
    const state = snapshot || {};
    const currentStatus = statusInfo(state.status);
    const statusText = intl.formatMessage(currentStatus.message);
    const reconnect = reconnectInfo(state.status, routeOf(connectionTarget), routeOf(state.connectionTarget));
    const reconnectText = intl.formatMessage(reconnect.message);
    const nextAction = actionMessage(state.lastError);
    const isHighContrast = colorMode === HIGH_CONTRAST_MODE;
    const observationLabel = `${state.sourceKind === 'scratch' ? 'Scratch' : EMPTY} · ${state.displayAlias}`;

    const toggleCollapsed = useCallback(() => {
        setIsCollapsed(!isCollapsed);
    }, [isCollapsed]);
    const openIndependent = useCallback(() => {
        launchWireScope(wireScopeUrl);
    }, [wireScopeUrl]);

    return (
        <aside
            className={classNames(styles.panel, currentStatus.className, {[styles.highContrast]: isHighContrast})}
            aria-label={intl.formatMessage(messages.title)}
            data-high-contrast={isHighContrast ? 'true' : null}
        >
            <button
                className={styles.header}
                aria-expanded={!isCollapsed}
                aria-label={intl.formatMessage(isCollapsed ? messages.expand : messages.collapse)}
                onClick={toggleCollapsed}
            >
                <div className={styles.title}>
                    <span
                        className={classNames(styles.collapseCaret, {[styles.collapsed]: isCollapsed})}
                        aria-hidden="true"
                    >
                        {'▾'}
                    </span>
                    <FormattedMessage {...messages.title} />
                </div>
                <div
                    className={styles.statusBadge}
                    role="status"
                    aria-label={`${intl.formatMessage(messages.statusLabel)}: ${statusText}`}
                >
                    <span
                        className={styles.statusBadgeIcon}
                        aria-hidden="true"
                    >
                        {currentStatus.icon}
                    </span>
                    <span className={styles.statusBadgeText}>{statusText}</span>
                </div>
            </button>
            {!isCollapsed && (
                <section className={styles.details}>
                    <div className={styles.detailRow}>
                        <span><FormattedMessage {...messages.configuredTarget} /></span>
                        <strong>{targetText(connectionTarget)}</strong>
                    </div>
                    <div className={styles.detailRow}>
                        <span><FormattedMessage {...messages.actualTarget} /></span>
                        <strong>{targetText(state.connectionTarget)}</strong>
                    </div>
                    {state.displayAlias ? (
                        <div className={styles.detailRow}>
                            <span><FormattedMessage {...messages.observationTarget} /></span>
                            <strong>{observationLabel}</strong>
                        </div>
                    ) : null}
                    <div className={classNames(styles.detailRow, styles.reconnectItem, reconnect.className)}>
                        <span
                            className={styles.reconnectIcon}
                            aria-hidden="true"
                        >
                            {reconnect.icon}
                        </span>
                        <span><FormattedMessage {...messages.reconnectStatus} /></span>
                        <strong>{reconnectText}</strong>
                    </div>
                    {state.pairCode ? (
                        <div className={styles.detailRow}>
                            <span><FormattedMessage {...messages.pairCode} /></span>
                            <strong>{state.pairCode}</strong>
                        </div>
                    ) : null}
                    {state.pairCommand ? (
                        <div className={styles.detailColumn}>
                            <span><FormattedMessage {...messages.pairCommand} /></span>
                            <code>{state.pairCommand}</code>
                        </div>
                    ) : null}
                    {nextAction ? (
                        <div
                            className={styles.action}
                            role="alert"
                        >
                            <span><FormattedMessage {...messages.actionRequired} /></span>
                            <strong><FormattedMessage {...nextAction} /></strong>
                        </div>
                    ) : null}
                    {state.status === 'connected' && state.displayAlias && wireScopeUrl ? (
                        <button
                            className={styles.launch}
                            onClick={openIndependent}
                        >
                            <FormattedMessage {...messages.openIndependent} />
                            <span aria-hidden="true">{'↗'}</span>
                        </button>
                    ) : null}
                </section>
            )}
        </aside>
    );
};

WireScopePanel.propTypes = {
    connectionTarget: PropTypes.shape({
        sandboxRoute: PropTypes.string
    }),
    colorMode: PropTypes.string,
    wireScopeUrl: PropTypes.string,
    snapshot: PropTypes.shape({
        status: PropTypes.string,
        sourceKind: PropTypes.string,
        displayAlias: PropTypes.string,
        connectionTarget: PropTypes.shape({
            sandboxRoute: PropTypes.string,
            label: PropTypes.string
        }),
        pairCode: PropTypes.string,
        pairCommand: PropTypes.string,
        lastError: PropTypes.shape({
            message: PropTypes.string,
            code: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
            reason: PropTypes.string
        })
    })
};

export default WireScopePanel;
