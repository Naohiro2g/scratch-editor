import React from 'react';
import '@testing-library/jest-dom';
import {fireEvent, screen} from '@testing-library/react';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import McRemoteBlockPicker from '../../../src/components/mcremote-block-picker/mcremote-block-picker';
import mcremoteMessages from '../../../src/lib/mcremote-l10n';

const catalogState = {
    status: 'current',
    mcVersion: '1.21.11',
    catalogHash: '1234567890abcdef',
    source: 'network',
    catalog: {
        block: {
            'examplemod:ruby_block': {
                states: {},
                default_state: {}
            },
            'minecraft:gold_block': {
                states: {},
                default_state: {}
            },
            'minecraft:oak_log': {
                states: {axis: ['x', 'y', 'z']},
                default_state: {axis: 'y'}
            },
            'minecraft:repeater': {
                states: {facing: ['north', 'east'], powered: [false, true]},
                default_state: {facing: 'north', powered: false}
            }
        }
    }
};

describe('McRemoteBlockPicker', () => {
    const store = configureStore()({locales: {isRtl: false}});
    const renderPicker = (picker, options) => renderWithIntl(
        <Provider store={store}>{picker}</Provider>, options
    );

    test('shows catalog provenance and emits short vanilla input with explicit state only', () => {
        const onApply = jest.fn();
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={catalogState}
                initialBlockId="stone"
                initialStateText=""
                onApply={onApply}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByRole('status')).toHaveTextContent('CURRENT — 1.21.11 · NETWORK · 12345678');
        expect(screen.getByRole('button', {name: 'oak_log Oak Log'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'examplemod:ruby_block'})).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'oak_log Oak Log'}));
        expect(screen.getByLabelText('Block ID')).toHaveValue('oak_log');
        expect(screen.getByLabelText('State')).toHaveValue('');
        expect(screen.getByRole('option', {name: 'Minecraft default (y)'})).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('axis'), {target: {value: '2'}});
        expect(screen.getByLabelText('State')).toHaveValue('axis=z');
        fireEvent.change(screen.getByLabelText('axis'), {target: {value: ''}});
        expect(screen.getByLabelText('State')).toHaveValue('');
        fireEvent.change(screen.getByLabelText('axis'), {target: {value: '2'}});

        fireEvent.click(screen.getByRole('button', {name: 'Use these values'}));
        expect(onApply).toHaveBeenCalledWith('oak_log', 'axis=z');
    });

    test.each(['ja', 'ja-Hira'])('shows Japanese and English names in %s and applies only the ID', locale => {
        const onApply = jest.fn();
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={catalogState}
                initialBlockId="stone"
                initialStateText=""
                onApply={onApply}
                onCancel={jest.fn()}
            />,
            {locale, messages: mcremoteMessages[locale]}
        );

        const gold = screen.getByRole('button', {name: /^gold_block /});
        expect(gold).toHaveTextContent('gold_block 金ブロック');
        expect(gold).toHaveTextContent('Block of Gold');
        expect(screen.queryByRole('button', {name: /^stone /})).not.toBeInTheDocument();
        fireEvent.click(gold);
        expect(screen.getByLabelText('ブロックID')).toHaveValue('gold_block');
        fireEvent.click(screen.getByRole('button', {name: mcremoteMessages[locale]['gui.mcremote.blockPicker.apply']}));
        expect(onApply).toHaveBeenCalledWith('gold_block', '');
    });

    test('counts block choices rather than the lines used to show their names', () => {
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={catalogState}
                initialBlockId=""
                initialStateText=""
                onApply={jest.fn()}
                onCancel={jest.fn()}
            />,
            {locale: 'ja', messages: mcremoteMessages.ja}
        );

        expect(screen.getByText('4件')).toBeInTheDocument();
        fireEvent.change(screen.getByRole('textbox', {name: /ブロックID・/}), {target: {value: 'gold'}});
        expect(screen.getByText('1件')).toBeInTheDocument();
        expect(screen.getAllByRole('button', {name: /^gold_block /})).toHaveLength(1);
        fireEvent.change(screen.getByRole('textbox', {name: /ブロックID・/}), {target: {value: 'gold 木'}});
        expect(screen.getByText('0件')).toBeInTheDocument();
    });

    test.each([
        '金ブロック',
        'block OF gold',
        'minecraft:gold_block',
        '  GOLD\u3000金ブロック  ',
        'ｇｏｌｄ 金ブロック'
    ])('searches Japanese names, English names and IDs with AND terms: %s', query => {
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={catalogState}
                initialBlockId=""
                initialStateText=""
                onApply={jest.fn()}
                onCancel={jest.fn()}
            />
        );

        fireEvent.change(screen.getByRole('textbox', {name: /Search/}), {target: {value: query}});
        expect(screen.getByRole('button', {name: 'gold_block Block of Gold'})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'oak_log Oak Log'})).not.toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'examplemod:ruby_block'})).not.toBeInTheDocument();
        fireEvent.change(screen.getByRole('textbox', {name: /Search/}), {target: {value: 'gold 木'}});
        expect(screen.queryByRole('button', {name: 'gold_block Block of Gold'})).not.toBeInTheDocument();
    });

    test('keeps IDs searchable when the Minecraft version has no bundled names', () => {
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={Object.assign({}, catalogState, {mcVersion: 'future-version'})}
                initialBlockId=""
                initialStateText=""
                onApply={jest.fn()}
                onCancel={jest.fn()}
            />
        );

        fireEvent.change(screen.getByRole('textbox', {name: /Search/}), {target: {value: 'minecraft:gold_block'}});
        expect(screen.getByRole('button', {name: 'gold_block'})).toBeInTheDocument();
        expect(screen.queryByText('金ブロック')).not.toBeInTheDocument();
        expect(screen.queryByText('Block of Gold')).not.toBeInTheDocument();
    });

    test('canonicalizes valid StateText and clears state when the block ID changes', () => {
        const onApply = jest.fn();
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={catalogState}
                initialBlockId="repeater"
                initialStateText="powered=true,facing=east"
                onApply={onApply}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByLabelText('State')).toHaveValue('facing=east,powered=true');
        fireEvent.change(screen.getByLabelText('Block ID'), {target: {value: 'examplemod:ruby_block'}});
        expect(screen.getByLabelText('State')).toHaveValue('');
        fireEvent.click(screen.getByRole('button', {name: 'Use these values'}));
        expect(onApply).toHaveBeenCalledWith('examplemod:ruby_block', '');
    });

    test('keeps free text usable with no acquired catalog', () => {
        const onApply = jest.fn();
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={{status: 'not_acquired', catalog: null}}
                initialBlockId="stone"
                initialStateText=""
                onApply={onApply}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByRole('alert')).toHaveTextContent('NOT ACQUIRED');
        expect(screen.getByText(/No catalog block is available/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Block ID'), {
            target: {value: 'futuremod:new_block'}
        });
        fireEvent.change(screen.getByLabelText('State'), {target: {value: 'mode=demo'}});
        fireEvent.click(screen.getByRole('button', {name: 'Use these values'}));
        expect(onApply).toHaveBeenCalledWith('futuremod:new_block', 'mode=demo');
    });

    test('does not expose stale catalog data when status is unavailable', () => {
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={Object.assign({}, catalogState, {status: 'unavailable'})}
                initialBlockId="oak_log"
                initialStateText="axis=z"
                onApply={jest.fn()}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByRole('alert')).toHaveTextContent('UNAVAILABLE');
        expect(screen.queryByRole('button', {name: /^oak_log/})).not.toBeInTheDocument();
        expect(screen.getByLabelText('State')).toHaveValue('axis=z');
    });

    test('does not permit the picker to replace a connected reporter', () => {
        renderPicker(
            <McRemoteBlockPicker
                canApply={false}
                catalogState={catalogState}
                initialBlockId=""
                initialStateText=""
                onApply={jest.fn()}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByText(/will not replace it/)).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Use these values'})).toBeDisabled();
    });
});
