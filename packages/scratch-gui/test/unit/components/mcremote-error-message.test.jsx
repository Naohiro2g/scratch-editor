import React from 'react';
import {screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import messages from '../../../src/lib/mcremote-l10n';
import ErrorMessage from '../../../src/components/wire-scope-panel/mcremote-error-message';

const renderError = error => renderWithIntl(<ErrorMessage
    error={error}
    server={{name: 'mc-remote-unity-sandbox', version: '2321.3.0'}}
/>, {locale: 'ja', messages: messages.ja});

test('explains unsupported methods without guessing server identity', () => {
    renderError({code: -32601, method: 'player.setPos', message: 'Method not found'});
    expect(screen.getByText(/Unity箱庭.*使えません/)).toBeInTheDocument();
    expect(screen.getByText(/プレイヤーを移動する/)).toBeInTheDocument();
    expect(screen.getByText('player.setPos')).toBeInTheDocument();
});

test('shows requested and maximum block counts', () => {
    renderError({reason: 'block_count_limit_exceeded', data: {limit: 32768, requested: 40000}});
    expect(screen.getByText(/40,000.*32,768/)).toBeInTheDocument();
});

test('explains height bounds with the offending absolute point', () => {
    renderError({reason: 'out_of_bounds',
        data: {bounds: {y_min: -64, y_max: 319},
            violating: {x: 10, y: 320, z: 10}}});
    expect(screen.getByText(/320.*−?64.*319/)).toBeInTheDocument();
    expect(screen.getByText(/絶対座標/)).toBeInTheDocument();
});

test('keeps fractional build-range coordinates', () => {
    renderError({reason: 'build_range_exceeded',
        data: {bounds: {center: {x: 200, z: 200}, build_range: 50},
            violating: {x: 251.5, y: 64, z: 200}}});
    expect(screen.getByText(/251.5/, {selector: 'p'})).toBeInTheDocument();
    expect(screen.getByText(/±50/)).toBeInTheDocument();
});
