import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import log from './log';
import IndexedDBSpriteStore from './indexeddb-sprite-store';
import {
    updateLocalSpritesList,
    setLocalSpritesBusy,
    setLocalSpritesError,
    setLocalSpritesIdle
} from '../reducers/local-sprites';

/**
 * Higher Order Component that saves/restores/deletes browser-saved sprites
 * (b6 slice, reusing the entry gate's IndexedDB foundation — see
 * `local-project-saver-hoc.jsx`). Unlike whole-project autosave, sprite
 * saves are always an explicit user action (the sprite context menu's
 * "Save to browser"), so this component has no autosave timer: it only
 * reacts to `pendingSaveTargetId`/`pendingRestoreId`/`pendingDeleteId`
 * placed on `local-sprites` state, the same menu-action pattern
 * `local-project-saver-hoc.jsx` uses for restore/delete.
 * @param {React.Component} WrappedComponent - the component to wrap.
 * @returns {React.Component} WrappedComponent with browser-saved-sprite handling added.
 */
const LocalSpriteSaverHOC = function (WrappedComponent) {
    class LocalSpriteSaverComponent extends React.Component {
        constructor (props) {
            super(props);
            this.store = new IndexedDBSpriteStore();
        }

        componentDidMount () {
            this.refreshList();
        }

        componentDidUpdate (prevProps) {
            if (this.props.pendingSaveTargetId && this.props.pendingSaveTargetId !== prevProps.pendingSaveTargetId) {
                this.saveSprite(this.props.pendingSaveTargetId);
            }
            if (this.props.pendingRestoreId && this.props.pendingRestoreId !== prevProps.pendingRestoreId) {
                this.restoreSprite(this.props.pendingRestoreId);
            }
            if (this.props.pendingDeleteId && this.props.pendingDeleteId !== prevProps.pendingDeleteId) {
                this.deleteSprite(this.props.pendingDeleteId);
            }
        }

        refreshList () {
            if (!this.store.isAvailable()) return Promise.resolve();
            return this.store.list()
                .then(({records, corruptIds}) => {
                    const metadata = records.map(({id, name, updatedAt, thumbnail}) => (
                        {id, name, updatedAt, thumbnail}
                    ));
                    this.props.onUpdateLocalSpritesList(metadata, corruptIds);
                })
                .catch(err => {
                    log.warn('Listing local sprites failed', err);
                    this.props.onLocalSpritesError(err);
                });
        }

        saveSprite (targetId) {
            this.props.onLocalSpritesBusy();
            const target = this.props.vm.runtime.getTargetById(targetId);
            if (!target) {
                // The sprite may have been deleted between the context-menu
                // click and this render; nothing to save.
                this.props.onLocalSpritesIdle();
                return Promise.resolve();
            }
            const name = target.getName();
            // A failed vm.exportSprite() must never reach store.put(), so a
            // mid-save serialization failure can't clobber the last
            // successfully saved snapshot on disk.
            return this.props.vm.exportSprite(targetId)
                .then(sprite3 => this.store.put({
                    id: `local-sprite-${targetId}-${Date.now()}`,
                    name,
                    updatedAt: Date.now(),
                    sprite3,
                    thumbnail: null
                }))
                .then(() => this.refreshList())
                .catch(err => {
                    log.warn('Saving sprite to the browser failed', err);
                    this.props.onLocalSpritesError(err);
                });
        }

        restoreSprite (id) {
            this.props.onLocalSpritesBusy();
            return this.store.get(id)
                .then(record => {
                    if (!record) {
                        throw new Error(`Local sprite ${id} is missing or damaged`);
                    }
                    return record.sprite3.arrayBuffer()
                        .then(buffer => this.props.vm.addSprite(buffer))
                        .then(() => this.props.onLocalSpritesIdle());
                })
                .catch(err => {
                    log.warn('Restoring local sprite failed', err);
                    this.props.onLocalSpritesError(err);
                });
        }

        deleteSprite (id) {
            this.props.onLocalSpritesBusy();
            return this.store.remove(id)
                .then(() => this.refreshList())
                .catch(err => {
                    log.warn('Deleting local sprite failed', err);
                    this.props.onLocalSpritesError(err);
                });
        }

        render () {
            const {
                pendingDeleteId,
                pendingRestoreId,
                pendingSaveTargetId,
                onLocalSpritesBusy,
                onLocalSpritesError,
                onLocalSpritesIdle,
                onUpdateLocalSpritesList,
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent {...componentProps} />
            );
        }
    }

    LocalSpriteSaverComponent.propTypes = {
        onLocalSpritesBusy: PropTypes.func.isRequired,
        onLocalSpritesError: PropTypes.func.isRequired,
        onLocalSpritesIdle: PropTypes.func.isRequired,
        onUpdateLocalSpritesList: PropTypes.func.isRequired,
        pendingDeleteId: PropTypes.string,
        pendingRestoreId: PropTypes.string,
        pendingSaveTargetId: PropTypes.string,
        vm: PropTypes.instanceOf(VM).isRequired
    };

    const mapStateToProps = state => ({
        pendingDeleteId: state.scratchGui.localSprites.pendingDeleteId,
        pendingRestoreId: state.scratchGui.localSprites.pendingRestoreId,
        pendingSaveTargetId: state.scratchGui.localSprites.pendingSaveTargetId,
        vm: state.scratchGui.vm
    });
    const mapDispatchToProps = dispatch => ({
        onLocalSpritesBusy: () => dispatch(setLocalSpritesBusy()),
        onLocalSpritesError: error => dispatch(setLocalSpritesError(error)),
        onLocalSpritesIdle: () => dispatch(setLocalSpritesIdle()),
        onUpdateLocalSpritesList: (records, corruptIds) => dispatch(updateLocalSpritesList(records, corruptIds))
    });
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );
    return connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(LocalSpriteSaverComponent);
};

export {
    LocalSpriteSaverHOC as default
};
