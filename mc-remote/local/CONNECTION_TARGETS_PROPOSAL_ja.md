# 接続先一覧・移行・LAN設定画面の案

実読knowledge：`33093890ba6968a74e94ad6c37b1afdc900049b1`、
`00-hub/bridge-connection-targets-instructions_ja.md`。この文書の未決定項目はhuman ownerの採用判断前の案です。

## 一覧の入力

ファイル名の案は`connection-targets.json`、形式はtoolingの`schemas/connection-targets-v1.schema.json`です。
Stackでの入力・生成・配備はこの変更に含めません。LANランチャーは同じ形式を`settings.json`へ保存します。

```json
{
  "schema_version": 1,
  "default_target_id": "minecraft",
  "targets": [
    {"id": "minecraft", "label": "Minecraft", "host": "127.0.0.1", "port": 25575},
    {"id": "unity", "label": "Unity箱庭", "host": "127.0.0.1", "port": 25585},
    {"id": "classroom", "label": "教室", "host": "server.example", "port": 25575}
  ]
}
```

- IDは英数字で始まる64文字以内の英数字・`.`・`_`・`-`。IDを重複させず、既定は一覧の一件にします。
- labelは空白だけを不可とし、hostはURLではなくホスト名またはIP、portは1〜65535の整数とします。
- endpointや表示名が同じでも、別IDを登録できます。tokenと選択の保存はIDで分離します。
- IDはhost・port・labelの編集で変えません。削除後に追加した接続先には別IDを発行します。

## queryと旧版の移行

`?sandbox=`の名前は維持し、新方式では値をIDにします。JSON-RPCのwireとhelloのprotocolは変更しません。
Bridgeは`BRIDGE_TARGETS_FILE`で一覧を読み、一覧外のID／host／host:portを拒否します。
旧環境変数だけのBridgeは従来のhost＋共通port方式です。旧設定と新ファイルの混在は起動エラーです。

Scratch runtime configは新方式を`schema_version: 2`とし、`default_target_id`と
`connection_targets: [{id, label, host, port}, ...]`を渡します。新Scratchはv1とv2を読み、v2のrouteはIDになります。
旧Scratchはv2を拒否して接続を無効にするため、IDをhostとして誤解して接続しません。
新方式のScratchは、ID対応のBridgeとv2設定を組にして使います。
旧ScratchをID対応Bridgeへ段階移行する場合は、IDの構文に収まる既存host名と同じIDを明示登録する案があります。
任意の旧host名へ自動でfallbackする入口は作りません。

新しいtoken保存は`mcremote.sessionToken.v2:<id>`とし、v1のhost単位のtokenを自動コピーしません。
同じhost名がIDと偶然一致したり、別portのサーバーを併設したりする場合の混同を避けるため、移行時は再ペアリングします。
選択中の接続先は引き続きブラウザ内へ保存します。削除済みのIDなら既定へ戻します。

## LAN設定画面

初回はMinecraftとUnity箱庭の二件を表示し、hostはどちらも127.0.0.1、portは25575／25585とします。
表示名、host、port、既定を編集でき、追加・削除に対応します。IDは画面で直接編集させません。
「接続先を追加」は新しいIDを発行し、既存行の編集はIDを保持します。
一覧の編集はScratchタブを閉じてから行い、保存後はBridgeを再起動してScratchを開き直します。
Scratch内の一覧を選び替えた後、「接続する」を実行すると、旧接続を閉じて新しいIDへ接続します。ランチャーの設定編集やBridgeの再起動は要りません。
未完了の命令は新しい接続先へ再送しません。旧ペアリング・再接続待ちの処理は新しい接続先を使わず終了します。接続先を選び替える前に実行中の作品を止めてください。

旧settings.jsonは単一のhost・portを保持した一件（ID=local）へ読み替えます。
旧ファイルは次回の保存までは変更せず、初回既定のUnity行を旧環境へ無断追加しません。
移行後にUnityを追加する場合は設定画面の追加操作を使い、表示名と25585を入力します。

## 配布物と人間試験

新しいBridge候補をtooling CIから固定し、LANパッケージもそのBridgeと新しいScratchで作り直します。
旧Bridgeを含むZIPに、新ランチャーだけを差し替えて使う組み合わせは対象外です。
初回stableのtag／Release／配布物、稼働中の試作ピッカー、公開環境は変更しません。

人間試験では同じPCでMinecraft（25575）とUnity（25585）を起動し、LANの二件を選び分けます。
各接続先でペアリング・建築を行い、切り替え先のカタログと実際の設置先が一致すること、
片方のtokenで他方へ認証されず、戻った接続先の認証が保持されることを確認します。
Windows／macOS／Linuxの完成ZIPと実サーバーを組み合わせた確認は、決定論的テストでは代替しません。
