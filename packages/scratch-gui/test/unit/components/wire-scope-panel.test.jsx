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
                    'gui.mcremote.wireScope.title': 'WireScope mini'
                }
            }
        );
    };

    const expand = () => {
        fireEvent.click(screen.getByRole('button', {name: 'WireScope mini を開く'}));
    };

    test('starts compact with only the current connection status visible', () => {
        renderPanel({
            status: 'pairing',
            sourceKind: 'scratch',
            displayAlias: 'MOSS-ORBIT-27',
            pairCode: '827-419',
            pairCommand: '/mcremote pair 827-419'
        });

        expect(screen.getByRole('status', {name: '状態: pair 待ち'})).toBeInTheDocument();
        expect(screen.queryByText('827-419')).not.toBeInTheDocument();
    });

    test('shows configured and actual targets when expanded', () => {
        renderPanel({
            status: 'connected',
            connectionTarget: {
                sandboxRoute: 'sb-dev.mc-remote.com',
                label: 'Development Sandbox'
            }
        }, {
            connectionTarget: {sandboxRoute: 'sb-dev.mc-remote.com'}
        });
        expand();

        expect(screen.getByText('設定先')).toBeInTheDocument();
        expect(screen.getByText('実接続先')).toBeInTheDocument();
        expect(screen.getByText('Development Sandbox - sb-dev.mc-remote.com')).toBeInTheDocument();
        expect(screen.getByText('不要')).toBeInTheDocument();
    });

    test('shows pairing instructions but no detailed observer payload', () => {
        renderPanel({
            status: 'pairing',
            sourceKind: 'scratch',
            displayAlias: 'MOSS-ORBIT-27',
            pairCode: '827-419',
            pairCommand: '/mcremote pair 827-419',
            hello: {
                protocol: '21.0.0',
                mc_version: '1.21.11',
                world_constants: {y_sea: 63},
                permissions: {build: true}
            },
            frameLog: [{
                sequence: 1,
                method: 'hello',
                payload: {jsonrpc: '2.0'}
            }]
        });
        expand();

        expect(screen.getByText('827-419')).toBeInTheDocument();
        expect(screen.getByText('/mcremote pair 827-419')).toBeInTheDocument();
        expect(screen.getByText('Scratch · MOSS-ORBIT-27')).toBeInTheDocument();
        expect(screen.queryByText('21.0.0')).not.toBeInTheDocument();
        expect(screen.queryByText('{"y_sea":63}')).not.toBeInTheDocument();
        expect(screen.queryByText('{"jsonrpc":"2.0"}')).not.toBeInTheDocument();
    });

    test.each([
        ['not_connected', 'まず「接続する」ブロックを実行してください。'],
        ['connection_disabled', 'このショーケースページでは Minecraft の操作が無効です。'],
        ['token_expired', '「接続する」ブロックを実行し、もう一度ペアリングしてください。'],
        ['protocol_mismatch', 'Scratch と McRemote サーバーのバージョンを揃えてください。'],
        ['unknown', '接続を確認して、もう一度試してください。']
    ])('projects stable reason %s into an actionable message', (reason, expected) => {
        renderPanel({
            status: 'error',
            lastError: {reason, message: 'raw transport detail'}
        });
        expand();

        expect(screen.getByText(expected)).toBeInTheDocument();
        expect(screen.queryByText('raw transport detail')).not.toBeInTheDocument();
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
            unmount();
        }
    });

    test('collapses back to the status bar', () => {
        renderPanel({
            status: 'pairing',
            pairCode: '827-419'
        });
        expand();
        expect(screen.getByText('827-419')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'WireScope mini を閉じる'}));

        expect(screen.queryByText('827-419')).not.toBeInTheDocument();
        expect(screen.getByRole('status', {name: '状態: pair 待ち'})).toBeInTheDocument();
    });

    test('flags high contrast when Color Mode is high contrast', () => {
        const {container} = renderPanel(
            {status: 'connected'},
            {colorMode: HIGH_CONTRAST_MODE}
        );

        expect(container.querySelector('aside[data-high-contrast="true"]')).toBeInTheDocument();
    });
});
