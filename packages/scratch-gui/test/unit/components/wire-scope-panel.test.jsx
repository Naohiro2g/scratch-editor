import React from 'react';
import '@testing-library/jest-dom';
import {screen, fireEvent} from '@testing-library/react';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import WireScopePanel from '../../../src/components/wire-scope-panel/wire-scope-panel';
import mcremoteMessages from '../../../src/lib/mcremote-l10n';
import {HIGH_CONTRAST_MODE} from '../../../src/lib/settings/color-mode/index.js';

describe('WireScopePanel', () => {
    const renderPanel = function (snapshot, props = {}) {
        return renderWithIntl(
            <WireScopePanel
                snapshot={snapshot}
                {...props}
            />,
            {
                locale: 'ja',
                messages: {
                    ...mcremoteMessages.ja,
                    'gui.mcremote.wireScope.title': 'WireScope'
                }
            }
        );
    };

    test('shows the configured target and the actual target from the observer snapshot', () => {
        renderPanel({
            status: 'connected',
            streamId: 'default',
            connectionTarget: {
                sandboxRoute: 'sb-dev.mc-remote.com',
                label: 'Development Sandbox'
            },
            pairCode: '827-419',
            pairCommand: '/mcremote pair 827-419',
            hello: null,
            frameLog: []
        }, {
            connectionTarget: {sandboxRoute: 'sb-dev.mc-remote.com'}
        });

        expect(screen.getByText('設定先')).toBeInTheDocument();
        expect(screen.getByText('実接続先')).toBeInTheDocument();
        expect(screen.getByText('Development Sandbox - sb-dev.mc-remote.com')).toBeInTheDocument();
    });

    test('shows an empty actual target and a reconnect-needed badge before any connection', () => {
        renderPanel(
            {
                status: 'disconnected',
                streamId: 'default',
                frameLog: []
            },
            {
                connectionTarget: {sandboxRoute: 'minecraft.classroom.example'}
            }
        );

        expect(screen.getByText('minecraft.classroom.example')).toBeInTheDocument();
        expect(screen.getByText('再接続')).toBeInTheDocument();
        expect(screen.getByText('要')).toBeInTheDocument();
    });

    test('shows reconnect as up to date once actually connected to the configured target', () => {
        renderPanel({
            status: 'connected',
            streamId: 'default',
            connectionTarget: {sandboxRoute: 'sb.mc-remote.com', label: 'Sandbox'},
            frameLog: []
        }, {
            connectionTarget: {sandboxRoute: 'sb.mc-remote.com'}
        });

        expect(screen.getByText('不要')).toBeInTheDocument();
    });

    test('shows reconnect as needed when connected to a different target than configured', () => {
        renderPanel({
            status: 'connected',
            streamId: 'default',
            connectionTarget: {sandboxRoute: 'sb.mc-remote.com', label: 'Sandbox'},
            frameLog: []
        }, {
            connectionTarget: {sandboxRoute: 'sb-dev.mc-remote.com'}
        });

        expect(screen.getByText('要')).toBeInTheDocument();
    });

    test('renders observed hello metadata and frame payloads', () => {
        renderPanel({
            status: 'connected',
            streamId: 'default',
            connectionTarget: {
                sandboxRoute: 'sb.mc-remote.com',
                label: 'Sandbox'
            },
            pairCode: '827-419',
            pairCommand: '/mcremote pair 827-419',
            hello: {
                protocol: '21.0.0',
                mc_version: '26.1.2',
                supported_mc_versions: ['1.21.11'],
                world_constants: {y_sea: 63},
                permissions: {build: true}
            },
            frameLog: [
                {
                    sequence: 1,
                    timestamp: 1710000000000,
                    streamId: 'default',
                    direction: 'send',
                    method: 'hello',
                    payload: {jsonrpc: '2.0', id: 1, method: 'hello'}
                },
                {
                    sequence: 2,
                    timestamp: 1710000001000,
                    streamId: 'default',
                    direction: 'receive',
                    method: 'hello',
                    payload: {jsonrpc: '2.0', id: 1, result: {y_sea: 63}}
                }
            ]
        });

        const badge = screen.getByRole('status', {name: '状態: 接続'});
        expect(badge).toHaveTextContent('OK');
        expect(badge).toHaveTextContent('接続');

        expect(screen.getByText('Sandbox - sb.mc-remote.com')).toBeInTheDocument();
        expect(screen.getByText('26.1.2 - 21.0.0')).toBeInTheDocument();
        expect(screen.getByText('{"y_sea":63}')).toBeInTheDocument();
        expect(screen.getByText('{"build":true}')).toBeInTheDocument();
        expect(screen.getByText('/mcremote pair 827-419')).toBeInTheDocument();
        expect(screen.getByText('送信')).toBeInTheDocument();
        expect(screen.getByText('受信')).toBeInTheDocument();
        expect(screen.getByText('{"jsonrpc":"2.0","id":1,"method":"hello"}')).toBeInTheDocument();
        expect(screen.getByText('{"jsonrpc":"2.0","id":1,"result":{"y_sea":63}}')).toBeInTheDocument();
    });

    test('renders a status badge for each connection state', () => {
        const expectations = [
            ['disconnected', '状態: 未接続', '-'],
            ['pairing', '状態: pair 待ち', '...'],
            ['connected', '状態: 接続', 'OK'],
            ['closed', '状態: 切断', 'X'],
            ['error', '状態: エラー', '!']
        ];

        for (const [status, label, icon] of expectations) {
            const {unmount} = renderPanel({status});
            const badge = screen.getByRole('status', {name: label});
            expect(badge).toHaveTextContent(icon);
            expect(badge).toHaveTextContent(label.replace('状態: ', ''));
            unmount();
        }
    });

    test('clicking the header collapses the detail drawer but keeps the status strip visible', () => {
        renderPanel({
            status: 'connected',
            streamId: 'default',
            connectionTarget: {sandboxRoute: 'sb.mc-remote.com', label: 'Sandbox'},
            pairCode: '827-419',
            pairCommand: '/mcremote pair 827-419',
            frameLog: []
        }, {
            connectionTarget: {sandboxRoute: 'sb.mc-remote.com'}
        });

        expect(screen.getByText('/mcremote pair 827-419')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'WireScope の詳細を閉じる'}));

        expect(screen.queryByText('/mcremote pair 827-419')).not.toBeInTheDocument();
        // The always-on status strip survives collapsing the drawer.
        expect(screen.getByText('設定先')).toBeInTheDocument();
        expect(screen.getByText('実接続先')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'WireScope の詳細を開く'}));
        expect(screen.getByText('/mcremote pair 827-419')).toBeInTheDocument();
    });

    test('flags high contrast when Color Mode is high contrast', () => {
        const {container} = renderPanel(
            {status: 'connected'},
            {colorMode: HIGH_CONTRAST_MODE}
        );

        expect(container.querySelector('aside[data-high-contrast="true"]')).toBeInTheDocument();
    });

    test('does not flag high contrast in the original Color Mode', () => {
        const {container} = renderPanel(
            {status: 'connected'},
            {colorMode: 'default'}
        );

        expect(container.querySelector('aside[data-high-contrast]')).not.toBeInTheDocument();
    });
});
