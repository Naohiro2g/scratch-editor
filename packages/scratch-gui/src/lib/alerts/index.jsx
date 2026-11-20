import React from 'react';
import {FormattedMessage} from 'react-intl';
import keyMirror from 'keymirror';

import successImage from '../assets/icon--success.svg';
import failImage from '../assets/icon--error.svg';

const AlertTypes = keyMirror({
    STANDARD: null,
    EXTENSION: null,
    INLINE: null
});

const AlertLevels = {
    SUCCESS: 'success',
    INFO_BLUE: 'info-blue',
    INFO: 'info',
    WARN: 'warn'
};

const mcRemoteConnectionAlerts = ['mcremoteNotConnected', 'mcremoteConnectionDisabled', 'mcremotePairAgain'];
const mcRemoteEventAlerts = ['mcremoteEventsLost', 'mcremoteEventsStopped'];

const alerts = [
    {
        alertId: 'createSuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="New project created."
                description="Message indicating that project was successfully created"
                id="gui.alerts.createsuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'createCopySuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Project saved as a copy."
                description="Message indicating that project was successfully created"
                id="gui.alerts.createcopysuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'createRemixSuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Project saved as a remix."
                description="Message indicating that project was successfully created"
                id="gui.alerts.createremixsuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'creating',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Creating new…"
                description="Message indicating that project is in process of creating"
                id="gui.alerts.creating"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'creatingCopy',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Copying project…"
                description="Message indicating that project is in process of copying"
                id="gui.alerts.creatingCopy"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'creatingRemix',
        alertType: AlertTypes.STANDARD,
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        content: (
            <FormattedMessage
                defaultMessage="Remixing project…"
                description="Message indicating that project is in process of remixing"
                id="gui.alerts.creatingRemix"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'creatingError',
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        closeButton: true,
        content: (
            <FormattedMessage
                defaultMessage="Could not create the project. Please try again!"
                description="Message indicating that project could not be created"
                id="gui.alerts.creatingError"
            />
        ),
        level: AlertLevels.WARN
    },
    {
        alertId: 'savingError',
        clearList: ['createSuccess', 'creating', 'createCopySuccess', 'creatingCopy',
            'createRemixSuccess', 'creatingRemix', 'saveSuccess', 'saving'],
        showDownload: true,
        showSaveNow: true,
        closeButton: false,
        content: (
            <FormattedMessage
                defaultMessage="Project could not save."
                description="Message indicating that project could not be saved"
                id="gui.alerts.savingError"
            />
        ),
        level: AlertLevels.WARN
    },
    {
        alertId: 'saveSuccess',
        alertType: AlertTypes.INLINE,
        clearList: ['saveSuccess', 'saving', 'savingError'],
        content: (
            <FormattedMessage
                defaultMessage="Project saved."
                description="Message indicating that project was successfully saved"
                id="gui.alerts.savesuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 3
    },
    {
        alertId: 'saving',
        alertType: AlertTypes.INLINE,
        clearList: ['saveSuccess', 'saving', 'savingError'],
        content: (
            <FormattedMessage
                defaultMessage="Saving project…"
                description="Message indicating that project is in process of saving"
                id="gui.alerts.saving"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.INFO
    },
    {
        alertId: 'cloudInfo',
        alertType: AlertTypes.STANDARD,
        clearList: ['cloudInfo'],
        content: (
            <FormattedMessage
                defaultMessage="Please note, cloud variables only support numbers, not letters or symbols. <a>{learnMoreLink}</a>" // eslint-disable-line @stylistic/max-len
                description="Info about cloud variable limitations"
                id="gui.alerts.cloudInfo"
                values={{
                    learnMoreLink: (
                        <FormattedMessage
                            defaultMessage="Learn more."
                            description="Link text to cloud var faq"
                            id="gui.alerts.cloudInfoLearnMore"
                        />
                    ),
                    a: learnMoreLink => (
                        <a
                            href="https://scratch.mit.edu/info/faq/#clouddata"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            {learnMoreLink}
                        </a>
                    )
                }}
            />
        ),
        closeButton: true,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 15
    },
    {
        alertId: 'importingAsset',
        alertType: AlertTypes.STANDARD,
        clearList: [],
        content: (
            <FormattedMessage
                defaultMessage="Importing…"
                description="Message indicating that project is in process of importing"
                id="gui.alerts.importing"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'mcremoteNotConnected',
        alertType: AlertTypes.STANDARD,
        clearList: mcRemoteConnectionAlerts,
        content: (
            <FormattedMessage
                defaultMessage="Run the mc-remote connect block first."
                description="Guidance after a command runs without a connection"
                id="gui.alerts.mcremoteNotConnected"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 5
    },
    {
        alertId: 'mcremoteConnectionDisabled',
        alertType: AlertTypes.STANDARD,
        clearList: mcRemoteConnectionAlerts,
        content: (
            <FormattedMessage
                defaultMessage="Minecraft commands are turned off in this showcase."
                description="Guidance after a command runs with connections disabled"
                id="gui.alerts.mcremoteConnectionDisabled"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 5
    },
    {
        alertId: 'mcremotePairAgain',
        alertType: AlertTypes.STANDARD,
        clearList: mcRemoteConnectionAlerts,
        content: (
            <FormattedMessage
                defaultMessage="Run the connect block and pair again."
                description="Guidance when reconnecting requires a new pairing"
                id="gui.alerts.mcremotePairAgain"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 8
    },
    {
        alertId: 'mcremoteBuildDeliveryFailed',
        alertType: AlertTypes.STANDARD,
        clearList: ['mcremoteBuildDeliveryFailed'],
        content: (
            <FormattedMessage
                defaultMessage="Block placement could not continue. Check the connection before trying again."
                description="Guidance after a building transport failure"
                id="gui.alerts.mcremoteBuildDeliveryFailed"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 8
    },
    {
        alertId: 'mcremoteBuildNotSent',
        alertType: AlertTypes.STANDARD,
        clearList: ['mcremoteBuildNotSent', 'mcremoteBuildDeliveryFailed'],
        content: (
            <FormattedMessage
                defaultMessage="Some build commands were not sent. Check the connection before running them again."
                description="Guidance when build commands did not reach the transport"
                id="gui.alerts.mcremoteBuildNotSent"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 8
    },
    {
        alertId: 'mcremoteBuildCompletionUnknown',
        alertType: AlertTypes.STANDARD,
        clearList: ['mcremoteBuildCompletionUnknown', 'mcremoteBuildDeliveryFailed'],
        content: (
            <FormattedMessage
                defaultMessage="The result of sent build commands is unknown. Check the world before retrying."
                description="Guidance when sent build commands were not confirmed"
                id="gui.alerts.mcremoteBuildCompletionUnknown"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 8
    },
    {
        alertId: 'mcremoteServerBackpressure',
        alertType: AlertTypes.STANDARD,
        clearList: ['mcremoteServerBackpressure'],
        content: (
            <FormattedMessage
                defaultMessage="mc-remote server is busy and did not accept the command. Wait a moment and try again."
                description="Guidance when the server rejects a command without closing the connection"
                id="gui.alerts.mcremoteServerBackpressure"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 8
    },
    {
        alertId: 'mcremoteEventsLost',
        alertType: AlertTypes.STANDARD,
        clearList: mcRemoteEventAlerts,
        content: (
            <FormattedMessage
                defaultMessage="Some events did not reach Scratch. Check any scripts that rely on those events."
                description="Warning about missed McRemote events"
                id="gui.alerts.mcremoteEventsLost"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 8
    },
    {
        alertId: 'mcremoteEventsStopped',
        alertType: AlertTypes.STANDARD,
        clearList: mcRemoteEventAlerts,
        content: (
            <FormattedMessage
                defaultMessage="Scratch stopped receiving events. Run the connect block to resume reception."
                description="Warning after Scratch stops receiving McRemote events"
                id="gui.alerts.mcremoteEventsStopped"
            />
        ),
        closeButton: true,
        level: AlertLevels.WARN,
        maxDisplaySecs: 8
    },
    {
        alertId: 'loadingExtensionData',
        alertType: AlertTypes.STANDARD,
        clearList: ['loadingExtensionData'],
        content: (
            <FormattedMessage
                defaultMessage="Loading extension..."
                description="Message indicating that extension is in process of loading"
                id="gui.alerts.loadingExtensionData"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.SUCCESS
    },
    {
        alertId: 'settingThumbnail',
        alertType: AlertTypes.STANDARD,
        clearList: ['settingThumbnail', 'thumbnailSuccess', 'thumbnailError'],
        content: (
            <FormattedMessage
                defaultMessage="Setting thumbnail…"
                description="Message indicating that the thumbnail is in the process of being set"
                id="gui.alerts.settingThumbnail"
            />
        ),
        iconSpinner: true,
        level: AlertLevels.INFO_BLUE
    },
    {
        alertId: 'thumbnailSuccess',
        alertType: AlertTypes.STANDARD,
        clearList: ['settingThumbnail', 'thumbnailSuccess', 'thumbnailError'],
        content: (
            <FormattedMessage
                defaultMessage="Thumbnail set successfully."
                description="Message indicating that the thumbnail was successfully set"
                id="gui.alerts.thumbnailSuccess"
            />
        ),
        iconURL: successImage,
        level: AlertLevels.SUCCESS,
        maxDisplaySecs: 5
    },
    {
        alertId: 'thumbnailError',
        alertType: AlertTypes.STANDARD,
        clearList: ['settingThumbnail', 'thumbnailError', 'thumbnailSuccess'],
        content: (
            <FormattedMessage
                defaultMessage="Couldn’t set thumbnail. Please try again later."
                description="Message indicating that setting the thumbnail failed"
                id="gui.alerts.thumbnailError"
            />
        ),
        iconURL: failImage,
        level: AlertLevels.WARN,
        maxDisplaySecs: 5
    }
];

export {
    alerts as default,
    AlertLevels,
    AlertTypes
};
