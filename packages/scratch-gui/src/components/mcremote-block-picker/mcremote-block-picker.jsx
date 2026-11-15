import classNames from 'classnames';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useCallback, useMemo, useState} from 'react';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import {getBlockNames, searchBlockIds} from '../../lib/mcremote-block-names';
import {
    buildStateText,
    catalogBlockId,
    findCatalogSelection,
    pickerBlockId,
    stateValueText
} from '../../lib/mcremote-block-ref';

import styles from './mcremote-block-picker.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Catalog picker',
        description: 'Title of the McRemote block picker',
        id: 'gui.mcremote.blockPicker.title'
    },
    search: {
        defaultMessage: 'Search by block ID, name or category',
        description: 'Search field in the McRemote block picker',
        id: 'gui.mcremote.blockPicker.search'
    },
    searchLabel: {
        defaultMessage: 'Search blocks',
        description: 'Visible label for the catalog search',
        id: 'gui.mcremote.blockPicker.searchLabel'
    },
    notAcquired: {
        defaultMessage: 'The catalog has not been acquired, so search is unavailable. ' +
            'You can enter a block ID and state below to write Scratch code.',
        description: 'Guidance before acquiring a catalog',
        id: 'gui.mcremote.blockPicker.notAcquired'
    },
    unavailable: {
        defaultMessage: 'The catalog could not be acquired, so search is unavailable. ' +
            'You can enter a block ID and state below to write Scratch code.',
        description: 'Guidance when catalog acquisition fails',
        id: 'gui.mcremote.blockPicker.unavailable'
    },
    minecraftDefaultValue: {
        defaultMessage: '{value} (default)',
        description: 'State value marked as the default and omitted from the packed state',
        id: 'gui.mcremote.blockPicker.minecraftDefaultValue'
    }
});

const omitDefaultStates = (states, entry) => Object.fromEntries(
    Object.entries(states).filter(([property, value]) => value !== entry.default_state[property])
);

const McRemoteBlockPicker = ({
    catalogState,
    initialBlockId,
    initialStateText,
    canApply,
    onApply,
    onCancel
}) => {
    const intl = useIntl();
    const isJapanese = /^ja(?:-|$)/i.test(intl.locale);
    const hasCurrentCatalog = catalogState.status === 'current';
    const blockCatalog = hasCurrentCatalog && catalogState.catalog && catalogState.catalog.block ?
        catalogState.catalog.block :
        {};
    const initialSelection = findCatalogSelection(initialBlockId, initialStateText, blockCatalog);
    const initialStates = initialSelection ?
        omitDefaultStates(initialSelection.selectedStates, blockCatalog[initialSelection.id]) : {};
    const [blockIdDraft, setBlockIdDraft] = useState(initialBlockId);
    const [stateDraft, setStateDraft] = useState(
        initialSelection ? buildStateText(initialStates) : initialStateText
    );
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(initialSelection ? initialSelection.id : null);
    const [selectedStates, setSelectedStates] = useState(initialStates);
    const blockIds = useMemo(() => Object.keys(blockCatalog).sort(), [blockCatalog]);
    const visibleBlockIds = useMemo(() =>
        searchBlockIds(blockIds, catalogState.mcVersion, search),
    [blockIds, catalogState.mcVersion, search]);
    const selectedEntry = selectedId ? blockCatalog[selectedId] : null;

    const selectBlock = useCallback(id => {
        setSelectedId(id);
        setSelectedStates({});
        setBlockIdDraft(pickerBlockId(id));
        setStateDraft('');
    }, []);
    const selectState = useCallback((property, indexText) => {
        const nextStates = Object.assign({}, selectedStates);
        if (indexText === '') {
            delete nextStates[property];
        } else {
            nextStates[property] = selectedEntry.states[property][Number(indexText)];
        }
        setSelectedStates(nextStates);
        setStateDraft(buildStateText(nextStates));
    }, [selectedEntry, selectedStates]);
    const handleBlockIdDraftChange = useCallback(event => {
        const value = event.target.value;
        setBlockIdDraft(value);
        if (!selectedId || catalogBlockId(value.trim()) !== selectedId) {
            setSelectedId(null);
            setSelectedStates({});
            setStateDraft('');
        }
    }, [selectedId]);
    const handleStateDraftChange = useCallback(event => {
        const value = event.target.value;
        const selection = findCatalogSelection(blockIdDraft, value, blockCatalog);
        if (selection) {
            const states = omitDefaultStates(selection.selectedStates, blockCatalog[selection.id]);
            setStateDraft(buildStateText(states));
            setSelectedId(selection.id);
            setSelectedStates(states);
            return;
        }
        setStateDraft(value);
        const currentId = catalogBlockId(blockIdDraft.trim());
        setSelectedId(blockCatalog[currentId] ? currentId : null);
        setSelectedStates({});
    }, [blockCatalog, blockIdDraft]);
    const handleSearchChange = useCallback(event => setSearch(event.target.value), []);
    const handleBlockClick = useCallback(event => {
        selectBlock(event.currentTarget.dataset.blockId);
    }, [selectBlock]);
    const handleStateChange = useCallback(event => {
        selectState(event.currentTarget.dataset.property, event.target.value);
    }, [selectState]);
    const handleApply = useCallback(() => {
        const selection = findCatalogSelection(blockIdDraft, stateDraft, blockCatalog);
        onApply(blockIdDraft, selection ?
            buildStateText(omitDefaultStates(selection.selectedStates, blockCatalog[selection.id])) : stateDraft);
    }, [blockCatalog, blockIdDraft, onApply, stateDraft]);

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
            headerClassName={styles.modalHeader}
            id="mcremoteBlockPicker"
            onRequestClose={onCancel}
        >
            <Box className={styles.body}>
                <div className={styles.scrollArea}>
                    {canApply ? null : (
                        <div className={styles.warning}>
                            <FormattedMessage
                                defaultMessage={'A reporter or variable is connected. ' +
                                'The picker will not replace it; disconnect both inputs to insert literal values.'}
                                description="Warning when a reporter occupies a block picker input"
                                id="gui.mcremote.blockPicker.reporterConnected"
                            />
                        </div>
                    )}
                    <div className={styles.introRow}>
                        <p className={styles.description}>
                            <FormattedMessage
                                defaultMessage="Choose a Minecraft block from the catalog and configure its state."
                                description="Description below the catalog picker title"
                                id="gui.mcremote.blockPicker.description"
                            />
                        </p>
                        <section className={styles.catalogColumn}>
                            <span>
                                <FormattedMessage
                                    defaultMessage="Catalog:"
                                    description="Compact label before catalog status"
                                    id="gui.mcremote.blockPicker.catalogStatus"
                                />
                            </span>
                            <div
                                className={classNames(styles.status, {[styles.warning]: !hasCurrentCatalog})}
                                role={hasCurrentCatalog ? 'status' : 'alert'}
                            >
                                {status}
                            </div>
                        </section>
                    </div>
                    <div className={styles.pickerGrid}>
                        <section className={styles.blockColumn}>
                            <label
                                className={styles.sectionHeading}
                                htmlFor="mcremote-block-picker-search"
                            >
                                {intl.formatMessage(messages.searchLabel)}
                            </label>
                            <div className={styles.searchRow}>
                                <input
                                    autoFocus
                                    id="mcremote-block-picker-search"
                                    className={styles.searchInput}
                                    placeholder={intl.formatMessage(messages.search)}
                                    value={search}
                                    onChange={handleSearchChange}
                                />
                                {hasCurrentCatalog ? (
                                    <div
                                        aria-live="polite"
                                        className={styles.resultCount}
                                    >
                                        <FormattedMessage
                                            defaultMessage="{count, plural, one {# block} other {# blocks}}"
                                            description="Number of block choices matching the McRemote picker search"
                                            id="gui.mcremote.blockPicker.resultCount"
                                            values={{count: visibleBlockIds.length}}
                                        />
                                    </div>
                                ) : null}
                            </div>
                            <div className={styles.blockList}>
                                {visibleBlockIds.map(id => {
                                    const names = getBlockNames(catalogState.mcVersion, id);
                                    const name = names && (isJapanese ? names.ja || names.en : names.en);
                                    return (
                                        <button
                                            className={selectedId === id ? styles.selectedBlock : styles.blockButton}
                                            data-block-id={id}
                                            key={id}
                                            type="button"
                                            onClick={handleBlockClick}
                                        >
                                            <span className={styles.blockLabel}>
                                                <span className={styles.blockId}>{pickerBlockId(id)}</span>
                                                {name ? ` ${name}` : null}
                                            </span>
                                            {isJapanese && names && names.en ? (
                                                <span className={styles.englishName}>{names.en}</span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                                {visibleBlockIds.length === 0 ? (
                                    <div className={styles.emptyList}>
                                        {blockIds.length > 0 ? (
                                            <FormattedMessage
                                                defaultMessage="No blocks match your search."
                                                description="No matching blocks in the McRemote block picker"
                                                id="gui.mcremote.blockPicker.noMatches"
                                            />
                                        ) : hasCurrentCatalog ? (
                                            <FormattedMessage
                                                defaultMessage={'No catalog block is available. ' +
                                                'You can still enter a block ID and state below.'}
                                                description="Empty McRemote catalog picker list"
                                                id="gui.mcremote.blockPicker.empty"
                                            />
                                        ) : (
                                            intl.formatMessage(catalogState.status === 'unavailable' ?
                                                messages.unavailable : messages.notAcquired)
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        </section>
                        <section className={styles.stateColumn}>
                            <h3>
                                <FormattedMessage
                                    defaultMessage="Configure block state"
                                    description="Heading for McRemote block state choices"
                                    id="gui.mcremote.blockPicker.stateHeading"
                                />
                            </h3>
                            <p className={styles.defaultExplanation}>
                                <FormattedMessage
                                    defaultMessage={'Default values are omitted from the state. ' +
                                    'The block and state at the placement position are overwritten.'}
                                    description="Explanation of omitted state in the McRemote block picker"
                                    id="gui.mcremote.blockPicker.defaultExplanation"
                                />
                            </p>
                            {selectedEntry && Object.keys(selectedEntry.states)
                                .sort()
                                .map(property => {
                                    const selectedValue = selectedStates[property];
                                    const selectedIndex = typeof selectedValue === 'undefined' ? '' :
                                        String(selectedEntry.states[property]
                                            .findIndex(value => value === selectedValue));
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
                                                {selectedEntry.states[property].map((value, index) => {
                                                    const isDefault = value === selectedEntry.default_state[property];
                                                    return (
                                                        <option
                                                            key={`${typeof value}:${stateValueText(value)}`}
                                                            value={isDefault ? '' : index}
                                                        >
                                                            {isDefault ?
                                                                intl.formatMessage(messages.minecraftDefaultValue, {
                                                                    value: stateValueText(value)
                                                                }) : stateValueText(value)}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </label>
                                    );
                                })}
                        </section>
                    </div>
                    <div className={styles.selectionResult}>
                        <label className={styles.outputLabel}>
                            <FormattedMessage
                                defaultMessage="Block ID"
                                description="Label for the editable McRemote block ID"
                                id="gui.mcremote.blockPicker.blockId"
                            />
                            <input
                                className={styles.outputInput}
                                value={blockIdDraft}
                                onChange={handleBlockIdDraftChange}
                            />
                        </label>
                        <label className={styles.outputLabel}>
                            <FormattedMessage
                                defaultMessage="Block state"
                                description="Label for the editable McRemote StateText"
                                id="gui.mcremote.blockPicker.stateText"
                            />
                            <input
                                className={styles.outputInput}
                                value={stateDraft}
                                onChange={handleStateDraftChange}
                            />
                        </label>
                    </div>
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
                            defaultMessage="Done"
                            description="Apply the block ID and StateText in the McRemote block picker"
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
        catalog: PropTypes.shape({
            block: PropTypes.objectOf(PropTypes.shape({
                default_state: PropTypes.objectOf(PropTypes.oneOfType([
                    PropTypes.bool,
                    PropTypes.number,
                    PropTypes.string
                ])).isRequired,
                states: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.oneOfType([
                    PropTypes.bool,
                    PropTypes.number,
                    PropTypes.string
                ]))).isRequired
            }))
        }),
        catalogHash: PropTypes.string,
        mcVersion: PropTypes.string,
        source: PropTypes.string,
        status: PropTypes.string.isRequired
    }).isRequired,
    initialBlockId: PropTypes.string.isRequired,
    initialStateText: PropTypes.string.isRequired,
    onApply: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export default McRemoteBlockPicker;
