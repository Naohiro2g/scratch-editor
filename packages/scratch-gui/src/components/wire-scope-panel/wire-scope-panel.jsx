import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import {getMcRemoteConnectionTargetByRoute} from '../../lib/mcremote-connection-targets.js';
import {HIGH_CONTRAST_MODE} from '../../lib/settings/color-mode/index.js';
import styles from './wire-scope-panel.css';

const messages = defineMessages({
    title: {
        id: 'gui.mcremote.wireScope.title',
        defaultMessage: 'WireScope',
        description: 'Title for the McRemote wire observer panel'
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
        description: 'McRemote connection status when a bridge connection fails'
    },
    stream: {
        id: 'gui.mcremote.wireScope.stream',
        defaultMessage: 'Stream',
        description: 'Label for a McRemote stream identifier'
    },
    configuredTarget: {
        id: 'gui.mcremote.wireScope.configuredTarget',
        defaultMessage: 'Configured target',
        description: 'Label for the connection target chosen in Settings, whether or not it is currently connected'
    },
    actualTarget: {
        id: 'gui.mcremote.wireScope.actualTarget',
        defaultMessage: 'Actual target',
        description: 'Label for the connection target the bridge is actually connected to right now'
    },
    reconnectStatus: {
        id: 'gui.mcremote.wireScope.reconnectStatus',
        defaultMessage: 'Reconnect',
        description: 'Label for whether the McRemote connection needs to be (re)established'
    },
    reconnectNeeded: {
        id: 'gui.mcremote.wireScope.reconnectNeeded',
        defaultMessage: 'Needed',
        description: 'Shown when the actual connection does not match the configured target'
    },
    reconnectNotNeeded: {
        id: 'gui.mcremote.wireScope.reconnectNotNeeded',
        defaultMessage: 'Up to date',
        description: 'Shown when the actual connection already matches the configured target'
    },
    reconnectPending: {
        id: 'gui.mcremote.wireScope.reconnectPending',
        defaultMessage: 'Pairing…',
        description: 'Shown while a connection attempt toward the configured target is in progress'
    },
    collapse: {
        id: 'gui.mcremote.wireScope.collapse',
        defaultMessage: 'Collapse WireScope details',
        description: 'Accessible label for the control that hides the WireScope detail drawer'
    },
    expand: {
        id: 'gui.mcremote.wireScope.expand',
        defaultMessage: 'Expand WireScope details',
        description: 'Accessible label for the control that shows the WireScope detail drawer'
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
    hello: {
        id: 'gui.mcremote.wireScope.hello',
        defaultMessage: 'Hello',
        description: 'Heading for McRemote hello response information'
    },
    protocol: {
        id: 'gui.mcremote.wireScope.protocol',
        defaultMessage: 'Protocol',
        description: 'Label for McRemote protocol version'
    },
    mcVersion: {
        id: 'gui.mcremote.wireScope.mcVersion',
        defaultMessage: 'MC version',
        description: 'Label for Minecraft server version'
    },
    worldConstants: {
        id: 'gui.mcremote.wireScope.worldConstants',
        defaultMessage: 'World constants',
        description: 'Label for Minecraft world constants from hello'
    },
    permissions: {
        id: 'gui.mcremote.wireScope.permissions',
        defaultMessage: 'Permissions',
        description: 'Label for McRemote permission information from hello'
    },
    lastError: {
        id: 'gui.mcremote.wireScope.lastError',
        defaultMessage: 'Last error',
        description: 'Label for the last McRemote connection error'
    },
    frames: {
        id: 'gui.mcremote.wireScope.frames',
        defaultMessage: 'Frames',
        description: 'Heading for McRemote wire frame log'
    },
    time: {
        id: 'gui.mcremote.wireScope.time',
        defaultMessage: 'Time',
        description: 'Column label for a frame timestamp'
    },
    direction: {
        id: 'gui.mcremote.wireScope.direction',
        defaultMessage: 'Dir',
        description: 'Column label for frame direction'
    },
    method: {
        id: 'gui.mcremote.wireScope.method',
        defaultMessage: 'Method',
        description: 'Column label for JSON-RPC method'
    },
    payload: {
        id: 'gui.mcremote.wireScope.payload',
        defaultMessage: 'Payload',
        description: 'Column label for JSON payload'
    },
    send: {
        id: 'gui.mcremote.wireScope.send',
        defaultMessage: 'send',
        description: 'Frame direction label for a client-to-server frame'
    },
    receive: {
        id: 'gui.mcremote.wireScope.receive',
        defaultMessage: 'recv',
        description: 'Frame direction label for a server-to-client frame'
    },
    emptyFrames: {
        id: 'gui.mcremote.wireScope.emptyFrames',
        defaultMessage: 'No frames yet',
        description: 'Empty state for the McRemote frame log'
    }
});

const EMPTY = '-';

const stringify = function (value) {
    if (value === null || typeof value === 'undefined' || value === '') {
        return EMPTY;
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return EMPTY;
    }
};

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

const targetText = function (intl, target) {
    const sandboxRoute = routeOf(target);
    if (!sandboxRoute) return EMPTY;

    const knownTarget = getMcRemoteConnectionTargetByRoute(sandboxRoute);
    let label = '';
    if (target.label) {
        label = String(target.label);
    } else if (knownTarget.sandboxRoute === sandboxRoute) {
        label = intl.formatMessage(knownTarget.label);
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

const directionLabel = function (intl, direction) {
    if (direction === 'send') return intl.formatMessage(messages.send);
    if (direction === 'receive') return intl.formatMessage(messages.receive);
    return direction || EMPTY;
};

const WireScopePanel = ({
    connectionTarget,
    snapshot,
    colorMode
}) => {
    const intl = useIntl();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const state = snapshot || {};
    const hello = state.hello || {};
    const frames = Array.isArray(state.frameLog) ? state.frameLog.slice(-12) : [];
    const currentStatus = statusInfo(state.status);
    const statusText = intl.formatMessage(currentStatus.message);
    const configuredTargetText = targetText(intl, connectionTarget);
    const actualTargetText = state.connectionTarget ? targetText(intl, state.connectionTarget) : EMPTY;
    const reconnect = reconnectInfo(state.status, routeOf(connectionTarget), routeOf(state.connectionTarget));
    const reconnectText = intl.formatMessage(reconnect.message);
    const isHighContrast = colorMode === HIGH_CONTRAST_MODE;

    const toggleCollapsed = useCallback(() => {
        setIsCollapsed(!isCollapsed);
    }, [isCollapsed]);

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
            <section className={styles.statusStrip}>
                <div className={styles.summaryItemWide}>
                    <span><FormattedMessage {...messages.configuredTarget} /></span>
                    <strong>{configuredTargetText}</strong>
                </div>
                <div className={styles.summaryItemWide}>
                    <span><FormattedMessage {...messages.actualTarget} /></span>
                    <strong>{actualTargetText}</strong>
                </div>
                <div className={classNames(styles.summaryItemWide, styles.reconnectItem, reconnect.className)}>
                    <span
                        className={styles.reconnectIcon}
                        aria-hidden="true"
                    >
                        {reconnect.icon}
                    </span>
                    <span><FormattedMessage {...messages.reconnectStatus} /></span>
                    <strong>{reconnectText}</strong>
                </div>
            </section>
            {!isCollapsed && (
                <React.Fragment>
                    <section className={styles.summary}>
                        <div className={styles.summaryItem}>
                            <span><FormattedMessage {...messages.statusLabel} /></span>
                            <strong>{statusText}</strong>
                        </div>
                        <div className={styles.summaryItem}>
                            <span><FormattedMessage {...messages.stream} /></span>
                            <strong>{state.streamId || EMPTY}</strong>
                        </div>
                        <div className={styles.summaryItem}>
                            <span><FormattedMessage {...messages.pairCode} /></span>
                            <strong>{state.pairCode || EMPTY}</strong>
                        </div>
                        <div className={styles.summaryItemWide}>
                            <span><FormattedMessage {...messages.pairCommand} /></span>
                            <code>{state.pairCommand || EMPTY}</code>
                        </div>
                    </section>
                    <section className={styles.section}>
                        <h3><FormattedMessage {...messages.hello} /></h3>
                        <dl className={styles.details}>
                            <dt>
                                <FormattedMessage {...messages.mcVersion} />
                                {' - '}
                                <FormattedMessage {...messages.protocol} />
                            </dt>
                            <dd>{`${hello.mc_version || EMPTY} - ${hello.protocol || EMPTY}`}</dd>
                            <dt><FormattedMessage {...messages.worldConstants} /></dt>
                            <dd><code>{stringify(hello.world_constants)}</code></dd>
                            <dt><FormattedMessage {...messages.permissions} /></dt>
                            <dd><code>{stringify(hello.permissions)}</code></dd>
                        </dl>
                        {state.lastError ? (
                            <div className={styles.errorLine}>
                                <span><FormattedMessage {...messages.lastError} /></span>
                                <code>{stringify(state.lastError)}</code>
                            </div>
                        ) : null}
                    </section>
                    <section className={styles.section}>
                        <h3><FormattedMessage {...messages.frames} /></h3>
                        {frames.length ? (
                            <div className={styles.frameTableWrap}>
                                <table className={styles.frameTable}>
                                    <thead>
                                        <tr>
                                            <th><FormattedMessage {...messages.time} /></th>
                                            <th><FormattedMessage {...messages.stream} /></th>
                                            <th><FormattedMessage {...messages.direction} /></th>
                                            <th><FormattedMessage {...messages.method} /></th>
                                            <th><FormattedMessage {...messages.payload} /></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* eslint-disable-next-line arrow-parens */}
                                        {frames.map(frame => (
                                            <tr
                                                key={frame.sequence ||
                                                    `${frame.direction}-${frame.id}-${frame.timestamp}`}
                                            >
                                                <td>{frame.timestamp ? intl.formatTime(frame.timestamp) : EMPTY}</td>
                                                <td>{frame.streamId || EMPTY}</td>
                                                <td>{directionLabel(intl, frame.direction)}</td>
                                                <td>{frame.method || EMPTY}</td>
                                                <td><code>{stringify(frame.payload)}</code></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className={styles.emptyFrames}>
                                <FormattedMessage {...messages.emptyFrames} />
                            </div>
                        )}
                    </section>
                </React.Fragment>
            )}
        </aside>
    );
};

WireScopePanel.propTypes = {
    connectionTarget: PropTypes.shape({
        sandboxRoute: PropTypes.string
    }),
    colorMode: PropTypes.string,
    snapshot: PropTypes.shape({
        status: PropTypes.string,
        streamId: PropTypes.string,
        connectionTarget: PropTypes.shape({
            sandboxRoute: PropTypes.string,
            label: PropTypes.string
        }),
        pairCode: PropTypes.string,
        pairCommand: PropTypes.string,
        hello: PropTypes.shape({
            protocol: PropTypes.string,
            mc_version: PropTypes.string,
            supported_mc_versions: PropTypes.arrayOf(PropTypes.string),
            world_constants: PropTypes.shape({}),
            permissions: PropTypes.shape({})
        }),
        lastError: PropTypes.shape({
            message: PropTypes.string,
            code: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
            reason: PropTypes.string
        }),
        frameLog: PropTypes.arrayOf(PropTypes.shape({
            sequence: PropTypes.number,
            timestamp: PropTypes.number,
            streamId: PropTypes.string,
            direction: PropTypes.string,
            method: PropTypes.string,
            payload: PropTypes.shape({})
        }))
    })
};

export default WireScopePanel;
