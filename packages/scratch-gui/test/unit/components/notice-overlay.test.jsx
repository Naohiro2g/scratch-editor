import React from 'react';
import '@testing-library/jest-dom';
import {screen, fireEvent} from '@testing-library/react';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import NoticeOverlay from '../../../src/components/notice-overlay/notice-overlay.jsx';
import mcremoteMessages from '../../../src/lib/mcremote-l10n';
import {HIGH_CONTRAST_MODE} from '../../../src/lib/settings/color-mode/index.js';

jest.mock('../../../src/lib/mcremote-runtime-config.js', () => ({
    getMcRemoteRuntimeConfig: jest.fn()
}));

const {getMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');

describe('NoticeOverlay', () => {
    const renderOverlay = function (notices, props = {}) {
        getMcRemoteRuntimeConfig.mockReturnValue({notices});
        return renderWithIntl(
            <NoticeOverlay {...props} />,
            {locale: 'ja', messages: mcremoteMessages.ja}
        );
    };

    afterEach(() => {
        getMcRemoteRuntimeConfig.mockReset();
    });

    test('renders nothing when there are no notices', () => {
        const {container} = renderOverlay([]);
        expect(container).toBeEmptyDOMElement();
    });

    test('starts open and shows heading, body, and an optional link', () => {
        renderOverlay([{
            heading: 'New blocks',
            body: 'player.getPos and player.setPos are here.',
            link: {href: 'https://example.com/mc-remote', label: 'Learn more'}
        }]);

        expect(screen.getByRole('button', {name: 'お知らせを閉じる'})).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('New blocks')).toBeInTheDocument();
        expect(screen.getByText('player.getPos and player.setPos are here.')).toBeInTheDocument();
        const link = screen.getByRole('link', {name: 'Learn more'});
        expect(link).toHaveAttribute('href', 'https://example.com/mc-remote');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    test('clicking the trigger toggles the panel closed and back open', () => {
        renderOverlay([{heading: 'Heads up', body: 'Body text'}]);

        fireEvent.click(screen.getByRole('button', {name: 'お知らせを閉じる'}));
        expect(screen.getByRole('button', {name: 'お知らせを開く'})).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(screen.getByRole('button', {name: 'お知らせを開く'}));
        expect(screen.getByRole('button', {name: 'お知らせを閉じる'})).toHaveAttribute('aria-expanded', 'true');
    });

    test('Escape closes the panel and returns focus to the trigger', () => {
        renderOverlay([{heading: 'Heads up', body: 'Body text'}]);

        const trigger = screen.getByRole('button', {name: 'お知らせを閉じる'});
        fireEvent.keyDown(screen.getByText('Body text'), {key: 'Escape'});

        expect(screen.getByRole('button', {name: 'お知らせを開く'})).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).toHaveFocus();
    });

    test('a pointerup outside the panel closes it, matching the Settings/File/Edit menu convention', () => {
        renderOverlay([{heading: 'Heads up', body: 'Body text'}]);

        fireEvent.pointerUp(document.body);

        expect(screen.getByRole('button', {name: 'お知らせを開く'})).toHaveAttribute('aria-expanded', 'false');
    });

    test('a pointerup inside the panel does not close it', () => {
        renderOverlay([{heading: 'Heads up', body: 'Body text'}]);

        fireEvent.pointerUp(screen.getByText('Body text'));

        expect(screen.getByRole('button', {name: 'お知らせを閉じる'})).toHaveAttribute('aria-expanded', 'true');
    });

    test('flags high contrast when Color Mode is high contrast', () => {
        const {container} = renderOverlay(
            [{heading: 'Heads up', body: 'Body text'}],
            {colorMode: HIGH_CONTRAST_MODE}
        );

        expect(container.querySelector('div[data-high-contrast="true"]')).toBeInTheDocument();
    });

    test('does not flag high contrast in the original Color Mode', () => {
        const {container} = renderOverlay(
            [{heading: 'Heads up', body: 'Body text'}],
            {colorMode: 'default'}
        );

        expect(container.querySelector('div[data-high-contrast]')).not.toBeInTheDocument();
    });
});
