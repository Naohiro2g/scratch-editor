# ScratchのF1：ブラウザ側の再生とTCP側の分担

根拠はknowledge `125812b47bae32120f56febc4d30058ab0fe8248`の
[共通・Scratchの依頼](https://github.com/Naohiro2g/mc-remote-knowledge/blob/125812b47bae32120f56febc4d30058ab0fe8248/00-hub/polyglot-e2-reconnect-instructions_ja.md)です。
入力はtooling `335c604f859d6dfad04f0434bfa4eb6445761430`のF1 v1六本54 caseと、v2一本12 caseです。
`mc-remote/tooling-lock.json`の取得元・bytes・SHA-256を取得scriptとidentity testで検査します。
MITのLICENSEは同じディレクトリへ取得します。BridgeとWireScopeの配布物の固定は変更しません。

`packages/scratch-vm/test/unit/mcremote_bootstrap_browser.js`は、通常のVMのTap suiteに含まれます。
FakeWebSocketへJSON-RPCの入力を渡し、VMが生成した送信、返したPromise、token store、pending、接続eventを比較します。
**ブラウザ側の意味の再生PASSと、直接TCPのPASSを別に数えます。** TCP framingをVMに追加したり、TCPのbyte chunkを
WebSocketのmessageへ置き換えたりはしません。

## IDの分担

| file（`client-bootstrap-`以下） | 全case数 | ブラウザ側で再生するID | TCP側に置くID |
| --- | ---: | --- | --- |
| framing-v23.2.1.json | 7 | F1-FR-07 | F1-FR-01、02、03、04、05、06 |
| hello-v23.2.1.json | 12 | F1-HE-01、02、03、04、05、06、07、08、09、10、11、12 | なし |
| pairing-v23.2.1.json | 12 | F1-AU-01、02、03、04、05、06、07、08、09、10、11、12 | なし |
| blocks-v23.2.1.json | 12 | F1-BL-01、02、03、04、05、06、07、08、09、10、11、12 | なし |
| errors-v23.2.1.json | 3 | F1-ER-01、02、03 | なし |
| close-v23.2.1.json | 8 | F1-CL-01、02、04、05、06、08 | F1-CL-03、07 |
| v1合計 | 54 | 46 case | 8 case |
| operations-v23.2.1.json（v2） | 12 | F1-OP-01、02、03、04、05、06、07、08、09、10、11、12 | なし |

TCP側の8 caseは、LF、UTF-8のbyte境界、行の途中／LFなしのEOFが対象です。Scratchのsuiteでは実行せず、PASSにも数えません。
分担先はBridge／toolingです。この変更は、そこで8 caseのrunnerを追加・実行したという返却ではありません。
v2の機能はVMに存在するのでtodoはありません。

## adapterがすること

- `peer_send`は一つのWebSocket messageとして渡します。objectのmember順は比較しません。
- 接続ごとのfixture idと、同じWSS上で続くVMのidを対応付けます。応答は対応する実idへ戻し、pendingや失敗もこの対応で比較します。
- client identityはfixtureの架空値をtestの設定として与えます。HE-02の最小helloでは、許される任意のclient metadataを比較から外します。
- fixtureに`build`が無いv1のhelloでは、成功確認済みbuildの復元の追加を許します。v2のhelloは指定のbuildも比較します。
  v2の初回buildは内部の`_open` optionsへ渡します。未確認のbuildを成功済みsnapshotとして作ることはしません。
- hello／authの通常の流れはVMの`_open`／`_authenticate`が生成します。AU-03の不正な`pairing_id`、AU-04の未知の`token_type`と、
  HE-03の明示params、HE-09／10のclient protocol `24.0.0`は、VMの低層`_request`への入力にします。
  これらは意図した不正値を正しい認証フローが自動生成することを要求するcaseではありません。
- blocks／errors／FR-07／closeの通常requestはVMの`_request`へ渡します。応答の相関、opaqueなerror data、BlockValueを検査します。
  Scratchの表示文字列の整形をF1のwire値と比較しません。
- AU-02の時刻操作はpeerの期限切れのscenarioです。peerの時計を進め、clientの時計は進めずにserverの`pair_expired`を入力します。
  client自身の期限切れはOP-08で別に検査します。
- v2の時計はVMのclockに結びます。時刻を飛ばした位置でtimerを再開し、飛ばした期間のpollを大量に再現しません。
  `receive_idle`は設定した通常requestのtimeout、`pairing_ttl`はpeerの`expires_in`です。実時間のsleepはありません。
- `connect_error`はdial中にerrorを渡します。接続済みと偽ってhelloを先に送らせません。v2のterminalな接続失敗は、testのreconnect予算を0に
  することでpolicyが失敗を確定する境界へ写します。通常の既定値や最初のdialで諦める規則を変更しません。
- `liveness_lost`はブラウザtransportのclose入力へ写します。Bridgeのping probe、Wi-Fiの耐性、検出までの時間はこのcaseの範囲外です。
- 比較はtoolingのv2説明に従い、書かれた行・欄だけです。通知は必要な部分集合、pendingと送信数は完全一致です。
  `previousFlushEpoch`と今のepochから、前のflushの後に接続が変わったかを読みます。

## pairingのTCPとWebSocketは同じ寿命ではない

toolingのBridge `packages/bridge/src/server.ts`を読み、次の違いをadapterへ反映しています。

- persistent TCPで認証errorの後にEOFが来ても、Bridgeはbackendを回収し、WSSは維持します。
- one-shotのpairBegin／pairPollは、完全な最初の応答行を受けるとTCPを退役させ、そのcloseの後に応答をWSSへ返します。
  次のpollは同じWSSと同じSandbox routeで続きます。AU-11のpending応答後のEOFを、ブラウザの切断へ変えません。
- one-shotが応答前にEOFになると、BridgeはWSSを`one_shot_incomplete_response`で閉じます。
  AU-12はこのcloseを渡し、対象pollの完了不明とpending回収のsnapshotで観測を終えます。
- AU-07もtoken破棄のsnapshotで観測を終えます。後続helloの架空の応答を追加してbootstrap全体を完了させません。
- fixtureのauth用TCP `connect`／`client_close`を、WSSの接続・closeへ一律に写しません。IDと送信数は論理TCP区間へ対応付けます。
  OP-08のc1／c2も同じ対応です。これらの比較から、実BridgeのTCP接続本数を検査したとは主張しません。

この分離はFakeWebSocket内のadapterです。実Bridgeのネットワーク経路の検査は別です。
AU-12の先で、同じpairingの次poll、承認、tokenつきhelloまで進む流れは、fixtureの範囲を増やさずVM固有の回帰testで検査します。

## OP-11の観測範囲

VMはentity handle文字列の登録表を持たないため、applicationの古いhandleが属するepochを用意し、read-only eventが
`entity_handles`の失効を知らせることを検査します。Scratchの変数に保存された文字列を消すという主張ではありません。
event cursorはVMの古い値を用意し、切断後にその値が使われなくなることを検査します。

catalog cacheのadapterは非同期IOの完了を保留し、実装が新helloのhashで照合し直すこと、古いcatalogを現在値にしないことを観測します。
F1の架空hashだけから正しいcatalog本文を作ることはせず、本文の取得と検証をこのcaseのPASSへ含めません。
cacheの本文検証とnetwork fallbackはVM固有の回帰testで別に検査します。

## 実行

repoのrootでfixtureを取得した後、VMのディレクトリで実行します。

```sh
npm run tooling:fixtures
cd packages/scratch-vm
../../node_modules/.bin/tap --disable-coverage test/unit/mcremote_bootstrap_fixture_identity.js test/unit/mcremote_bootstrap_browser.js
```

identity testのschema合格は、対話の再生PASSとは別です。直接TCPのfixture再生、実Paperとのpulse、ブラウザ実機でのUXは、
この決定論的testのPASSには含みません。
