# Scratch：応答待ちと再接続（E2）

根拠はknowledge `125812b47bae32120f56febc4d30058ab0fe8248`の
[共通・Scratchの依頼](https://github.com/Naohiro2g/mc-remote-knowledge/blob/125812b47bae32120f56febc4d30058ab0fe8248/00-hub/polyglot-e2-reconnect-instructions_ja.md)、
wire §3.4／§6.5、決定`2026-11-11-01`／`2026-11-12-01`／`2026-11-12-05`です。

## 内部APIと待ち方

VM拡張の`constructor(runtime, connectionPolicy)`の第2引数は内部の接続方針です。Scratchのblock、保存する作品、deploymentの
runtime configへ設定項目を追加しません。省略時の値は次のとおりです。

| 項目 | 既定 | 理由 |
| --- | ---: | --- |
| `requestIdleTimeoutMs` | 900,000ms（15分） | 大量建築のFIFO待ちや一時的な通信停止に長く耐える。TypeScriptの暫定値とも比較できる長さ。通常処理の速度を表す値ではない |
| `autoReconnect` | `true` | 一度接続した後は、次の呼び出しで再接続する。初回接続は既存の接続blockで行う |
| `connectTimeoutMs` | 60,000ms | WebSocketが開かない試行を回収する。通常requestの応答待ちとは別 |
| `reconnectInitialDelayMs` | 500ms | 最初の再試行の間隔の基準 |
| `reconnectMaxDelayMs` | 30,000ms | 間隔を倍にして延ばす上限。0.5〜1.5倍のjitterを加えた後もこの上限で抑える |
| `reconnectTimeoutMs` | 300,000ms（5分） | 接続試行が失敗した後、再試行を開始し続ける期間。進行中のhelloの応答待ちは15分の方に従う |

これらは実ネットワークの実測で較正した値ではありません。仮想時計で、最後の受信による数え直し、呼び出しごとの延長、
上限到達時の全pending回収、再試行間隔と終端を確認しています。Wi-Fi、端末のsleep、proxyのidle上限は別に測る必要があります。

`_request(method, params, {requestIdleTimeoutMs})`で、その呼び出しの待ちを既定より長くできます。応答待ちがある間だけtimerを持ち、
接続で最後に受信した時から数えます。待っている呼び出しに延長があれば、その最長の値を接続の上限として使います。
長くidleだった接続の新しい要求は、送信した時から待ち始めます。上限に達したら全pendingを失敗にし、接続を閉じます。
`connection.flush`も同じ方針です。browserの送信bufferを待つ既存の5秒の上限とは別です。

## 失敗と認証

送信済みで応答を失った要求は`McRemoteCompletionUnknownError`（`origin: client`、`completionUnknown: true`）、
未送信の要求は`McRemoteNotSentError`（`origin: client`、`notSent: true`）です。どちらにもtransportやserverの`code`／`reason`を
作りません。接続epochを持ちます。再接続の失敗には、内部の`localReason`と元の`cause`を持たせ、認証の操作が必要な場合と
版不一致を区別します。serverから受けたJSON-RPC errorの`code`／`data`／`reason`は、そのまま保持します。

WebSocketのclose code／reasonは、接続の`transportDiagnostic`と接続eventに残します。要求の失敗の表示が`lastError`を更新しても、
接続のdiagnosticは残ります。ローカルな配信失敗の表示は`deliveryFailure`で既存の案内へ投影し、同じ接続の案内を一度にまとめます。
server由来のbackpressureの案内は、ローカルの配信失敗と区別します。

明示の接続では、保存tokenが認証reasonで拒まれたら、その接続先のtokenだけを捨ててtokenなしのhelloへ戻ります。
`auth_required`の後だけpairingへ進みます。tokenなしで成功したらpairingの表示も完了hatも出しません。
pairingは一試行に一度だけです。tokenを保存した時にはhatを出さず、続くhelloの成功後に既存の完了hatを発火します。

pairingの期限は通常requestの待ちと別です。次のpollの前にも調べます。clientの期限切れは`localReason: pair_expired`で、
serverの`code`／`reason`を作りません。接続の観測で判断元を区別できます。案内はserverの期限切れと同じ既存のエラー案内です。

## 再接続の境界

- 一つのVM拡張は、同じJavaScript実行環境で同時に走る複数の呼び出しから使えます。一つの再接続Promiseを共有します。
  Web Workerや別threadへVM objectを共有する仕組みは追加しません。
- 接続が切れた後の新しい呼び出しで、保存tokenつきhelloから始めます。最後に成功を確認したdimensionとoriginだけを戻します。
  応答を失ったsetterや、古い送信queueを再送しません。`autoReconnect: false`なら未送信で失敗にします。
- 再接続で認証の操作が必要なら、pairingへ進まず未送信で止めます。版が合わなければ閉じて失敗にします。
- helloでcatalogHashを照合し直します。古いcatalog、event cursor、実行中のevent contextは接続境界で無効になります。
  entity handleはserverの接続に属する文字列です。古いepochのhandleが無効なことを接続eventで知らせます。
  Scratchの変数に保存した文字列を消す処理はありません。
- FASTで送信したepochを追い、新しい接続のflushが古いFASTを保証しないことを接続eventに含めます。build modeは自動再接続で維持します。
- 古いsocketのevent、bootstrapの失敗処理、送信buffer待ちの完了が、新しい接続や同じidの新しいpendingを回収しないよう、
  接続試行とpendingの同一性を確認します。

runtimeの`MCREMOTE_CONNECTION_EVENT`は、コピーした入れ子の値までread-onlyです。主な種類は`disconnected`、`reconnected`、
`request-failed`、`flush`です。epoch、旧／新hello、server／session／catalogHashの変更、event loss、失効した能力、
flushが対象外とするepochを伝えます。この票では新しいblock、hat、画面表示を追加しません。

### pairing中の接続回収

Bridgeのone-shotは、pairBegin／pairPollの応答後にplugin側TCPを回収しても、WSSを保ちます。次のpollは同じrouteへ送れます。
応答前のTCP EOFではBridgeがWSSを閉じます。そのpollを完了不明で終え、期限内なら新しいWSSで同じ`pairing_id`の次pollを送ります。
応答を失ったpollの再送ではありません。続いたpollが`pair_not_found`等で拒まれたら二度目のpairingはせず失敗にします。
新しいWSSを開けない場合も期限で終えます。

通常のplugin TCPが閉じてもBridgeがWSSを保つ場合、VMはそのEOF自体を直接観測できません。新しいbackendから
`expected_hello`が届いたら、wire §7.3でserverが閉じると規定された接続として回収します。そのerrorを受けた要求はserverの拒否を
そのまま返し、ほかのpendingは完了不明で終えます。要求を再送せず、その次の呼び出しで新しいhelloを行います。
この境界を実機のPaper再起動の成功と読み替えず、VM固有の回帰で確認します。

### browserの生存確認

browserのWebSocket APIからTCP keepaliveやpingの間隔は設定できません。VMはclose／errorと、pendingがある間の無受信timerで
回収します。何も送受信せず、close／errorも届かない切断を、VMだけで直ちに見つけられるとは主張しません。
通常のScratchではevent pollもありますが、それを独立したtransportのpingの代わりとは扱いません。

## 検証

[F1の分担とadapter](polyglot-f1-browser_ja.md)にcase ID、低層APIで試すcase、TCPとの分離を書いています。
取得元はtooling `335c604f859d6dfad04f0434bfa4eb6445761430`です。v1はbrowser側46 case、TCP側8 case、v2はbrowser側12 caseです。
identity／schemaの検査と、対話の再生を別に数えます。Bridge／WireScope配布物の固定は変更しません。

VM固有の`mcremote_reconnect.js`で、F1-AU-12の先（同じpairingの次pollからhello）、同時呼び出し一回の再接続、
期限、未送信、backoff、古いbootstrap／pendingの後処理、catalog本文の再検証とnetwork fallbackを確かめます。
GUIの`vm-listener-hoc`のtestは、完了不明と未送信の配信失敗を同じ既存の案内へ投影することを確かめます。

実McRemote向けには`scripts/pulse-mcremote-reconnect.cjs`を用意しています。入力の接続先、token file、試験する場所はprivate fileへ
置き、公開の返却へ含めません。`--hello-only`は設置しません。通常はhello→元の値の保存→setBlock→getBlock→元の値の復元と照合です。
承認が必要ならその前で止めます。失敗時に復元が未確認ならprivateなrecovery fileを残します。
`--reconnect`はPaperの停止・再起動を人が行ってから次の呼び出しと再接続eventを確かめる手順です。
実機pulseの成否は、決定論的testの合格から推定しません。

## human ownerへ返す表示の案（未実装）

1. 接続状態欄で、再接続したことと「切れている間のイベントは受け取れていない」ことを知らせる。WireScopeにも同じepoch境界を渡す。
2. FASTの後で接続が変わった場合、flushの成功とは別に、前の接続の設置結果は未確認と知らせる。既存の成功表示だけで保証したように見せない。
3. 学習用blockで必要なら「接続し直されたとき」のhatやepochのreporterを検討する。entity handleは取り直す案内と組にする。

### Bridgeのpingの案（未実装）

BridgeからWebSocket pingを送り、十分長いpong待ちで回収する案です。browserはprotocolのpongに自動応答します。
pingの間隔や待ちの値は、Wi-Fiの一時切断、端末のsleep、Caddy／NATのidle上限、WireScopeを併用した実測で決めます。
これはScratch–Bridge区間の生存確認であり、Bridgeの先のMcRemoteの進行を保証しません。通常requestを同じFIFOへ追加して
pingの代用にはしません。Bridgeの変更と値の採用はこの票で決めず、coordinatorへ返します。
