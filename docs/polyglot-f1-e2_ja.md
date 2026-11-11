# Scratch：F1の固定とE2の差分

根拠はknowledge `076a127a22eaf0188c1d13822bfd55bfeee9ec38`の
[依頼票](https://github.com/Naohiro2g/mc-remote-knowledge/blob/076a127a22eaf0188c1d13822bfd55bfeee9ec38/00-hub/polyglot-f1-e2-repin-instructions_ja.md)の共通・Scratch、
DECISIONS `2026-11-11-01`／`2026-11-12-01`、wire §3.4／§6.2／§6.5、Protocol InventoryとScratch execution modelです。
読取基準はdevelop `dc2840ba3c5c9d6938555ed737bc199acca2586e`です。

Scratchの特則に従い、F1の対話をtestへ接続すること、block／pairing hat／表示を変えること、③⑤の実装は案として返します。
今回の実装はfixtureの取得元固定と整合性検査、表示を保てる内部修正に限ります。

## 取得元と検査

`mc-remote/tooling-lock.json`の`fixture_source.commit`を
`21a2a9a0aed8b4d9c715da46616aad86f1174b4c`から、指定された
`36ebe9e63e4f0afcf949eae998832f68209b8119`へ固定し直しました。
新しいopsのmerge commitへは代用しません。Bridge／WireScopeの`source.commit`と配布物の固定は変更しません。
既存16 entryのbytesとSHA-256は同じです。F1六本とv1 schemaを追加し、全23 entryを取得・検査します。
取得cacheはGit管理外で、取得scriptがlockのbytesとSHA-256を検証して書きます。
MITのLICENSEも同じ場所へ取得します。LICENSEは1,070 bytes、SHA-256
`aa329a0bafc839b95124306141db13a381de45818bf629e983c44ea55ab5a7fb`で不変です。

`mcremote_bootstrap_fixture_identity.js`はF1六本、schema、block-value、LICENSEのbytesとSHA-256をlockと比較し、
六本のschemaとcase数も検査します。これは対話の再生ではありません。

| file（`client-bootstrap-`以下） | case数 | VMでの対話再生PASS |
| --- | ---: | ---: |
| framing-v23.2.1.json | 7 | 0（未接続） |
| hello-v23.2.1.json | 10 | 0（未接続） |
| pairing-v23.2.1.json | 10 | 0（未接続） |
| blocks-v23.2.1.json | 12 | 0（未接続） |
| errors-v23.2.1.json | 3 | 0（未接続） |
| close-v23.2.1.json | 6 | 0（未接続） |
| 合計 | 48 | 0 |

全caseのschema検査に成功したことを、48caseのclient実行PASSとは数えません。skipで合格とする仕組みも追加しません。
既存10本を使うVM／GUI testは継続します。fileごとのbytesとSHA-256はlockと返却票を参照してください。

## ②④⑦⑧と非互換helloの差分

| 決定 | 変更前 | 差分と今回の扱い |
| --- | --- | --- |
| ②close時の全pending | closeで全pendingをrejectしMapをclearする。ただしWebSocketのclose code／reasonを同じErrorで渡す | 全回収は既存で合致。client側の完了不明と分かる`origin: client`／`completionUnknown: true`をpendingのErrorへ追加。code／reasonの完全分離は表示とdedupeに影響するため案に残す |
| ②socket error | openのPromiseをrejectするが、既に接続済みのpendingは後のclose eventまで残る | error eventでpendingと送信待ちを回収し、socketを閉じるよう修正。pendingはclient側の完了不明。接続自身のdiagnosticや失敗とは別Errorへコピーし、接続開始の失敗まで完了不明と決めない |
| ②LFの無い末尾 | ScratchはTCP framingを持たず、WebSocket messageをJSONとして読む | TCP側のLFの規則をWebSocketへ持ち込まない。Bridge／tooling側の検査と分ける |
| ④自動再送しない | 通常requestの自動再送は無い。pair poll／event pollは別request、送信buffer待ちは同じ操作を送る前の待機 | 合致、変更無し。切断時の回帰でも余分な送信が無いことを検査 |
| ⑦tokenなしhelloへ戻る | 認証reasonでtokenを破棄すると直ちにPAIRINGへ進む | AU-08／09と違う。認証を強制しないserverではpairing表示とhatの発火が変わるため、今回は直さず下記の案を返す |
| ⑦一試行で一度だけpairing | `_authenticate`は一度だけpairingし、続くhelloが拒まれたら再度pairingしない | AU-10の一度だけという点は合致。token破棄はtarget単位のまま |
| ⑧client判断のpairing期限切れ | pendingのpoll応答後だけ期限を調べ、`Error('pair_expired')`で失敗する。code／reasonは作らない | server errorを作らない点は合致。判断元と同じ意味の案内は未整備で、次pollの前にも期限を調べない。hat／表示に関わるため案に残す |
| 2026-11-12-01 | 非互換の成功形helloは失敗にし、後続commandをguardするがsocketは開いたまま | clientがsocketを閉じるよう修正。接続Promiseの失敗と既存の`protocol_mismatch`のERROR観測を保ち、closeがそれを上書きしない |

修正前のsourceで、追加したsocket error全回収・close待ち不要・非互換hello後closeの3つのunitが意図した理由で失敗し、
修正後に通ることを確認しました。F1の入力を直接再生したものではなく、browser側の既存FakeWebSocket harnessでの回帰です。

### code／reasonの分離を残す理由と案

pendingへ渡すclose Errorからcode／reasonを除く試行では、既存の送信queue飽和testで配信失敗の案内が二重になりました。
mode変更を待つflushの失敗と、まだ送れていない登録の失敗が、現在は同じ配信失敗として一度だけ表示されるためです。
この票では表示を変えない指示があるので、code／reasonの分離を完成したとは返しません。

次は、transportのdiagnosticを接続の観測に保ち、pendingのlocalな完了不明と未送信を別に扱い、表示層のdedupeもそれに合わせる案です。
`remoteErrorText`等の既存reporterの結果と、actionable errorの表示をどう投影するかをownerが判断してから実装します。
言語固有の失敗にserverのcode／reasonを作らないことは変更しません。

## F1をtestへ接続する案

接続する案を推します。ただし、直接TCPの対話をそのままVMへ入力する方式にはしません。

| 層 | case数の案 | 対象 |
| --- | ---: | --- |
| VMのJSON-RPC／hello／認証／送信queueをFakeWebSocketで検査 | 41case相当 | FR-07の相関、hello10、pairing10、blocks12、errors3、closeのうちCL-03以外5 |
| Bridge／toolingのTCP側 | 7 | FR-01〜06のbyte境界とLF、CL-03の途中の行でのEOF |

VMではone-shot hintを外したJSON-RPCを比較し、client metadataや採番はadapterで対応付けます。
WebSocketの1 message＝1 JSONを保持し、TCPのbyte chunkをWebSocket messageへ読み替えません。
41caseは元の対話をそのまま実行したPASSではなく、browser側へ意味を写したcaseの案です。そのcoverageを同じF1 IDのPASSとして
数えるかはcoordinatorと合わせる必要があります。

特にAUのTCP `connect`／`peer_eof`は、Bridgeが持つplugin側の一時TCPと、Scratch側のWebSocketの寿命が異なります。
これを全部WebSocketのcloseへ変えると、現在のone-shot pairingの契約を検査できません。接続IDとid採番のadapterを明示し、
どの境界を検査したかを返す案です。AU-02はserverが期限切れを返す経路として残し、client判断の期限切れとは時計・入力を分けます。
fixture自体を誤りとは判断していません。

## 直さなかったblock／hat／表示の案

### ⑦の認証フロー

保存tokenが認証reasonで拒まれたら対象のtokenだけを捨て、tokenなしのhelloを試します。`auth_required`の後だけpairingへ進み、
tokenなしで成功した場合はpairing表示もpairing完了hatも出さない案です。一試行に一度だけという上限は維持します。
pairing後のhelloが再び認証reasonで拒まれたら、tokenを捨てて失敗を返し、二度目のpairingはしません。

今はpair pollのokでtokenを保存したときにhatを発火し、続くhelloの成功を待ちません。その時機を今回勝手に変えず、
この流れでのhatと接続状態の表示をownerに判断してもらいます。

### ⑧の期限切れ

次のpollを送る前にもclientの期限を調べます。localな期限切れには判断元と同義の案内を表す内部属性を持たせ、serverの
code／reasonは作りません。server由来の`pair_expired`とは観測で見分けられるようにする案です。
期限を過ぎてpollを始めないことと、終了後のペアコード・接続状態の表示を合わせます。既に送ったpollの有効なokが遅れて届く場合の
優先やhat発火の境界は、この票で新しく決めません。

認証の流れは今回変更していないため、依頼の「認証の流れを変えたら」の実McRemote pulseは行いません。
案の実装が承認されたときは、その変更後にhello→setBlock→getBlockのpulseを実施します。人の承認が要る場合は、その直前で止めて
手順を返します。今回、接続先やcredentialを収集・公開したものはありません。

## ③⑤：現状と次票へのAPI案

| 対象 | 現状 | 案（未実装） |
| --- | --- | --- |
| 通常request timeout | 応答待ちのtimeoutは無い。送信bufferの待機だけ5秒の上限と4msのpollがある。pair poll間隔は1秒 | 内部connection policyに`requestIdleTimeoutMs`。通常requestに共通で、`_request(method, params, options)`の任意optionsで延長できる形。既定値は実測で決め、flush専用に分けない |
| 生存確認 | WebSocketのerror／closeは検出する。無応答やidleのwatchdogは無い | 応答待ちのtimeoutとは別にtransportの生存確認を持つ。browserで使える仕組み、Wi-Fiへの待ち方と値は次票で決める |
| 再接続 | 次のcommandで自動接続せず、明示の「接続する」が必要。`_openPromise`は明示接続の重複をまとめるだけ | 内部policyの`autoReconnect`を既定で有効にし、無効にもできる。切断後の次の呼び出しで一つの再接続Promiseを共有。待つ間隔は言語で選ぶbackoffにjitterを加える |
| build | closeで`_buildContext`を消す。明示再接続のhelloはserver既定へ戻る | 最後に成功したdimension／originのsnapshotを接続中のcontextとは分けて保持し、次helloのbuildへ入れる。未確定setterを再送・復元しない |
| 完了不明と未送信 | 未接続は`not_connected`、切断はtransport由来Error。新しい内部属性をpendingに付けても、表示の投影は従来のまま | 内部の`McRemoteCompletionUnknownError`／`McRemoteNotSentError`という別の分類。名前は案で、blockに新しい例外を露出させない。server reasonを作らない |
| applicationへの知らせ | 接続statusと既存observationはあるが、再接続専用の知らせは無い | read-onlyの接続eventをruntimeへ出す。再接続、epoch変更、event loss、server／session変更、flush境界変更を意味として伝える。具体的なイベント名とUIは次票で判断 |
| FASTとflush | 同じ接続のflush。再接続後の旧FASTとの関係を表示する仕組みは無い | 接続epochを管理し、新flushが旧FASTを保証しないと利用者に分かるようにする。UI／blockの投影はowner判断 |
| 認証とcache | 初回接続は現在の認証フロー。catalogはhelloのhashに一致した後だけ利用 | 再接続では版とcatalogHashを照合し直し、古いhandle／cursorを失効させる。再認証が必要なら自動pairingに進まず止めて知らせる |

このpolicyやoptionsは案です。runtime configのschemaや公開blockを今回追加せず、③⑤の実装開始は次の票を待ちます。

## Protocol Inventoryの行の前と後

- 前：取得元21a2a9a、既存10本をVM／GUIの用途別に使う。全case再生ではなく、F1は無し。
- 後：取得元36ebe9e。既存10本の利用を維持し、F1六本48caseとschemaを取得してbytes／SHA-256・形・件数を検査。
  F1の対話再生は未接続（PASS 0）。browserへの41case相当の接続案と、TCP側7caseの分担を返した。
