import React from 'react';
import '@testing-library/jest-dom';
import {fireEvent, screen} from '@testing-library/react';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import McRemoteBlockPicker from '../../../src/components/mcremote-block-picker/mcremote-block-picker';

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
            'minecraft:oak_log': {
                states: {axis: ['x', 'y', 'z']},
                default_state: {axis: 'y'}
            }
        }
    }
};

describe('McRemoteBlockPicker', () => {
    const store = configureStore()({locales: {isRtl: false}});
    const renderPicker = picker => renderWithIntl(<Provider store={store}>{picker}</Provider>);

    test('shows catalog provenance and emits short vanilla input with explicit state only', () => {
        const onApply = jest.fn();
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={catalogState}
                initialValue="stone"
                onApply={onApply}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByRole('status')).toHaveTextContent('CURRENT — 1.21.11 · NETWORK · 12345678');
        expect(screen.getByRole('button', {name: 'oak_log'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'examplemod:ruby_block'})).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'oak_log'}));
        expect(screen.getByLabelText('Block value')).toHaveValue('oak_log');
        fireEvent.change(screen.getByLabelText('axis'), {target: {value: '2'}});
        expect(screen.getByLabelText('Block value')).toHaveValue('oak_log[axis=z]');

        fireEvent.click(screen.getByRole('button', {name: 'Use this value'}));
        expect(onApply).toHaveBeenCalledWith('oak_log[axis=z]');
    });

    test('keeps free text usable with no acquired catalog', () => {
        const onApply = jest.fn();
        renderPicker(
            <McRemoteBlockPicker
                canApply
                catalogState={{status: 'not_acquired', catalog: null}}
                initialValue="stone"
                onApply={onApply}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByRole('alert')).toHaveTextContent('NOT ACQUIRED');
        expect(screen.getByText(/No catalog block is available/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Block value'), {
            target: {value: 'futuremod:new_block[mode=demo]'}
        });
        fireEvent.click(screen.getByRole('button', {name: 'Use this value'}));
        expect(onApply).toHaveBeenCalledWith('futuremod:new_block[mode=demo]');
    });

    test('does not permit the picker to replace a connected reporter', () => {
        renderPicker(
            <McRemoteBlockPicker
                canApply={false}
                catalogState={catalogState}
                initialValue=""
                onApply={jest.fn()}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByText(/will not replace it/)).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Use this value'})).toBeDisabled();
    });
});
