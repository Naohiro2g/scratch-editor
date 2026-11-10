# E1：ScratchのProtocol Inventory

## 基準と読取範囲

- knowledge：`fc3eeffef28acfa54d1c112751fe95fd4e587fdb` の `00-hub/polyglot-e1-instructions_ja.md`、`10-protocol/protocol-inventory_ja.md`、`polyglot-phase-ef-plan_ja.md`、`api-reference-metadata.json`。
- 基準：公開 `v2321.1.0`、source `57fb7691bb5d9a5895785b200ae78734240ebfa6`、protocol `23.2.1`。
- 読取時の既定developは `24876896e8f47245dff43be336a0eaf5899e3436`。基準との差はrunner labelの固定だけ（12 workflow／17 job）。この票の対象のVM／GUI／fixture lock／testのbytesは公開基準と同じ。
- 「あり」はScratchのblockまたは拡張機能に投影があること。「部分」は経路や利用範囲が限られること。「なし」は利用者向け投影が無いこと。全reasonや実機の全経路の検証済みという意味ではない。
- 以下のVは [`Scratch3McRemoteBlocks`](../packages/scratch-vm/src/extensions/scratch3_mcremote/index.js)、Tは[VM拡張test](../packages/scratch-vm/test/unit/extension_mcremote.js)。opcodeはVのgetInfoと実装methodを指し、blockの日本語名を併記する。補助のtestを別記しないmethodの根拠はVとT。

## method（metadataと同順の32行）

| method | Scratch | block・拡張動作と根拠 |
| --- | --- | --- |
| `hello` | あり | 「接続する」`connect`。_hello／_authenticate；protocol申告と応答の照合、catalog取得、イベント開始。V／T。 |
| `connection.flush` | あり | 「送ったブロック設置が終わるまで待つ」`flushBuildCommands`、「建築モードを [MODE] にする（TRACEの待ち時間 [TRACE_DELAY] 秒）」`setBuildMode`。登録順のflush。mode切替もflushを境界にする。V／T。 |
| `build.setDimension` | あり | 「建築する次元を [DIMENSION] にする」`setDimension`。_setBuildContext；一般DimensionRefを受け、確認済みresultを採用。V／T。 |
| `build.setOrigin` | あり | 「建築原点 (x, y, z) を[X],  0,  [Z]にする」`setBuildOrigin`。_setBuildContext；ScratchはYを0に固定。V／T。 |
| `world.setBlock` | あり | 「x :[X]  y :[Y]  z :[Z] に ブロックID [BLOCK] 状態 [STATE] を置く」`setBlock`。_blockSpec／_setBlockCommand；StateTextをcatalog型へ解決。V／T。 |
| `world.setBlocks` | あり | 「x :[X1]  y :[Y1]  z :[Z1] から x :[X2]  y :[Y2]  z :[Z2] まで ブロックID [BLOCK] 状態 [STATE] を置く」`setBlocks`。_blockSpec／_setBlockCommand；直方体の設置。V／T。 |
| `world.getBlock` | あり | 「x :[X]  y :[Y]  z :[Z] のブロック情報」`getBlock`。_getBlockInfo；BlockInfoTextへ投影。V／T。 |
| `world.getBlocks` | あり | 「x :[X1]  y :[Y1]  z :[Z1] から x :[X2]  y :[Y2]  z :[Z2] までのブロック情報を [LIST] に入れる」`getBlocks`。BlockInfoTextの配列をScratchリストへ原子的に反映。V／T。 |
| `world.getHeight` | あり | 「x :[X]  z :[Z] の地面の高さ」`getHeight`、「x :[X]  z :[Z] の y :[MAX_Y] 以下の地面の高さ」`getHeightBelow`。_getHeight；整数またはErrorText。maxY付きもある。V／T。 |
| `world.getSign` | あり | 「看板 x :[X]  y :[Y]  z :[Z] の情報」`getSign`。SignInfoTextにし、行／色／装飾／waxのアクセサで読む。V／T。 |
| `world.setSign` | あり | 「看板 x :[X]  y :[Y]  z :[Z] の[FACE]を [LINE0] [LINE1] [LINE2] [LINE3] にする」`setSign`。片面4行の置換。null応答を待つ。V／T。 |
| `world.updateSignLine` | あり | 「看板 x :[X]  y :[Y]  z :[Z] の[FACE] [LINE]を [TEXT] にする」`updateSignLine`。片面の1行だけをPATCH。V／T。 |
| `player.getPos` | あり | 「プレイヤーの [PROPERTY]」`playerAttribute`、「プレイヤーを x :[X]  y :[Y]  z :[Z] へ移動する」`setPlayerXYZ`。dimension／位置をreporterへ。setPlayerXYZは現在dimensionを先に読む。V／T。 |
| `player.setPos` | あり | 「プレイヤーを [DIMENSION] x :[X]  y :[Y]  z :[Z] へ移動する」`setPlayerPos`、「プレイヤーを x :[X]  y :[Y]  z :[Z] へ移動する」`setPlayerXYZ`。dimension付き移動。応答を待つ。V／T。 |
| `player.getPose` | あり | 「プレイヤーの [PROPERTY]」`playerAttribute`。yaw／pitchを含む姿勢のreporter。V／T。 |
| `player.setPose` | あり | 「プレイヤーを [DIMENSION] x :[X]  y :[Y]  z :[Z] 水平方向:[YAW] 上下方向:[PITCH] へ移動する」`setPlayerPose`。dimension／位置／yaw／pitchを一度に送る。V／T。 |
| `player.getDirection` | あり | 「プレイヤーの向き [AXIS]」`playerDirection`。_directionReporter；有限数の3要素を検証。V／T。 |
| `player.setDirection` | あり | 「プレイヤーの向きを x[X]  y[Y]  z[Z] にする」`setPlayerDirection`。_directionCommand；応答方向を検証。V／T。 |
| `world.spawnEntity` | あり | 「エンティティ [ENTITY] を x :[X]  y :[Y]  z :[Z] に生成し ハンドルを [VARIABLE] に入れる」`spawnEntity`。現行mcr_eh_ handleまたはErrorTextを選択変数へ書く。V／T。 |
| `world.getNearbyEntities` | あり | 「x :[X]  y :[Y]  z :[Z] の半径 [RADIUS] 以内のエンティティを最大 [MAX_ENTITIES] 件 [LIST] に入れる」`getNearbyEntities`。現行entity snapshotをScratchリストへ入れる。V／T。 |
| `entity.getPose` | あり | 「エンティティ [HANDLE] の姿勢」`getEntityPose`。poseを文字列snapshotにしてアクセサで読む。V／T。 |
| `entity.setPose` | あり | 「エンティティ [HANDLE] を [DIMENSION] x :[X]  y :[Y]  z :[Z] 水平方向:[YAW] 上下方向:[PITCH] へ移動する」`setEntityPose`。handle／dimension／位置／向きを送る。V／T。 |
| `entity.getDirection` | あり | 「エンティティ [HANDLE] の向き [AXIS]」`entityDirection`。_directionReporter；handleを付けて読む。V／T。 |
| `entity.setDirection` | あり | 「エンティティ [HANDLE] の向きを x[X]  y[Y]  z[Z] にする」`setEntityDirection`。_directionCommand；handle付きで向きを指定。V／T。 |
| `entity.remove` | あり | 「エンティティ [HANDLE] を取り除く」`removeEntity`。handleを送って削除。失効はserver reasonで観測。V／T。 |
| `world.spawnParticle` | あり | 「パーティクル [PARTICLE] を x :[X]  y :[Y]  z :[Z] ずれ x[OFFSET_X]  y[OFFSET_Y]  z[OFFSET_Z] 速さ:[SPEED] 数:[COUNT] 表示:[FORCE] で生成する」`spawnParticle`、「[RECEIVER] に表示するパーティクル [PARTICLE]」`particleSpec`、「[RECEIVER] に表示するダスト 赤 [RED] 緑 [GREEN] 青 [BLUE] 大きさ [SIZE]」`dustParticleSpec`、「[RECEIVER] に表示するブロックのパーティクル [BLOCK] 状態 [STATE]」`blockParticleSpec`。typed data／receiverの指定文字列を展開し、forceを含む座標先行paramsを送る。V／T。 |
| `world.playSound` | あり | 「音 [SOUND] を x :[X]  y :[Y]  z :[Z] で鳴らす 設定 [OPTIONS]」`playSound`、「音の設定 音量 [VOLUME] 高さ [HEIGHT] 再生先 [RECEIVER]」`soundOptions`。receiver／volume／pitch／seed等を指定。V／T。 |
| `world.playBlockSound` | あり | 「x :[X]  y :[Y]  z :[Z] のブロックの [KIND] 音を鳴らす 設定 [OPTIONS]」`playBlockSound`、「音の設定 音量 [VOLUME] 高さ [HEIGHT] 再生先 [RECEIVER]」`soundOptions`。block sound kindを指定。soundと同じoption投影。V／T。 |
| `world.strikeLightning` | あり | 「雷を x :[X]  y :[Y]  z :[Z] に落とす」`strikeLightning`。id付きrequest、null成功。modeによってnotificationにしない。V／T。 |
| `chat.post` | あり | 「チャットに [MSG] と言う」`postToChat`。ack付きcommand。null成功。V／T。 |
| `events.poll` | あり | 「ツルハシでブロックがつつかれたとき」`whenPickaxePoke`、「チャットが投稿されたとき」`whenChatPosted`、「飛び道具が当たったとき」`whenProjectileHit`、「このMinecraftイベントの [PROPERTY]」`eventValue`、「イベント受信の [PROPERTY]」`eventStatus`。単一pollerからhatへdispatch。thread-local DTO／cursor／loss状態を読む。V／T。 |
| `catalog.get` | あり | 「カタログの [KIND] を [LIST] に入れる」`catalogToList`。_acquireCatalogがhello後に取得／hash照合／cache。block／entity／particleのIDをリストへコピー。V／T。 |

## auth（5行）

| method | Scratch | block・拡張動作と根拠 |
| --- | --- | --- |
| `auth.pairBegin` | あり | 「接続する」`connect`、「ペアコード」`pairCode`、「ペアリングコマンド」`pairCommand`。_pair；session tokenのペアリング開始、承認コマンド表示。V／T。 |
| `auth.pairPoll` | あり | 「接続する」`connect`、「ペアリングできたとき」`whenPaired`。_pollPair；期限までpollしtoken保存→helloを再実行。V／T。 |
| `auth.listCredentials` | なし | VのgetInfoに管理blockは無く、公開操作としての実装も無い。Tのpersistent transport確認は内部_requestの経路確認で、利用者向けcredential管理の実装ではない。 |
| `auth.revoke` | なし | VのgetInfoに管理blockは無く、公開操作としての実装も無い。Tのpersistent transport確認は内部_requestの経路確認で、利用者向けcredential管理の実装ではない。 |
| `auth.logout` | なし | VのgetInfoに管理blockは無く、公開操作としての実装も無い。Tのpersistent transport確認は内部_requestの経路確認で、利用者向けcredential管理の実装ではない。 |

## methodでない能力（Inventoryと同順の14行）

| 能力 | Scratch | 投影と根拠 |
| --- | --- | --- |
| TCPのframing／JSON-RPC | 部分 | Vの_startRequest／_startNotification／_onMessageにJSON-RPC 2.0のid照合とerror処理。Scratch自身はTCP socket／改行framingを持たず、Bridge側の責務。Tのhello JSON-RPC／closed socket tests。 |
| WebSocket／browser | あり | Vの_bridgeUrl／_open／_sendJsonRpc。ブラウザWebSocket→Bridge→McRemoteのTCP。Bridge subprotocolを確認し、対応しなければ接続を拒む。Tのone-shot transport／runtime target／connectTo URL tests。TCP実装はtooling owner。 |
| protocol negotiation | あり | Vの_hello／_isProtocolCompatible／_assertCompatibleProtocol。major一致、server.minor>=client.minor、patchは比較しない。不一致はprotocol_mismatch。Tの23.2.0受入れ、新minor受入れ、major／旧minor拒否tests。 |
| authentication／pairing | あり | 「接続する」、ペアリングコード／コマンド、ペアリング完了hat。Vの_authenticate／_pair／_pollPair。Tのauth_required starts pair flow test。管理用long-lived credentialのUIは無い。 |
| session credentialのUX | あり | Vの_readSessionToken／_saveSessionToken／_sessionTokenStorageKey。localStorageをsandbox routeごとに分け、認証errorで該当tokenを破棄。ブラウザoriginも保存の境界。OSのcredential storeは使わない。Tのsandbox token／sandbox switch tests。 |
| request／notification／flushと順序 | あり | 建築modeと「送ったブロック設置が終わるまで待つ」。Vの_enqueueOutbound／_drainOutboundQueue／_setBlockCommand／setBuildMode／flushBuildCommands。DEBUG／TRACEは応答、FASTの設置はnotification、flushはserver処理の境界。Tのmode／outbound順序tests。 |
| events cursor／loss | あり | 3種hatとeventValue／eventStatus。Vの_pollEvents／_dispatchEvent／_notifyEventLoss、event.js。Tのmixed events／unknown-only／malformed event tests、mcremote_event.js。未知eventでcursorを進め、学習者hatを捏造しない。 |
| error reason | 部分 | Vの_onMessageはcode／message／data／reasonを保持するが、Scratch reporterはblock-value.jsのallowlistでErrorTextへ投影し、未知reasonはremote_errorへ畳む。commandは警告・接続案内。Tのallowlisted／unknown remote reasons tests、mcremote_block_value.js。全reasonの直接露出はしない。 |
| build context | 部分 | 「建築する次元を…」「建築原点…」。Vの_recordHelloInfo／_setBuildContext／setDimension／setBuildOriginとdimension.js。確認済みcontextを使うが、原点Yは0に封じている。Tのcanonical setter／seals y／event dispatch tests。 |
| BlockValue／BlockSpec | あり | setBlock／setBlocks、getBlock／getBlocks、blockInfo系とpicker。block-value.jsでStateTextの型解決、BlockInfoTextの正準化。mcremote_block_value.js、GUIのmcremote-block-ref.test.js／mcremote-block-picker.test.jsx。Java等と同じclass名のAPIではなく文字列／リスト投影。 |
| catalog／constants | 部分 | Vの_acquireCatalog／catalogToList、catalog.js。catalogHash照合とIndexedDB cache、ID一覧、GUIの名前／カテゴリ検索と状態pickerがある。.pyi等の生成定数APIは無い。mcremote_catalog.jsとTのcatalog list tests。 |
| helloの`world_constants` | 部分 | Vの_recordHelloInfoはworld_constantsを保持し、旧top-level y_seaも正規化する。GUIのmcremote-wirescope-source.js allowHelloはy_seaだけをobserverへ投影する。一般の世界定数を読むScratch blockは無い。Tのnormalizes top-level y_sea test／GUI sourceのallowlist test。 |
| epoch／reconnect | 部分 | Vの_open close処理がpending／outbound／catalog／event／monitorを破棄。次の「接続する」でtokenを再利用しhelloとbuild contextを作り直す。自動の再認証・script再開・送信の自動再試行は無い。handle失効はserver reason。Tのreconnect／closed socket／in-flight cache tests。 |
| WireScopeのobserver | あり | Vの_appendFrame／_emitObservationとGUIのmcremote-wirescope-source.js createWireScopeSource／toWireScopeSnapshot。WireScope miniと独立windowへ投影し、credentialをredactする。wire-scope-panel.test.jsx、mcremote-wirescope-source.test.js、Tのobservation／redacts session tokens tests。 |

## 表に追加するScratch固有の投影

| 能力 | Scratch | 根拠 |
| --- | --- | --- |
| 変数・リストへの結果の投影 | あり | VのspawnEntity／getNearbyEntities／getBlocks／catalogToList。scalar／listへの書込みを検証するTの各test。 |
| 名前・カテゴリ検索と状態入力支援 | あり | GUIのcomponents/mcremote-block-picker/、lib/mcremote-block-names/。block IDを保存し、表示名やカテゴリ語は検索だけに使う。picker／block-namesのunit。 |
| reporterのモニターpoll抑制 | あり | Vの_getBlockInfo／_getPlayerPos／_getPlayerPose／_getHeight。モニターの重複・頻度を抑え、明示呼出しとは分ける。Tのmonitor／coalesces tests。 |

追加行はclientのUX／言語固有投影であり、新しいProtocol能力の提案ではない。

## 共有fixtureの使い方

取得元は既に`fixture_source.commit = 21a2a9a0aed8b4d9c715da46616aad86f1174b4c`。今回の前後で変更しない。公開基準にも入っている。Bridge／WireScope配布物の`source.commit = 6447f6e8cbfbeeb9d229990b5c4f6e82a5875666`は別の固定で、fixtureの取得元ではない。

- 固定：[`mc-remote/tooling-lock.json`](../mc-remote/tooling-lock.json)。取得器：[`scripts/acquire-mcremote-tooling.mjs`](../scripts/acquire-mcremote-tooling.mjs)。
- copy先：`mc-remote/tooling/fixtures/protocol/test/fixtures/`（gitignoreの取得cache）。LICENSEもlockの対象で取得・copyし、bytes／SHA-256を検査する。
- MIT LICENSE：1,070 bytes、SHA-256 `aa329a0bafc839b95124306141db13a381de45818bf629e983c44ea55ab5a7fb`。fixture以外のtoolingのライセンスをMITへ変える意味ではない。

| fixture | 接続しているtest | 使う範囲・版 |
| --- | --- | --- |
| `block-value-v22.json` | VM mcremote_block_value.js | StateText／BlockValue／ErrorTextの値ベクトル。現行でも継続利用 |
| `dimensions-v22.json` | T、GUI mcremote-wirescope-source.test.js | 一般ref／build contextの投影。現行でも継続利用 |
| `direction-lightning-v23.1.json` | T、GUI mcremote-wirescope-source.test.js | 方向／雷／particle回帰などのcase。現行でも継続利用 |
| `entity-particle-v23.2.1.json` | T | 現行のentity／particle／sound等の選択case |
| `entity-particle-v23.2.json` | GUI mcremote-wirescope-source.test.js | 履歴版のsound／resource ref等のobserver投影。現行entity handlerの根拠とは分ける |
| `chat-event-compat-v23.2.1.json` | T | 現行版protocol値と未知eventの選択case。chatの投影はGUIが履歴版を使う |
| `chat-event-compat-v23.2.json` | VM mcremote_event.js、GUI mcremote-wirescope-source.test.js | 履歴版の互換event／chatの投影 |
| `events-v23.json` | T、VM mcremote_event.js、GUI mcremote-wirescope-source.test.js | event／cursor／loss。現行でも継続利用 |
| `sign-v23.json` | VM mcremote_sign.js | 定数、getSignの読取り、正準化等の選択case。全18 caseの対話実行ではない |
| `spawn-v22.json` | T、GUI mcremote-wirescope-source.test.js | 履歴版のparamsを参照。旧mceh_ handleは現行成功値とせず、現行mcr_eh_へ差替える箇所を明記して使う |

10本ともtestコードへ接続しており、未接続のfileは無い。ただし各fileの全caseを網羅実行しているという意味ではない。履歴版から現行への再批准も意味しない。TとGUI sourceの冒頭import、および各case参照を確認した。

CIの`.github/actions/install-dependencies/action.yml`が`npm run tooling:fixtures`を実行し、VMのunitとGUIのunitが上記を読む。文書だけの差分では通常CIのpath filterがworkspace testを省くため、この文書のPRでは通常CIに加えて`ci.yml`の`force-full-build=true`で同じheadを検証し、取得と接続済みtestのPASSを返却する。run IDと結果はPR／返却票を参照。

## 検証の境界とE2への入力

- 今回は公開source／testの読取とCIの決定論的test。Minecraft実機、iPad／Android、学習者、IDEでの操作を新しく検証した主張ではない。
- fixtureは静的なcase。framing／hello／pairing／setBlock→getBlock／closeを再生する共通scripted peerとして実行しているわけではない。F1のfixtureを追加する作業は行わない。
- 既存のブロック一覧JSONはsetDimension／setBuildOriginのmethodsを`connection.setBuildContext`と記録しているが、公開VM sourceはそれぞれ`build.setDimension`／`build.setOrigin`を送る。この表は実際のVM sourceを根拠にする。一覧の修正はこの票の範囲外。

## Phase D：開発体験の静的評価

| 観点 | 現状 | 未検証 |
| --- | --- | --- |
| resourceの発見 | catalogからID一覧／状態候補、同梱する公式の名前とカテゴリ語から検索 | 学習者が実際に探す操作の比較 |
| 型 | ID／StateText／BlockInfoText／SignInfoTextで投影し、catalogで値の型を解決 | テキスト投影とtyped APIの使いやすさの比較 |
| 補完 | 状態pickerとメニュー。汎用コード向けの生成定数は無い | IDE型補完との比較 |
| 編集と実行 | block選択→Scratchのscript→接続・ペアリング→実行。作品をブラウザ／sb3へ保存 | cold reader／タブレットでの一連の操作 |
| 文書／LLM | 版別ブロック一覧とopcode／表示名を参照できる | LLM利用者による実評価 |
