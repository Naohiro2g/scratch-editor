# 2321.2.0のUnity箱庭への分類

knowledge `890945bebd45061d4013e77675a4fd0425ced272` の
`00-hub/23212-gate-candidate-instructions_ja.md`「範囲を広げた後の候補（2026-11-17）」に基づきます。

分類の基準は凍結の入力になったUnity箱庭候補
[`be17313007155227a46098e7b8c85c381a0dd3f3`](https://github.com/Naohiro2g/mc-remote-unity-sandbox/tree/be17313007155227a46098e7b8c85c381a0dd3f3)です。
knowledgeのUnity READMEには追加前のmethod一覧が残っているため、候補の実装を直接読みました。

- `server/src/Code2Create.UnitySandbox.Server/Rpc/SandboxRpcSession.cs`：helloとpairBegin／pairPoll、ペアリングした画面のチャットをイベントへ渡す登録。
- `server/src/Code2Create.UnitySandbox.World/JsonRpc/SandboxJsonRpcDispatcher.cs`：建築・取得・高さ・プレイヤー・catalog・chat・events・flushの振り分け。
- `server/src/Code2Create.UnitySandbox.World/SandboxEventRing.cs`：`chat_posted`の生成とpoll。

## 対象method

| 用途 | method |
| --- | --- |
| 接続 | `hello`, `auth.pairBegin`, `auth.pairPoll` |
| 建築設定 | `build.setDimension`, `build.setOrigin`, `connection.flush` |
| ブロック | `world.setBlock`, `world.setBlocks`, `world.getBlock`, `world.getBlocks`, `world.getHeight` |
| プレイヤー | `player.getPos`, `player.setPos`, `player.getPose`, `player.setPose`, `player.getDirection`, `player.setDirection` |
| カタログ | `catalog.get` |
| チャット・イベント | `chat.post`, `events.poll`（`chat_posted`） |

`content.json`の`targets: ["unity"]`は27ブロックです。
上記methodのブロックに、対応するブロック情報・エラー判定・チャットイベント情報・受信状況のローカル読み取りを含めます。
検索では`Unity`、`Unity箱庭`、`ユニティ`を対象の追加検索語に展開します。

オーバーワールドのみ、カタログはブロックID、イベントはチャットが対象です。
`events.poll`を受けることだけから、ツルハシや飛び道具のhatを対応にはしません。
看板・エンティティ・パーティクル・音・雷、その情報や設定だけを作るブロックも含めません。
一覧の分類であり、接続前に実行ブロックを隠したり、通信の判定を変更したりしません。
過去版の一覧は変更しません。
