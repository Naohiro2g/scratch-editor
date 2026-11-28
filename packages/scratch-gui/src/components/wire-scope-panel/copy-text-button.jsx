import PropTypes from 'prop-types';
import React, {useCallback, useState} from 'react';
import {defineMessages, FormattedMessage} from 'react-intl';

import styles from './wire-scope-panel.css';

const messages = defineMessages({
    copy: {
        id: 'gui.mcremote.wireScope.copy',
        defaultMessage: 'Copy',
        description: 'Button to copy a pairing command or error details'
    },
    copied: {
        id: 'gui.mcremote.wireScope.copied',
        defaultMessage: 'Copied',
        description: 'Confirmation that text has been copied'
    },
    copyFailed: {
        id: 'gui.mcremote.wireScope.copyFailed',
        defaultMessage: 'Could not copy',
        description: 'Shown when the browser did not copy the text'
    }
});

const copyText = async function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    // The Clipboard API is unavailable on plain HTTP origins.
    const field = document.createElement('textarea');
    const previousFocus = document.activeElement;
    field.value = text;
    field.readOnly = true;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    try {
        field.select();
        if (!document.execCommand('copy')) throw new Error('Copy command failed');
    } finally {
        field.remove();
        if (previousFocus) previousFocus.focus({preventScroll: true});
    }
};

const CopyTextButton = ({text}) => {
    const [feedback, setFeedback] = useState(null);
    const copy = useCallback(async () => {
        setFeedback(null);
        try {
            await copyText(text);
            setFeedback(messages.copied);
        } catch {
            setFeedback(messages.copyFailed);
        }
    }, [text]);

    return (
        <div className={styles.copyControl}>
            <button
                className={styles.copyButton}
                type="button"
                onClick={copy}
            >
                <FormattedMessage {...messages.copy} />
            </button>
            {feedback ? (
                <div
                    className={styles.copyFeedback}
                    role="status"
                >
                    <FormattedMessage {...feedback} />
                </div>
            ) : null}
        </div>
    );
};

CopyTextButton.propTypes = {text: PropTypes.string.isRequired};
export default CopyTextButton;
