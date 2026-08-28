import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {MCREMOTE_CLIENT_VERSION} from '@scratch/scratch-vm';

import {getMcRemoteRuntimeConfig} from '../../lib/mcremote-runtime-config.js';
import {HIGH_CONTRAST_MODE} from '../../lib/settings/color-mode/index.js';
import styles from './notice-overlay.css';

// The footer version and any `{version}` token in a configured notice always show this label,
// not the deployment's own `release_identity` (which a showcase build sets to a raw commit SHA
// for build-identity tracking, not for display) -- see mcremote-runtime-config.js's docs on
// `releaseIdentity`. Reading the version from scratch-vm keeps this label correct at every
// future release without a deployment needing to remember to update any notice text by hand.
const RELEASE_LABEL = `McRemote Scratch ${MCREMOTE_CLIENT_VERSION}`;
const VERSION_TOKEN = '{version}';
const substituteVersion = text => (typeof text === 'string' ? text.split(VERSION_TOKEN).join(RELEASE_LABEL) : text);

const messages = defineMessages({
    expand: {
        id: 'gui.mcremote.notice.expand',
        defaultMessage: 'Show notices',
        description: 'Accessible label for the control that opens the McRemote notice panel'
    },
    collapse: {
        id: 'gui.mcremote.notice.collapse',
        defaultMessage: 'Hide notices',
        description: 'Accessible label for the control that closes the McRemote notice panel'
    },
    version: {
        id: 'gui.mcremote.notice.version',
        defaultMessage: 'Version {version}',
        description: 'Fixed footer line showing the release identity, {version} is a build id like 2200.0.0b5'
    },
    homepageLink: {
        id: 'gui.mcremote.notice.homepageLink',
        defaultMessage: 'Homepage',
        description: 'Fixed footer link to the McRemote homepage'
    }
});

/**
 * Collapsible notice panel anchored to the Scratch logo. Closed state is a small badge
 * overlapping the logo's bottom-left corner; open state shows an overlay panel that does
 * not reflow the rest of the workspace. Always starts open on mount (i.e. on every load)
 * and never persists its closed state, so new notices are never silently missed. A fixed
 * footer (release version, homepage link) is always shown below any deployment-configured
 * notices, so that identity doesn't depend on the deployment remembering to add a notice
 * entry for it, and doesn't get lost from the list as older notices are edited out.
 * @param {object} root0 - component props.
 * @param {string} root0.colorMode - the active Scratch Color Mode (`original`/`high-contrast`/`dark`).
 * @returns {object} the notice overlay.
 */
const NoticeOverlay = ({colorMode}) => {
    const intl = useIntl();
    const [isOpen, setIsOpen] = useState(true);
    const wrapperRef = useRef(null);
    const triggerRef = useRef(null);
    const {notices, homepageUrl} = getMcRemoteRuntimeConfig();
    const isHighContrast = colorMode === HIGH_CONTRAST_MODE;

    const toggleOpen = useCallback(() => {
        setIsOpen((...[open]) => !open);
    }, []);

    const handleBodyKeyDown = useCallback(({key}) => {
        if (key !== 'Escape') return;
        setIsOpen(false);
        if (triggerRef.current) triggerRef.current.focus();
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        // Matches containers/menu.jsx: the Blockly workspace suppresses compat events
        // like `click`/`mouseup`, so outside-click detection listens for `pointerup`.
        const handlePointerUp = ({target}) => {
            if (wrapperRef.current && !wrapperRef.current.contains(target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('pointerup', handlePointerUp);
        return () => document.removeEventListener('pointerup', handlePointerUp);
    }, [isOpen]);

    const noticeList = Array.isArray(notices) ? notices : [];

    return (
        <div
            className={styles.wrapper}
            data-high-contrast={isHighContrast ? 'true' : null}
            ref={wrapperRef}
        >
            <button
                ref={triggerRef}
                className={classNames(styles.trigger, {[styles.highContrast]: isHighContrast})}
                aria-expanded={isOpen}
                aria-label={intl.formatMessage(isOpen ? messages.collapse : messages.expand)}
                onClick={toggleOpen}
            >
                <svg
                    aria-hidden="true"
                    className={classNames(styles.caret, {[styles.open]: isOpen})}
                    height="14"
                    viewBox="0 0 16 16"
                    width="14"
                >
                    <polygon
                        fill="currentColor"
                        points="3,3 13,3 8,13"
                        stroke="#fff"
                        strokeLinejoin="round"
                        strokeWidth="2"
                    />
                </svg>
            </button>
            <div
                className={classNames(styles.body, {[styles.open]: isOpen, [styles.highContrast]: isHighContrast})}
                aria-hidden={!isOpen}
                onKeyDown={handleBodyKeyDown}
            >
                {noticeList.map((notice, index) => (
                    <div
                        className={styles.notice}
                        key={`${notice.heading}-${index}`}
                    >
                        <h3 className={styles.heading}>{substituteVersion(notice.heading)}</h3>
                        <p className={styles.text}>{substituteVersion(notice.body)}</p>
                        {notice.link && (
                            <a
                                className={styles.link}
                                href={notice.link.href}
                                rel="noopener noreferrer"
                                target="_blank"
                                tabIndex={isOpen ? 0 : -1}
                            >
                                {substituteVersion(notice.link.label)}
                            </a>
                        )}
                    </div>
                ))}
                <div className={styles.footer}>
                    <span className={styles.footerVersion}>
                        {intl.formatMessage(messages.version, {version: RELEASE_LABEL})}
                    </span>
                    {homepageUrl && (
                        <a
                            className={classNames(styles.link, styles.footerLink)}
                            href={homepageUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                            tabIndex={isOpen ? 0 : -1}
                        >
                            {intl.formatMessage(messages.homepageLink)}
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};

NoticeOverlay.propTypes = {
    colorMode: PropTypes.string
};

export default NoticeOverlay;
