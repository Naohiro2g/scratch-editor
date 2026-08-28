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
    const renderOverlay = function (notices, props = {}, runtimeConfig = {}) {
        getMcRemoteRuntimeConfig.mockReturnValue({
            notices,
            releaseIdentity: 'release-123',
            homepageUrl: null,
            ...runtimeConfig
        });
        return renderWithIntl(
            <NoticeOverlay {...props} />,
            {locale: 'ja', messages: mcremoteMessages.ja}
        );
    };

    afterEach(() => {
        getMcRemoteRuntimeConfig.mockReset();
    });

    test('always shows the fixed version footer, derived from the McRemote client build, ' +
        'even with no deployment notices', () => {
        renderOverlay([]);
        expect(screen.getByText('バージョン McRemote Scratch 2300.0.0b6')).toBeInTheDocument();
    });

    test('ignores a deployment-configured releaseIdentity for the footer (a showcase build sets ' +
        'it to a raw commit SHA, not a display label)', () => {
        renderOverlay([], {}, {releaseIdentity: 'df9264ec355dd722a848df46e96d4b0fc9340ca2'});
        expect(screen.queryByText(/df9264ec/)).not.toBeInTheDocument();
    });

    test('substitutes a {version} token in a configured notice heading, body, and link label', () => {
        renderOverlay([{
            heading: 'Client {version}',
            body: 'Running {version}.',
            link: {href: 'https://example.com', label: 'About {version}'}
        }]);
        expect(screen.getByText('Client McRemote Scratch 2300.0.0b6')).toBeInTheDocument();
        expect(screen.getByText('Running McRemote Scratch 2300.0.0b6.')).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'About McRemote Scratch 2300.0.0b6'})).toBeInTheDocument();
    });

    test('shows a homepage link in the footer only when homepageUrl is configured', () => {
        renderOverlay([], {}, {homepageUrl: 'https://mc-remote.com/'});
        const link = screen.getByRole('link', {name: 'ホームページ'});
        expect(link).toHaveAttribute('href', 'https://mc-remote.com/');
    });

    test('omits the homepage link when homepageUrl is not configured', () => {
        renderOverlay([]);
        expect(screen.queryByRole('link', {name: 'ホームページ'})).not.toBeInTheDocument();
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
