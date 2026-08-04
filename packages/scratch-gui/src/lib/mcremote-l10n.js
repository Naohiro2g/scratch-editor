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
        'gui.alerts.mcremoteConnectionDisabled': 'このショーケースでは Minecraft の操作が無効です。',
        'gui.alerts.mcremoteNotConnected': 'まず McRemote の「接続する」ブロックを実行してください。',
        'gui.aria.mcremoteConnectionMenu': 'McRemote 接続先メニュー',
        'gui.menuBar.mcremoteConnection': '接続先',
        'gui.mcremote.blockPicker.blockValue': 'ブロック値',
        'gui.mcremote.blockPicker.cancel': 'キャンセル',
        'gui.mcremote.blockPicker.defaultExplanation':
            '「Minecraft のデフォルト」のプロパティは省略します。ブロック設置時はブロックデータ全体を置き換え、既存の状態とはマージしません。',
        'gui.mcremote.blockPicker.empty':
            '利用できるカタログのブロックがありません。上の欄へ自由に入力できます。',
        'gui.mcremote.blockPicker.minecraftDefault': 'Minecraft のデフォルト',
        'gui.mcremote.blockPicker.reporterConnected':
            'レポーターブロックが接続されています。picker は取り外しません。文字列を入力するにはレポーターを外してください。',
        'gui.mcremote.blockPicker.search': 'ブロックを検索',
        'gui.mcremote.blockPicker.stateHeading': 'ブロックの状態',
        'gui.mcremote.blockPicker.statusCurrent': 'CURRENT — {version} · {source} · {hash}',
        'gui.mcremote.blockPicker.statusNotAcquired':
            'NOT ACQUIRED — Minecraft に接続するとブロックを選べます。',
        'gui.mcremote.blockPicker.statusUnavailable':
            'UNAVAILABLE — 接続先からカタログを取得できませんでした。',
        'gui.mcremote.blockPicker.title': 'Minecraft のブロックを選ぶ',
        'gui.mcremote.blockPicker.apply': 'この値を使う',
        'gui.mcremote.notice.collapse': 'お知らせを閉じる',
        'gui.mcremote.notice.expand': 'お知らせを開く',
        'gui.mcremote.wireScope.actionConnect': 'まず「接続する」ブロックを実行してください。',
        'gui.mcremote.wireScope.actionConnectionDisabled': 'このショーケースページでは Minecraft の操作が無効です。',
        'gui.mcremote.wireScope.actionPairAgain': '「接続する」ブロックを実行し、もう一度ペアリングしてください。',
        'gui.mcremote.wireScope.actionProtocolMismatch': 'Scratch と McRemote サーバーのバージョンを揃えてください。',
        'gui.mcremote.wireScope.actionRequired': '次にすること',
        'gui.mcremote.wireScope.actionRetry': '接続を確認して、もう一度試してください。',
        'gui.mcremote.wireScope.configuredTarget': '設定先',
        'gui.mcremote.wireScope.actualTarget': '実接続先',
        'gui.mcremote.wireScope.reconnectStatus': '再接続',
        'gui.mcremote.wireScope.reconnectNeeded': '要',
        'gui.mcremote.wireScope.reconnectNotNeeded': '不要',
        'gui.mcremote.wireScope.reconnectPending': 'ペア待ち…',
        'gui.mcremote.wireScope.collapse': 'WireScope mini を閉じる',
        'gui.mcremote.wireScope.expand': 'WireScope mini を開く',
        'gui.mcremote.wireScope.observationTarget': '観察対象',
        'gui.mcremote.wireScope.pairCode': 'ペアコード',
        'gui.mcremote.wireScope.pairCommand': 'ペアリングコマンド',
        'gui.mcremote.wireScope.status': '状態',
        'gui.mcremote.wireScope.statusClosed': '切断',
        'gui.mcremote.wireScope.statusConnected': '接続',
        'gui.mcremote.wireScope.statusDisconnected': '未接続',
        'gui.mcremote.wireScope.statusError': 'エラー',
        'gui.mcremote.wireScope.statusPairing': 'pair 待ち',
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
        'mcremote.setBlock': 'x:[X] y:[Y] z:[Z] のブロックを [BLOCK] にする [PICKER]',
        'mcremote.setBlocks': 'x:[X1] y:[Y1] z:[Z1] から x:[X2] y:[Y2] z:[Z2] までのブロックを [BLOCK] にする [PICKER]',
        'mcremote.getBlock': 'x:[X] y:[Y] z:[Z] のブロック',
        'mcremote.playerAttribute': 'プレイヤーの [PROPERTY]',
        'mcremote.playerAttribute.world': '次元',
        'mcremote.playerAttribute.x': 'x座標',
        'mcremote.playerAttribute.y': 'y座標',
        'mcremote.playerAttribute.z': 'z座標',
        'mcremote.setPlayerPos': 'プレイヤーを [WORLD] x:[X] y:[Y] z:[Z] へ移動する',
        'mcremote.setPlayerXYZ': 'プレイヤーを x:[X] y:[Y] z:[Z] へ移動する'
    }
};

export default mcremoteMessages;
