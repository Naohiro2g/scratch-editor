import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import {getMcRemoteConnectionTargetByRoute} from '../../lib/mcremote-connection-targets.js';
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
    connectionTarget: {
        id: 'gui.mcremote.wireScope.connectionTarget',
        defaultMessage: 'Connection target',
        description: 'Label for the current McRemote connection target'
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

const connectionTargetText = function (intl, snapshotTarget, configuredTarget) {
    let sandboxRoute = '';
    if (snapshotTarget && snapshotTarget.sandboxRoute) {
        sandboxRoute = String(snapshotTarget.sandboxRoute).trim();
    } else if (configuredTarget && configuredTarget.sandboxRoute) {
        sandboxRoute = String(configuredTarget.sandboxRoute).trim();
    }
    if (!sandboxRoute) return EMPTY;

    const knownTarget = getMcRemoteConnectionTargetByRoute(sandboxRoute);
    let label = '';
    if (snapshotTarget && snapshotTarget.label) {
        label = String(snapshotTarget.label);
    } else if (knownTarget.sandboxRoute === sandboxRoute) {
        label = intl.formatMessage(knownTarget.label);
    }
    return label ? `${label} - ${sandboxRoute}` : sandboxRoute;
};

const directionLabel = function (intl, direction) {
    if (direction === 'send') return intl.formatMessage(messages.send);
    if (direction === 'receive') return intl.formatMessage(messages.receive);
    return direction || EMPTY;
};

const WireScopePanel = ({
    connectionTarget,
    snapshot
}) => {
    const intl = useIntl();
    const state = snapshot || {};
    const hello = state.hello || {};
    const frames = Array.isArray(state.frameLog) ? state.frameLog.slice(-12) : [];
    const currentStatus = statusInfo(state.status);
    const statusText = intl.formatMessage(currentStatus.message);
    const targetText = connectionTargetText(intl, state.connectionTarget, connectionTarget);

    return (
        <aside
            className={classNames(styles.panel, currentStatus.className)}
            aria-label={intl.formatMessage(messages.title)}
        >
            <header className={styles.header}>
                <div className={styles.title}>
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
            </header>
            <section className={styles.summary}>
                <div className={styles.summaryItem}>
                    <span><FormattedMessage {...messages.statusLabel} /></span>
                    <strong>{statusText}</strong>
                </div>
                <div className={styles.summaryItem}>
                    <span><FormattedMessage {...messages.stream} /></span>
                    <strong>{state.streamId || EMPTY}</strong>
                </div>
                <div className={styles.summaryItemWide}>
                    <span><FormattedMessage {...messages.connectionTarget} /></span>
                    <strong>{targetText}</strong>
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
                                    <tr key={frame.sequence || `${frame.direction}-${frame.id}-${frame.timestamp}`}>
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
        </aside>
    );
};

WireScopePanel.propTypes = {
    connectionTarget: PropTypes.shape({
        sandboxRoute: PropTypes.string
    }),
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
