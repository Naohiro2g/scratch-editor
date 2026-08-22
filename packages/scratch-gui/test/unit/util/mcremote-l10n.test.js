import fs from 'fs';
import path from 'path';

import mcremoteMessages from '../../../src/lib/mcremote-l10n';
import {initLocale, localesInitialState} from '../../../src/reducers/locales';

describe('McRemote Japanese localization', () => {
    test('covers the extension, connection, blocks, picker, and WireScope mini', () => {
        expect(mcremoteMessages.ja).toMatchObject({
            'gui.extension.mcremote.description': 'Scratch のブロックから Minecraft を操作します。',
            'gui.menuBar.mcremoteConnection': '接続先',
            'gui.mcremote.blockPicker.statusCurrent': '取得済み — {version} · {source} · {hash}',
            'gui.mcremote.blockPicker.statusNotAcquired':
                '未取得 — Minecraft に接続するとブロックを選べます。',
            'gui.mcremote.blockPicker.statusUnavailable':
                '利用不可 — 接続先からカタログを取得できませんでした。',
            'gui.mcremote.wireScope.statusPairing': 'ペアリング待ち',
            'mcremote.connect': '接続する',
            'mcremote.connectionDisabled': 'このページでは Minecraft への接続が無効です。',
            'mcremote.setBuildMode': '建築モードを [MODE] にする（TRACEの待ち時間 [TRACE_DELAY] 秒）',
            'mcremote.flushBuildCommands': '送ったブロック設置が終わるまで待つ',
            'mcremote.buildMode.trace': 'TRACE（過程）',
            'gui.alerts.mcremoteInvalidTraceDelay': 'TRACEの待ち時間は0秒から2秒の数値にしてください。',
            'gui.alerts.mcremoteBuildDeliveryFailed':
                'ブロック設置の送信が混み合ったため、McRemoteとの接続を停止しました。もう一度接続してください。'
        });
    });

    test('covers every learner-facing message declared by the McRemote VM extension', () => {
        const extensionSource = fs.readFileSync(path.resolve(
            __dirname,
            '../../../../scratch-vm/src/extensions/scratch3_mcremote/index.js'
        ), 'utf8');
        const messageIds = Array.from(extensionSource.matchAll(/id: '(mcremote[^']+)'/g), (...[match]) => match[1])
            .filter((...[id]) => id !== 'mcremote.categoryName');

        expect(messageIds.length).toBeGreaterThan(0);
        for (const locale of ['ja', 'ja-Hira']) {
            for (const id of messageIds) {
                expect(Object.prototype.hasOwnProperty.call(mcremoteMessages[locale], id)).toBe(true);
            }
        }
    });

    test('provides kanji-free translations for the Japanese Hiragana locale', () => {
        expect(mcremoteMessages['ja-Hira']).toMatchObject({
            'gui.extension.mcremote.description':
                'Scratch のブロックから Minecraft をそうさします。',
            'gui.menuBar.mcremoteConnection': 'せつぞくさき',
            'gui.mcremote.wireScope.statusPairing': 'ペアリングまち',
            'mcremote.connect': 'せつぞくする',
            'mcremote.setDimension': 'けんちくするじげんを [DIMENSION] にする',
            'mcremote.setBuildMode':
                'けんちくモードを [MODE] にする（TRACEのまちじかん [TRACE_DELAY] びょう）',
            'mcremote.flushBuildCommands': 'おくったブロックせっちがおわるまでまつ'
        });
        for (const message of Object.values(mcremoteMessages['ja-Hira'])) {
            expect(message).not.toMatch(/[\u3400-\u9fff]/u);
        }
    });

    test('merges Scratch and McRemote messages into the Japanese Hiragana locale', () => {
        const localeState = initLocale(localesInitialState, 'ja-Hira');

        expect(localeState.locale).toBe('ja-Hira');
        expect(localeState.messages['gui.menuBar.edit']).toBe('へんしゅう');
        expect(localeState.messages['gui.extensionLibrary.chooseAnExtension']).toBe('かくちょうきのうをえらぶ');
        expect(localeState.messages['mcremote.connect']).toBe('せつぞくする');
    });
});
