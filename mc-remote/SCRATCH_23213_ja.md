# Scratch 2321.3の変更

根拠はknowledge `fdc3c8c9b34d026cbe76a51d0789ba02858f05c6` の
[`00-hub/scratch-23213-instructions_ja.md`](https://github.com/Naohiro2g/mc-remote-knowledge/blob/fdc3c8c9b34d026cbe76a51d0789ba02858f05c6/00-hub/scratch-23213-instructions_ja.md)。

2026-11-16にhuman ownerと相談し、並びは「チャット、ブロック、プレイヤー、エンティティ、看板、パーティクル、音、雷、イベント」。
接続と建築設定は前に置き、地面の高さはブロックの組へ入れます。
ほかの具体案への返答は「良いと思います。異論なし。」です。

- ペアコード・ペアリングコマンド・ペアリングできたときはパレットから外し、opcodeと処理を残します。
  保存済み作品を読み込み、hatからcode/commandを変数へ代入するVMテストで互換性を確認します。
- miniは未対応methodと、世界・建築範囲の外、設置数上限の原因と数値を表示します。
  座標は世界の絶対座標、技術的なmethod/code/reasonは詳細です。
- 接続前に未対応ブロックを隠す案は採りません。method_not_foundを受けて説明します。
  新reasonに接続のやり直しを促す案内やDEBUG切替の追加案内をしません。
- hello.serverは相手が申告したname/versionだけを扱い、旧McRemoteの種別をhostから推測しません。
  独立WireScopeはtoolingの対応した版と組で使います。
- 案内は「接続先のチャット」「ブロックをカタログから選ぶ」へ一般化し、MinecraftのIDや次元名は維持します。
- ブロック一覧の分類には各blockの`targets: ["unity"]`、追加検索語には`keywords`を使います。
  対応methodが確定するまでUnity対象の値は設定せず、一覧を公開しません。過去版の生成物は変更しません。

ホームページは生成された版別一覧を取り込みます。ホームページやStackのソース・配備はこの変更に含めません。
2321.2候補は別branchで保持し、書き換えません。
