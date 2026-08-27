import React, {useCallback, useEffect, useState} from 'react';
import styles from './menu-bar.css';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import fileIcon from './icon--file.svg';
import {useIntl, FormattedMessage, defineMessage} from 'react-intl';
import MenuBarMenu from './menu-bar-menu.jsx';
import {MenuItem, MenuSection} from '../menu/menu.jsx';
import SB3Downloader from '../../containers/sb3-downloader.jsx';
import dropdownCaret from './dropdown-caret.svg';
import useMenuNavigation from '../../hooks/use-menu-navigation';

import sharedMessages from '../../lib/shared-messages';

import {saveProjectAsCopy} from '../../reducers/project-state';
import {
    requestRestoreLocalProject,
    requestDeleteLocalProject
} from '../../reducers/local-projects';
import {
    requestRestoreLocalSprite,
    requestDeleteLocalSprite
} from '../../reducers/local-sprites';
import {checkBrowserStoragePersisted} from '../../lib/browser-storage-persistence.js';

const fileMenu = defineMessage({
    id: 'gui.aria.fileMenu',
    defaultMessage: 'File menu',
    description: 'accessibility label for file menu'
});

const deleteBrowserSavedProjectMessage = defineMessage({
    id: 'gui.menuBar.deleteBrowserSavedProject',
    defaultMessage: 'Delete this browser-saved project',
    description: 'Accessible label for the delete control on a browser-saved project'
});

const deleteBrowserSavedSpriteMessage = defineMessage({
    id: 'gui.menuBar.deleteBrowserSavedSprite',
    defaultMessage: 'Delete this browser-saved sprite',
    description: 'Accessible label for the delete control on a browser-saved sprite'
});

// `navigator.storage.persisted()` is scoped to the whole origin, not to any
// one project or sprite, so this status is shown once per section heading
// rather than per list item.
const storagePersistGrantedMessage = defineMessage({
    id: 'gui.menuBar.storagePersistGranted',
    defaultMessage: 'Persistent',
    description: 'Shown next to the browser-saved list heading when the browser has granted persistent storage'
});
const storagePersistNotGrantedMessage = defineMessage({
    id: 'gui.menuBar.storagePersistNotGranted',
    defaultMessage: 'Not persistent',
    description:
        'Shown next to the browser-saved list heading when the browser has not granted persistent storage'
});

// Fixed `yyyy-mm-dd HH:MM:SS` (24-hour, local time) rather than a
// locale-formatted date: this is a save timestamp meant to be scanned and
// compared at a glance across many rows, not prose.
const pad2 = n => String(n).padStart(2, '0');
const formatLocalProjectUpdatedAt = updatedAt => {
    const date = new Date(updatedAt);
    const y = date.getFullYear();
    const mo = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    const h = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const s = pad2(date.getSeconds());
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
};

// Cap the number of browser-saved projects/sprites shown in the menu; the
// full list remains in IndexedDB regardless of how many are displayed here.
// Both lists share one menu, so each gets half of the 16-item budget the
// project list alone used to have.
const MAX_VISIBLE_LOCAL_PROJECTS = 8;
const MAX_VISIBLE_LOCAL_SPRITES = 8;

const FileMenu = ({
    isRtl,
    canSave,
    canCreateCopy,
    canRemix,
    localProjects,
    localSprites,
    onClickNew,
    onClickSave,
    onClickSaveAsCopy,
    onClickRemix,
    onStartSelectingFileUpload,
    getSaveToComputerHandler,
    onRestoreLocalProject,
    onDeleteLocalProject,
    onRestoreLocalSprite,
    onDeleteLocalSprite,
    remixMessage,
    depth
}) => {
    const intl = useIntl();

    // Origin-wide, not per-item: `navigator.storage.persisted()` reports on
    // this origin's storage as a whole, so the same value applies to every
    // browser-saved project and sprite alike.
    const [storagePersisted, setStoragePersisted] = useState(null);
    useEffect(() => {
        let cancelled = false;
        checkBrowserStoragePersisted().then(result => {
            if (!cancelled) setStoragePersisted(result);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    const storagePersistStatus = storagePersisted === null ? null : (
        <span className={styles.storagePersistStatus}>
            {intl.formatMessage(storagePersisted ? storagePersistGrantedMessage : storagePersistNotGrantedMessage)}
        </span>
    );

    const {
        menuRef,
        isExpanded,
        handleKeyDown,
        handleKeyDownOpenMenu,
        handleOnOpen,
        handleOnClose
    } = useMenuNavigation({
        depth,
        isRtl
    });

    const saveNowMessage = (
        <FormattedMessage
            defaultMessage="Save now"
            description="Menu bar item for saving now"
            id="gui.menuBar.saveNow"
        />
    );
    const createCopyMessage = (
        <FormattedMessage
            defaultMessage="Save as a copy"
            description="Menu bar item for saving as a copy"
            id="gui.menuBar.saveAsCopy"
        />
    );
    const newProjectMessage = (
        <FormattedMessage
            defaultMessage="New"
            description="Menu bar item for creating a new project"
            id="gui.menuBar.new"
        />
    );
    const browserSavedProjectsLabel = (
        <FormattedMessage
            defaultMessage="Browser-saved projects"
            description="Menu bar section heading for projects saved in this browser"
            id="gui.menuBar.browserSavedProjects"
        />
    );
    const browserSavedSpritesLabel = (
        <FormattedMessage
            defaultMessage="Browser-saved sprites"
            description="Menu bar section heading for sprites saved in this browser"
            id="gui.menuBar.browserSavedSprites"
        />
    );
    const deleteLocalProjectLabel = intl.formatMessage(deleteBrowserSavedProjectMessage);
    const deleteLocalSpriteLabel = intl.formatMessage(deleteBrowserSavedSpriteMessage);
    const handleRestoreLocalProjectClick = useCallback(event => {
        onRestoreLocalProject(event.currentTarget.dataset.id);
    }, [onRestoreLocalProject]);
    const handleDeleteLocalProjectClick = useCallback(event => {
        // Don't also trigger the containing MenuItem's restore-on-click.
        event.stopPropagation();
        onDeleteLocalProject(event.currentTarget.dataset.id);
    }, [onDeleteLocalProject]);
    const handleRestoreLocalSpriteClick = useCallback(event => {
        onRestoreLocalSprite(event.currentTarget.dataset.id);
    }, [onRestoreLocalSprite]);
    const handleDeleteLocalSpriteClick = useCallback(event => {
        event.stopPropagation();
        onDeleteLocalSprite(event.currentTarget.dataset.id);
    }, [onDeleteLocalSprite]);

    return (
        <button
            className={classNames(styles.menuBarItem, styles.hoverable, {
                [styles.active]: isExpanded()
            })}
            onClick={handleOnOpen}
            aria-label={intl.formatMessage(fileMenu)}
            aria-expanded={isExpanded()}
            ref={menuRef}
            onKeyDown={handleKeyDown}
        >
            <img src={fileIcon} />
            <span className={styles.collapsibleLabel}>
                <FormattedMessage
                    defaultMessage="File"
                    description="Text for file dropdown menu"
                    id="gui.menuBar.file"
                />
            </span>
            <img src={dropdownCaret} />
            <MenuBarMenu
                className={classNames(styles.menuBarMenu)}
                open={isExpanded()}
                place={isRtl ? 'left' : 'right'}
                onRequestClose={handleOnClose}
            >
                <MenuSection>
                    <MenuItem
                        onClick={onClickNew}
                        isDataMenuItem
                        onParentKeyDown={handleKeyDownOpenMenu}
                    >
                        {newProjectMessage}
                    </MenuItem>
                </MenuSection>
                {(canSave || canCreateCopy || canRemix) && (
                    <MenuSection>
                        {canSave && (
                            <MenuItem
                                onClick={onClickSave}
                                isDataMenuItem
                                onParentKeyDown={handleKeyDownOpenMenu}
                            >
                                {saveNowMessage}
                            </MenuItem>
                        )}
                        {canCreateCopy && (
                            <MenuItem
                                onClick={onClickSaveAsCopy}
                                isDataMenuItem
                                onParentKeyDown={handleKeyDownOpenMenu}
                            >
                                {createCopyMessage}
                            </MenuItem>
                        )}
                        {canRemix && (
                            <MenuItem
                                onClick={onClickRemix}
                                isDataMenuItem
                                onParentKeyDown={handleKeyDownOpenMenu}
                            >
                                {remixMessage}
                            </MenuItem>
                        )}
                    </MenuSection>
                )}
                <MenuSection>
                    <MenuItem
                        onClick={onStartSelectingFileUpload}
                        isDataMenuItem
                        onParentKeyDown={handleKeyDownOpenMenu}
                    >
                        {intl.formatMessage(sharedMessages.loadFromComputerTitle)}
                    </MenuItem>
                    <SB3Downloader>{(className, downloadProjectCallback) => (
                        <MenuItem
                            className={className}
                            onClick={getSaveToComputerHandler(downloadProjectCallback)}
                            isDataMenuItem
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <FormattedMessage
                                defaultMessage="Save to your computer"
                                description="Menu bar item for downloading a project to your computer" // eslint-disable-line @stylistic/max-len
                                id="gui.menuBar.downloadToComputer"
                            />
                        </MenuItem>
                    )}</SB3Downloader>
                </MenuSection>
                {localProjects.length > 0 && (
                    <MenuSection>
                        <MenuItem
                            isDisabled
                            isDataMenuItem
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <span className={styles.browserSavedSectionHeading}>
                                {browserSavedProjectsLabel}
                                {storagePersistStatus}
                            </span>
                        </MenuItem>
                        {localProjects.slice(0, MAX_VISIBLE_LOCAL_PROJECTS).map(project => (
                            <MenuItem
                                key={project.id}
                                data-id={project.id}
                                onClick={handleRestoreLocalProjectClick}
                                isDataMenuItem
                                onParentKeyDown={handleKeyDownOpenMenu}
                            >
                                <span className={styles.localProjectItem}>
                                    <span className={styles.localProjectSummary}>
                                        <span className={styles.localProjectTitle}>
                                            {project.title}
                                        </span>
                                        <span className={styles.localProjectMeta}>
                                            {formatLocalProjectUpdatedAt(project.updatedAt)}
                                        </span>
                                    </span>
                                    <button
                                        className={styles.localProjectDelete}
                                        aria-label={deleteLocalProjectLabel}
                                        data-id={project.id}
                                        onClick={handleDeleteLocalProjectClick}
                                    >
                                        {'×'}
                                    </button>
                                </span>
                            </MenuItem>
                        ))}
                    </MenuSection>
                )}
                {localSprites.length > 0 && (
                    <MenuSection>
                        <MenuItem
                            isDisabled
                            isDataMenuItem
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <span className={styles.browserSavedSectionHeading}>
                                {browserSavedSpritesLabel}
                                {storagePersistStatus}
                            </span>
                        </MenuItem>
                        {localSprites.slice(0, MAX_VISIBLE_LOCAL_SPRITES).map(sprite => (
                            <MenuItem
                                key={sprite.id}
                                data-id={sprite.id}
                                onClick={handleRestoreLocalSpriteClick}
                                isDataMenuItem
                                onParentKeyDown={handleKeyDownOpenMenu}
                            >
                                <span className={styles.localProjectItem}>
                                    <span className={styles.localProjectSummary}>
                                        <span className={styles.localProjectTitle}>
                                            {sprite.name}
                                        </span>
                                        <span className={styles.localProjectMeta}>
                                            {formatLocalProjectUpdatedAt(sprite.updatedAt)}
                                        </span>
                                    </span>
                                    <button
                                        className={styles.localProjectDelete}
                                        aria-label={deleteLocalSpriteLabel}
                                        data-id={sprite.id}
                                        onClick={handleDeleteLocalSpriteClick}
                                    >
                                        {'×'}
                                    </button>
                                </span>
                            </MenuItem>
                        ))}
                    </MenuSection>
                )}
            </MenuBarMenu>
        </button>
    );
};

FileMenu.propTypes = {
    isRtl: PropTypes.bool,
    canSave: PropTypes.bool.isRequired,
    canCreateCopy: PropTypes.bool.isRequired,
    canRemix: PropTypes.bool.isRequired,
    localProjects: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        title: PropTypes.string,
        updatedAt: PropTypes.number.isRequired
    })).isRequired,
    localSprites: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string,
        updatedAt: PropTypes.number.isRequired
    })).isRequired,
    onStartSelectingFileUpload: PropTypes.func.isRequired,
    onClickSave: PropTypes.func,
    onClickSaveAsCopy: PropTypes.func,
    onClickRemix: PropTypes.func,
    onClickNew: PropTypes.func.isRequired,
    getSaveToComputerHandler: PropTypes.func.isRequired,
    onRestoreLocalProject: PropTypes.func.isRequired,
    onDeleteLocalProject: PropTypes.func.isRequired,
    onRestoreLocalSprite: PropTypes.func.isRequired,
    onDeleteLocalSprite: PropTypes.func.isRequired,
    remixMessage: PropTypes.node,
    depth: PropTypes.number
};

const mapStateToProps = state => ({
    isRtl: state.locales.isRtl,
    localProjects: state.scratchGui.localProjects.records,
    localSprites: state.scratchGui.localSprites.records
});

const mapDispatchToProps = dispatch => ({
    onClickSaveAsCopy: () => dispatch(saveProjectAsCopy()),
    onRestoreLocalProject: id => dispatch(requestRestoreLocalProject(id)),
    onDeleteLocalProject: id => dispatch(requestDeleteLocalProject(id)),
    onRestoreLocalSprite: id => dispatch(requestRestoreLocalSprite(id)),
    onDeleteLocalSprite: id => dispatch(requestDeleteLocalSprite(id))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(FileMenu);
