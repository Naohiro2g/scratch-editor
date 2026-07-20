/**
 * Fork-local translations for the McRemote extension.
 *
 * The published scratch-l10n catalog does not carry this fork's strings, so we
 * merge these into the locale catalog ourselves (see reducers/locales.js). The
 * same catalog feeds both react-intl (the `gui.extension.mcremote.*` library
 * tile) and the VM's format-message (the `mcremote.*` block labels), so one
 * entry per id covers both.
 *
 * English is defined where the strings live (`defaultMessage` in the extension
 * library entry, `default:` in the VM extension's getInfo) and is used as the
 * fallback, so only translations belong here.
 *
 * Routine when adding a McRemote block: add the block's message id and its
 * Japanese text below, keeping the `[PLACEHOLDER]` tokens identical to the
 * block's `default:` text in scratch-vm. Ids whose Japanese equals the English
 * brand name (e.g. the `McRemote` category) are intentionally omitted and fall
 * back to English.
 */
const mcremoteMessages = {
    ja: {
        'gui.extension.mcremote.description': 'Scratch のブロックから Minecraft を操作します。',
        'gui.aria.mcremoteConnectionMenu': 'McRemote 接続先メニュー',
        'gui.menuBar.mcremoteConnection': '接続先',
        'gui.mcremote.connectionTarget.sandbox': 'Sandbox',
        'gui.mcremote.connectionTarget.stable': 'Stable',
        'gui.mcremote.connectionTarget.beta': 'Beta',
        'gui.mcremote.connectionTarget.alpha': 'Alpha',
        'gui.mcremote.connectionTarget.dev': 'Dev',
        'gui.mcremote.wireScope.direction': '方向',
        'gui.mcremote.wireScope.emptyFrames': 'フレームはまだありません',
        'gui.mcremote.wireScope.frames': 'フレーム',
        'gui.mcremote.wireScope.hello': 'Hello',
        'gui.mcremote.wireScope.lastError': '最後のエラー',
        'gui.mcremote.wireScope.connectionTarget': '接続先',
        'gui.mcremote.wireScope.mcVersion': 'MC バージョン',
        'gui.mcremote.wireScope.method': 'メソッド',
        'gui.mcremote.wireScope.pairCode': 'ペアコード',
        'gui.mcremote.wireScope.pairCommand': 'ペアリングコマンド',
        'gui.mcremote.wireScope.payload': 'ペイロード',
        'gui.mcremote.wireScope.permissions': '権限',
        'gui.mcremote.wireScope.protocol': 'プロトコル',
        'gui.mcremote.wireScope.receive': '受信',
        'gui.mcremote.wireScope.send': '送信',
        'gui.mcremote.wireScope.status': '状態',
        'gui.mcremote.wireScope.statusClosed': '切断',
        'gui.mcremote.wireScope.statusConnected': '接続',
        'gui.mcremote.wireScope.statusDisconnected': '未接続',
        'gui.mcremote.wireScope.statusError': 'エラー',
        'gui.mcremote.wireScope.statusPairing': 'pair 待ち',
        'gui.mcremote.wireScope.stream': 'ストリーム',
        'gui.mcremote.wireScope.time': '時刻',
        'gui.mcremote.wireScope.worldConstants': 'ワールド定数',
        'mcremote.connect': '接続する',
        'mcremote.connectTo': '[NAME] に接続する',
        'mcremote.pairCode': 'ペアコード',
        'mcremote.pairCommand': 'ペアリングコマンド',
        'mcremote.whenPaired': 'ペアリングできたとき',
        'mcremote.setWorld': '建築ワールドを [WORLD] にする',
        'mcremote.setBuildOrigin': '建築原点(X, Y, Z)を [X], 0, [Z] にする',
        'mcremote.world.overworld': 'オーバーワールド',
        'mcremote.world.nether': 'ネザー',
        'mcremote.world.theEnd': 'エンド',
        'mcremote.postToChat': 'チャットに [MSG] と言う',
        'mcremote.setBlock': 'x:[X] y:[Y] z:[Z] のブロックを [BLOCK] にする',
        'mcremote.setBlocks': 'x:[X1] y:[Y1] z:[Z1] から x:[X2] y:[Y2] z:[Z2] までのブロックを [BLOCK] にする',
        'mcremote.getBlock': 'x:[X] y:[Y] z:[Z] のブロック'
    }
};

export default mcremoteMessages;
