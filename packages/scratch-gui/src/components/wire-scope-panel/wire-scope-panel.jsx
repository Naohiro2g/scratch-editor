import CopyTextButton from './copy-text-button';
import ErrorMessage from './mcremote-error-message';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
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
    actionConnectTarget: {
        id: 'gui.mcremote.wireScope.actionConnectTarget',
        defaultMessage: 'Not connected to {target}. Run the connect block.',
        description: 'Action shown when the selected target needs its own connection'
    },
    lastOperationError: {
        id: 'gui.mcremote.wireScope.lastOperationError',
        defaultMessage: 'Last operation error',
        description: 'Label for the latest operation failure in this session'
    },
    actionConnectionDisabled: {
        id: 'gui.mcremote.wireScope.actionConnectionDisabled',
        defaultMessage: 'Server commands are turned off on this showcase page.',
        description: 'Action shown when a deployment intentionally disables McRemote connectivity'
    },
    actionProtocolMismatch: {
        id: 'gui.mcremote.wireScope.actionProtocolMismatch',
        defaultMessage: 'Use matching Scratch and mc-remote server versions.',
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
const ERROR_HIGHLIGHT_MS = 3000;
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

const targetLabel = function (target, sandboxRoute) {
    if (target.label) return target.label;
    const knownTarget = getMcRemoteConnectionTargetByRoute(sandboxRoute);
    return knownTarget && knownTarget.sandboxRoute === sandboxRoute ? knownTarget.label : '';
};

const targetText = function (target) {
    const sandboxRoute = routeOf(target);
    if (!sandboxRoute) return EMPTY;
    const label = targetLabel(target, sandboxRoute);
    return label ? `${label} - ${sandboxRoute}` : sandboxRoute;
};

const reconnectInfo = function (status, configuredRoute, actualRoute) {
    if (status === 'connected' && configuredRoute && configuredRoute === actualRoute) {
        return {message: messages.reconnectNotNeeded, className: styles.reconnectOk, icon: 'OK'};
    }
    if (status === 'pairing' && (!configuredRoute || configuredRoute === actualRoute)) {
        return {message: messages.reconnectPending, className: styles.reconnectPending, icon: '...'};
    }
    return {message: messages.reconnectNeeded, className: styles.reconnectNeeded, icon: '!'};
};

const connectionAction = function (state) {
    if (state.status === 'pairing') return null;
    const error = state.lastError;
    const reason = error && error.reason;
    if (reason === 'not_connected') return messages.actionConnect;
    if (reason === 'connection_disabled') return messages.actionConnectionDisabled;
    if (reason === 'protocol_mismatch') return messages.actionProtocolMismatch;
    if (AUTH_REASONS.includes(reason)) return messages.actionPairAgain;
    if (state.transportDiagnostic || ['sandbox_unreachable', 'bridge_transport_incompatible'].includes(reason)) {
        return messages.actionRetry;
    }
    return null;
};

const WireScopePanel = ({connectionTarget, snapshot, colorMode, wireScopeUrl}) => {
    const intl = useIntl();
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [highlightedErrorKey, setHighlightedErrorKey] = useState(null);
    const openedForConnect = useRef(false);
    const state = snapshot || {};
    useEffect(() => {
        if (!openedForConnect.current && (state.status === 'pairing' || state.status === 'connected')) {
            openedForConnect.current = true;
            setIsCollapsed(false);
        }
    }, [state.status]);
    const currentStatus = statusInfo(state.status);
    const statusText = intl.formatMessage(currentStatus.message);
    const configuredRoute = routeOf(connectionTarget);
    const actualRoute = routeOf(state.connectionTarget);
    const reconnect = reconnectInfo(state.status, configuredRoute, actualRoute);
    const reconnectText = intl.formatMessage(reconnect.message);
    const targetChanged = configuredRoute && actualRoute && configuredRoute !== actualRoute;
    const action = connectionAction(state);
    const connectSelected = targetChanged || (configuredRoute && state.status === 'disconnected' && !action);
    const nextAction = connectSelected ?
        intl.formatMessage(messages.actionConnectTarget, {
            target: targetLabel(connectionTarget, configuredRoute) || configuredRoute
        }) :
        action && intl.formatMessage(action);
    const operationError = !targetChanged && (state.lastOperationError ||
        (state.status === 'connected' && !action && state.lastError));
    const operationErrorKey = operationError ?
        (state.lastOperationError && state.lastOperationErrorId) || JSON.stringify(operationError) : null;

    useEffect(() => {
        if (operationErrorKey === null) return;
        setIsCollapsed(false);
        setHighlightedErrorKey(operationErrorKey);
        const timeout = setTimeout(() => setHighlightedErrorKey(null), ERROR_HIGHLIGHT_MS);
        return () => clearTimeout(timeout);
    }, [operationErrorKey]);

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
                    {state.hello && state.hello.server ? (
                        <div className={styles.detailRow}>
                            <span>
                                <FormattedMessage
                                    id="gui.mcremote.wireScope.server"
                                    defaultMessage="Server implementation / version"
                                    description="The identity advertised by the connected server"
                                />
                            </span>
                            <strong>{state.hello.server.name} / {state.hello.server.version}</strong>
                        </div>
                    ) : null}
                    {operationError ? (
                        <div className={classNames(styles.detailColumn, styles.operationError)}>
                            {highlightedErrorKey === operationErrorKey ? (
                                <div
                                    aria-hidden="true"
                                    className={styles.errorHighlight}
                                    key={operationErrorKey}
                                />
                            ) : null}
                            <span><FormattedMessage {...messages.lastOperationError} /></span>
                            <ErrorMessage
                                error={operationError}
                                server={state.hello && state.hello.server}
                            />
                        </div>
                    ) : null}
                    {!targetChanged && state.pairCode ? (
                        <div className={styles.detailRow}>
                            <span><FormattedMessage {...messages.pairCode} /></span>
                            <strong>{state.pairCode}</strong>
                        </div>
                    ) : null}
                    {!targetChanged && state.pairCommand ? (
                        <div className={styles.detailColumn}>
                            <div className={styles.copyRow}>
                                <span><FormattedMessage {...messages.pairCommand} /></span>
                                <CopyTextButton
                                    key={state.pairCommand}
                                    text={state.pairCommand}
                                />
                            </div>
                            <code className={styles.pairCommand}>{state.pairCommand}</code>
                        </div>
                    ) : null}
                    {nextAction ? (
                        <div
                            className={styles.action}
                            role="alert"
                        >
                            <span><FormattedMessage {...messages.actionRequired} /></span>
                            <strong>{nextAction}</strong>
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

const errorSummaryPropType = PropTypes.shape({
    message: PropTypes.string,
    code: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    reason: PropTypes.string,
    method: PropTypes.string
});

WireScopePanel.propTypes = {
    connectionTarget: PropTypes.shape({
        sandboxRoute: PropTypes.string,
        label: PropTypes.string
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
        hello: PropTypes.shape({server: PropTypes.shape({name: PropTypes.string, version: PropTypes.string})}),
        pairCode: PropTypes.string,
        pairCommand: PropTypes.string,
        lastOperationError: errorSummaryPropType,
        lastOperationErrorId: PropTypes.number,
        transportDiagnostic: errorSummaryPropType,
        lastError: errorSummaryPropType
    })
};

export default WireScopePanel;
