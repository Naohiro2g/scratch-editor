import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';

import {getMcRemoteRuntimeConfig} from '../../lib/mcremote-runtime-config.js';
import {HIGH_CONTRAST_MODE} from '../../lib/settings/color-mode/index.js';
import styles from './notice-overlay.css';

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
    }
});

/**
 * Collapsible notice panel anchored to the Scratch logo. Closed state is a small badge
 * overlapping the logo's bottom-left corner; open state shows an overlay panel that does
 * not reflow the rest of the workspace. Always starts open on mount (i.e. on every load)
 * and never persists its closed state, so new notices are never silently missed.
 * @param {object} root0 - component props.
 * @param {string} root0.colorMode - the active Scratch Color Mode (`original`/`high-contrast`/`dark`).
 * @returns {?object} the notice overlay, or null when there is nothing to show.
 */
const NoticeOverlay = ({colorMode}) => {
    const intl = useIntl();
    const [isOpen, setIsOpen] = useState(true);
    const wrapperRef = useRef(null);
    const triggerRef = useRef(null);
    const notices = getMcRemoteRuntimeConfig().notices;
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

    if (!Array.isArray(notices) || notices.length === 0) return null;

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
                {notices.map((notice, index) => (
                    <div
                        className={styles.notice}
                        key={`${notice.heading}-${index}`}
                    >
                        <h3 className={styles.heading}>{notice.heading}</h3>
                        <p className={styles.text}>{notice.body}</p>
                        {notice.link && (
                            <a
                                className={styles.link}
                                href={notice.link.href}
                                rel="noopener noreferrer"
                                target="_blank"
                                tabIndex={isOpen ? 0 : -1}
                            >
                                {notice.link.label}
                            </a>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

NoticeOverlay.propTypes = {
    colorMode: PropTypes.string
};

export default NoticeOverlay;
