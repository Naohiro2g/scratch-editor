import classNames from 'classnames';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useCallback, useMemo, useState} from 'react';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import {
    buildBlockRef,
    findCatalogSelection,
    pickerBlockId,
    stateValueText
} from '../../lib/mcremote-block-ref';

import styles from './mcremote-block-picker.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Choose a Minecraft block',
        description: 'Title of the McRemote block picker',
        id: 'gui.mcremote.blockPicker.title'
    },
    search: {
        defaultMessage: 'Search blocks',
        description: 'Search field in the McRemote block picker',
        id: 'gui.mcremote.blockPicker.search'
    },
    minecraftDefault: {
        defaultMessage: 'Minecraft default',
        description: 'Option to omit a state property in the McRemote block picker',
        id: 'gui.mcremote.blockPicker.minecraftDefault'
    }
});

const McRemoteBlockPicker = ({catalogState, initialValue, canApply, onApply, onCancel}) => {
    const intl = useIntl();
    const blockCatalog = catalogState.catalog && catalogState.catalog.block ? catalogState.catalog.block : {};
    const initialSelection = findCatalogSelection(initialValue, blockCatalog);
    const [draft, setDraft] = useState(initialValue);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(initialSelection ? initialSelection.id : null);
    const [selectedStates, setSelectedStates] = useState(
        initialSelection ? initialSelection.selectedStates : {}
    );
    const blockIds = useMemo(() => Object.keys(blockCatalog).sort(), [blockCatalog]);
    const visibleBlockIds = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return blockIds;
        return blockIds.filter(id => id.toLowerCase().includes(query));
    }, [blockIds, search]);
    const selectedEntry = selectedId ? blockCatalog[selectedId] : null;
    const hasCurrentCatalog = catalogState.status === 'current';

    const selectBlock = useCallback(id => {
        setSelectedId(id);
        setSelectedStates({});
        setDraft(pickerBlockId(id));
    }, []);
    const selectState = useCallback((property, indexText) => {
        const nextStates = Object.assign({}, selectedStates);
        if (indexText === '') {
            delete nextStates[property];
        } else {
            nextStates[property] = selectedEntry.states[property][Number(indexText)];
        }
        setSelectedStates(nextStates);
        setDraft(buildBlockRef(selectedId, Object.assign({}, nextStates, {
            [property]: indexText === '' ? null : nextStates[property]
        })));
    }, [selectedEntry, selectedId, selectedStates]);
    const handleDraftChange = useCallback(event => setDraft(event.target.value), []);
    const handleSearchChange = useCallback(event => setSearch(event.target.value), []);
    const handleBlockClick = useCallback(event => {
        selectBlock(event.currentTarget.dataset.blockId);
    }, [selectBlock]);
    const handleStateChange = useCallback(event => {
        selectState(event.currentTarget.dataset.property, event.target.value);
    }, [selectState]);
    const handleApply = useCallback(() => onApply(draft), [draft, onApply]);

    let status;
    if (catalogState.status === 'current') {
        status = (
            <FormattedMessage
                defaultMessage="CURRENT — {version} · {source} · {hash}"
                description="Current McRemote catalog status in the block picker"
                id="gui.mcremote.blockPicker.statusCurrent"
                values={{
                    version: catalogState.mcVersion,
                    source: String(catalogState.source || '').toUpperCase(),
                    hash: String(catalogState.catalogHash || '').slice(0, 8)
                }}
            />
        );
    } else if (catalogState.status === 'unavailable') {
        status = (
            <FormattedMessage
                defaultMessage="UNAVAILABLE — The catalog could not be obtained from this connection."
                description="Unavailable McRemote catalog status in the block picker"
                id="gui.mcremote.blockPicker.statusUnavailable"
            />
        );
    } else {
        status = (
            <FormattedMessage
                defaultMessage="NOT ACQUIRED — Connect to Minecraft to choose a block."
                description="Not acquired McRemote catalog status in the block picker"
                id="gui.mcremote.blockPicker.statusNotAcquired"
            />
        );
    }

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            id="mcremoteBlockPicker"
            onRequestClose={onCancel}
        >
            <Box className={styles.body}>
                <div
                    className={classNames(styles.status, {[styles.warning]: !hasCurrentCatalog})}
                    role={hasCurrentCatalog ? 'status' : 'alert'}
                >
                    {status}
                </div>
                {canApply ? null : (
                    <div className={styles.warning}>
                        <FormattedMessage
                            defaultMessage={'A reporter is connected. The picker will not replace it; ' +
                                'disconnect the reporter to insert a literal value.'}
                            description="Warning when a reporter occupies the McRemote block input"
                            id="gui.mcremote.blockPicker.reporterConnected"
                        />
                    </div>
                )}
                <label className={styles.outputLabel}>
                    <FormattedMessage
                        defaultMessage="Block value"
                        description="Label for the editable McRemote block reference"
                        id="gui.mcremote.blockPicker.blockValue"
                    />
                    <input
                        className={styles.outputInput}
                        value={draft}
                        onChange={handleDraftChange}
                    />
                </label>
                <div className={styles.pickerGrid}>
                    <section className={styles.blockColumn}>
                        <input
                            aria-label={intl.formatMessage(messages.search)}
                            className={styles.searchInput}
                            placeholder={intl.formatMessage(messages.search)}
                            value={search}
                            onChange={handleSearchChange}
                        />
                        <div className={styles.blockList}>
                            {visibleBlockIds.map(id => (
                                <button
                                    className={selectedId === id ? styles.selectedBlock : styles.blockButton}
                                    data-block-id={id}
                                    key={id}
                                    type="button"
                                    onClick={handleBlockClick}
                                >
                                    {pickerBlockId(id)}
                                </button>
                            ))}
                            {visibleBlockIds.length === 0 ? (
                                <div className={styles.emptyList}>
                                    <FormattedMessage
                                        defaultMessage={'No catalog block is available. ' +
                                            'You can still type a value above.'}
                                        description="Empty McRemote catalog picker list"
                                        id="gui.mcremote.blockPicker.empty"
                                    />
                                </div>
                            ) : null}
                        </div>
                    </section>
                    <section className={styles.stateColumn}>
                        <h3>
                            <FormattedMessage
                                defaultMessage="Block state"
                                description="Heading for McRemote block state choices"
                                id="gui.mcremote.blockPicker.stateHeading"
                            />
                        </h3>
                        <p className={styles.defaultExplanation}>
                            <FormattedMessage
                                defaultMessage={'Properties left as ‘Minecraft default’ are omitted. ' +
                                    'Placing the block replaces all block data; ' +
                                    'it does not merge with the existing state.'}
                                description="Explanation of omitted state in the McRemote block picker"
                                id="gui.mcremote.blockPicker.defaultExplanation"
                            />
                        </p>
                        {selectedEntry && Object.keys(selectedEntry.states)
                            .sort()
                            .map(property => {
                                const selectedValue = selectedStates[property];
                                const selectedIndex = typeof selectedValue === 'undefined' ? '' :
                                    String(selectedEntry.states[property].findIndex(value => value === selectedValue));
                                return (
                                    <label
                                        className={styles.stateRow}
                                        key={property}
                                    >
                                        <span>{property}</span>
                                        <select
                                            data-property={property}
                                            value={selectedIndex}
                                            onChange={handleStateChange}
                                        >
                                            <option value="">
                                                {intl.formatMessage(messages.minecraftDefault)}
                                            </option>
                                            {selectedEntry.states[property].map((value, index) => (
                                                <option
                                                    key={`${typeof value}:${stateValueText(value)}`}
                                                    value={index}
                                                >
                                                    {stateValueText(value)}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                );
                            })}
                    </section>
                </div>
                <Box className={styles.buttonRow}>
                    <button onClick={onCancel}>
                        <FormattedMessage
                            defaultMessage="Cancel"
                            description="Cancel button in the McRemote block picker"
                            id="gui.mcremote.blockPicker.cancel"
                        />
                    </button>
                    <button
                        className={styles.applyButton}
                        disabled={!canApply}
                        onClick={handleApply}
                    >
                        <FormattedMessage
                            defaultMessage="Use this value"
                            description="Apply button in the McRemote block picker"
                            id="gui.mcremote.blockPicker.apply"
                        />
                    </button>
                </Box>
            </Box>
        </Modal>
    );
};

McRemoteBlockPicker.propTypes = {
    canApply: PropTypes.bool.isRequired,
    catalogState: PropTypes.shape({
        catalog: PropTypes.object,
        catalogHash: PropTypes.string,
        mcVersion: PropTypes.string,
        source: PropTypes.string,
        status: PropTypes.string.isRequired
    }).isRequired,
    initialValue: PropTypes.string.isRequired,
    onApply: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export default McRemoteBlockPicker;
