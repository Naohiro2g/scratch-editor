import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import log from './log';
import IndexedDBProjectStore from './indexeddb-project-store';
import {
    getOrCreateCurrentLocalProjectId,
    startNewLocalProjectId,
    continueLocalProjectId
} from './local-project-id';
import {setProjectUnchanged} from '../reducers/project-changed';
import {setProjectTitle} from '../reducers/project-title';
import {getIsLoading} from '../reducers/project-state';
import {
    updateLocalProjectsList,
    setLocalProjectsBusy,
    setLocalProjectsError,
    setLocalProjectsIdle
} from '../reducers/local-projects';

// Local autosave has no network cost, so it can debounce far more eagerly
// than the (disabled-in-this-fork) 600s server autosave interval in
// `project-saver-hoc.jsx` — this only needs to ride out a burst of rapid
// edits, not avoid hammering a server.
const AUTO_SAVE_DEBOUNCE_MS = 5000;

/**
 * Higher Order Component that autosaves the current project into
 * `IndexedDBProjectStore` (McRemote save-track entry gate) and carries out
 * restore/delete requests placed via the `local-projects` reducer.
 *
 * Restore and delete are triggered the same way `manualUpdateProject`
 * drives `ProjectSaverHOC`'s "Save now": a menu click dispatches a plain
 * "this id was requested" action, and this component's
 * `componentDidUpdate` reacts to it, rather than being called directly.
 * @param {React.Component} WrappedComponent - the component to wrap.
 * @returns {React.Component} WrappedComponent with local autosave added.
 */
const LocalProjectSaverHOC = function (WrappedComponent) {
    class LocalProjectSaverComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'saveNow'
            ]);
            this.store = new IndexedDBProjectStore();
            this._autoSaveTimeoutId = null;
            // Set just before calling vm.loadProject() for a restore, so the
            // isLoading→false transition below can tell "we just restored an
            // existing local save" apart from "a new/uploaded project
            // started", which should be given a fresh local identity.
            this._restoringLocalId = null;
        }

        componentDidMount () {
            this.refreshList();
        }

        componentDidUpdate (prevProps) {
            if (this.props.projectChanged && !prevProps.projectChanged) {
                this.scheduleAutoSave();
            }
            // A rename alone doesn't set projectChanged (see
            // project-title-input.jsx's onSubmit), so without this a saved
            // record's title could go stale after the user renames the
            // project without also editing a block. Skip the very first
            // title assignment (prevProps.reduxProjectTitle is '' before
            // TitledHOC fills in the default), which isn't a user action.
            if (prevProps.reduxProjectTitle &&
                this.props.reduxProjectTitle !== prevProps.reduxProjectTitle) {
                this.scheduleAutoSave();
            }
            if (!this.props.isLoading && prevProps.isLoading) {
                if (this._restoringLocalId) {
                    continueLocalProjectId(this._restoringLocalId);
                    this._restoringLocalId = null;
                } else {
                    startNewLocalProjectId();
                }
            }
            if (this.props.pendingRestoreId && this.props.pendingRestoreId !== prevProps.pendingRestoreId) {
                this.restoreProject(this.props.pendingRestoreId);
            }
            if (this.props.pendingDeleteId && this.props.pendingDeleteId !== prevProps.pendingDeleteId) {
                this.deleteProject(this.props.pendingDeleteId);
            }
        }

        componentWillUnmount () {
            this.clearAutoSaveTimeout();
        }

        clearAutoSaveTimeout () {
            if (this._autoSaveTimeoutId !== null) {
                clearTimeout(this._autoSaveTimeoutId);
                this._autoSaveTimeoutId = null;
            }
        }

        scheduleAutoSave () {
            this.clearAutoSaveTimeout();
            this._autoSaveTimeoutId = setTimeout(this.saveNow, AUTO_SAVE_DEBOUNCE_MS);
        }

        saveNow () {
            this.clearAutoSaveTimeout();
            if (!this.store.isAvailable()) return Promise.resolve();
            const title = this.props.reduxProjectTitle;
            const wasChanged = this.props.projectChanged;
            // A failed vm.saveProjectSb3() must never reach store.put(), so a
            // mid-save serialization failure can't clobber the last
            // successfully saved snapshot on disk.
            return this.props.vm.saveProjectSb3()
                .then(sb3 => this.store.put({
                    id: getOrCreateCurrentLocalProjectId(),
                    title,
                    updatedAt: Date.now(),
                    sb3,
                    thumbnail: null
                }))
                .then(() => {
                    if (wasChanged) this.props.onSetProjectUnchanged();
                    return this.refreshList();
                })
                .catch(err => {
                    log.warn('Local project autosave failed', err);
                    this.props.onLocalProjectsError(err);
                });
        }

        refreshList () {
            if (!this.store.isAvailable()) return Promise.resolve();
            return this.store.list()
                .then(({records, corruptIds}) => {
                    const metadata = records.map(({id, title, updatedAt, thumbnail}) => (
                        {id, title, updatedAt, thumbnail}
                    ));
                    this.props.onUpdateLocalProjectsList(metadata, corruptIds);
                })
                .catch(err => {
                    log.warn('Listing local projects failed', err);
                    this.props.onLocalProjectsError(err);
                });
        }

        restoreProject (id) {
            this.props.onLocalProjectsBusy();
            return this.store.get(id)
                .then(record => {
                    if (!record) {
                        throw new Error(`Local project ${id} is missing or damaged`);
                    }
                    return record.sb3.arrayBuffer()
                        .then(buffer => {
                            this._restoringLocalId = id;
                            return this.props.vm.loadProject(buffer);
                        })
                        .then(() => {
                            this.props.onSetProjectTitle(record.title);
                            this.props.onSetProjectUnchanged();
                            this.props.onLocalProjectsIdle();
                        });
                })
                .catch(err => {
                    this._restoringLocalId = null;
                    log.warn('Restoring local project failed', err);
                    this.props.onLocalProjectsError(err);
                });
        }

        deleteProject (id) {
            this.props.onLocalProjectsBusy();
            return this.store.remove(id)
                .then(() => {
                    if (id === getOrCreateCurrentLocalProjectId()) {
                        startNewLocalProjectId();
                    }
                    return this.refreshList();
                })
                .catch(err => {
                    log.warn('Deleting local project failed', err);
                    this.props.onLocalProjectsError(err);
                });
        }

        render () {
            const {
                isLoading,
                pendingDeleteId,
                pendingRestoreId,
                projectChanged,
                onLocalProjectsBusy,
                onLocalProjectsError,
                onLocalProjectsIdle,
                onSetProjectTitle,
                onSetProjectUnchanged,
                onUpdateLocalProjectsList,
                reduxProjectTitle,
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent {...componentProps} />
            );
        }
    }

    LocalProjectSaverComponent.propTypes = {
        isLoading: PropTypes.bool,
        onLocalProjectsBusy: PropTypes.func.isRequired,
        onLocalProjectsError: PropTypes.func.isRequired,
        onLocalProjectsIdle: PropTypes.func.isRequired,
        onSetProjectTitle: PropTypes.func.isRequired,
        onSetProjectUnchanged: PropTypes.func.isRequired,
        onUpdateLocalProjectsList: PropTypes.func.isRequired,
        pendingDeleteId: PropTypes.string,
        pendingRestoreId: PropTypes.string,
        projectChanged: PropTypes.bool,
        reduxProjectTitle: PropTypes.string,
        vm: PropTypes.instanceOf(VM).isRequired
    };

    const mapStateToProps = state => ({
        isLoading: getIsLoading(state.scratchGui.projectState.loadingState),
        pendingDeleteId: state.scratchGui.localProjects.pendingDeleteId,
        pendingRestoreId: state.scratchGui.localProjects.pendingRestoreId,
        projectChanged: state.scratchGui.projectChanged,
        reduxProjectTitle: state.scratchGui.projectTitle,
        vm: state.scratchGui.vm
    });
    const mapDispatchToProps = dispatch => ({
        onLocalProjectsBusy: () => dispatch(setLocalProjectsBusy()),
        onLocalProjectsError: error => dispatch(setLocalProjectsError(error)),
        onLocalProjectsIdle: () => dispatch(setLocalProjectsIdle()),
        onSetProjectTitle: title => dispatch(setProjectTitle(title)),
        onSetProjectUnchanged: () => dispatch(setProjectUnchanged()),
        onUpdateLocalProjectsList: (records, corruptIds) => dispatch(updateLocalProjectsList(records, corruptIds))
    });
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );
    return connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(LocalProjectSaverComponent);
};

export {
    LocalProjectSaverHOC as default
};
