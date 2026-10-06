# このリポジトリの Scratch クライアント実装

この文書は、マイクラリモコンのクライアントとして Scratch エディターがどのように動くかを、コードの場所から案内します。使い始める方は[マイクラリモコン版の案内](../README_mc-remote.md)へ。プロジェクト全体の構成や運用設計は[公式サイト](https://mc-remote.com/)と[knowledge リポジトリ](https://github.com/Naohiro2g/mc-remote-knowledge)を参照してください。

## 1. Scratch の命令はどこへ届くか

```text
Scratch の画面（scratch-gui）
    ↓ ブロックを実行
仮想マシン（scratch-vm）のマイクラリモコン拡張
    ↓ 通信
中継（Bridge）
    ↓
マインクラフトサーバー上の McRemote プラグイン
    ↕ ペアリングで結び付ける
同じマインクラフトサーバーに入っているプレイヤー
    ↑ ゲームの接続
プレイヤーの Minecraft クライアント

ワイヤースコープ（WireScope）は、通信を読み取り専用で観察する別画面
```

Scratch エディターはマイクラリモコンのクライアントで、Bridge を経由して McRemote プラグインへ接続します。プレイヤーが遊ぶ Minecraft クライアントとは別の接続で、マインクラフト本体の通信形式は使いません。二つの接続はペアリングで結び付き、Scratch の命令はペアリングしたプレイヤーに結び付けて実行されます。

ブロックの形と動作、接続画面、通信の中継、観察画面は、それぞれ別の場所にあります。見たい現象を一つ選び、この流れに沿って追うと変更箇所を絞れます。通信形式の正本は[knowledge の設計文書](https://github.com/Naohiro2g/mc-remote-knowledge/tree/main/10-protocol)です。

## 2. このリポジトリのコード地図

### 2.1 Scratch 本体の中にある変更

上流の Scratch エディターは主に `packages/` にあります。このフォークでは、その一部にもマイクラリモコンのコードを加えています。

| 場所 | 役割 |
| --- | --- |
| [`packages/scratch-vm/src/extensions/scratch3_mcremote/`](../packages/scratch-vm/src/extensions/scratch3_mcremote/) | ブロックの定義と実行、McRemote プラグインとの通信 |
| [`packages/scratch-gui/src/lib/blocks.js`](../packages/scratch-gui/src/lib/blocks.js) | エディターに表示するブロックの並び |
| [`packages/scratch-gui/src/lib/mcremote-runtime-config.js`](../packages/scratch-gui/src/lib/mcremote-runtime-config.js) | 配信時に渡す接続設定の読み取り |
| [`packages/scratch-gui/src/components/wire-scope-panel/`](../packages/scratch-gui/src/components/wire-scope-panel/) | 接続・ペアリングの表示と観察画面への入口 |
| [`packages/scratch-gui/src/lib/mcremote-wirescope-source.js`](../packages/scratch-gui/src/lib/mcremote-wirescope-source.js) | Scratch の接続をワイヤースコープへ渡す処理 |

ブロックは Scratch の仮想マシンに組み込まれています。サーバーに後から追加するプラグインではありません。マインクラフトサーバー側の `McRemote` プラグインは[別リポジトリ](https://github.com/Naohiro2g/McRemote)にあります。

エンティティの操作では、生成ブロックが変数へ入れたハンドル、または近くのエンティティを調べるブロックがリストへ入れた情報を使います。リストの各情報からハンドル・種類・座標を取り出せます。姿勢の取得は一度に次元・座標・向きを読み、姿勢の情報ブロックで各値を取り出します。取得した情報はその時点の値で、情報を読むだけではサーバーへ再問い合わせしません。移動と除去はハンドルを指定して実行します。

パーティクルの生成ブロックには、パーティクルIDのほか、表示先を選ぶパーティクル情報ブロックをつなげられます。表示先は近くのプレイヤー全員、または接続したプレイヤーだけです。ダストはRGBと大きさ、ブロックのパーティクルはブロックIDと状態を指定します。

音は、サウンドIDを指定するブロックと、指定したブロックの設置・破壊などの音を鳴らすブロックがあります。どちらも座標と省略可能な音の設定を受け取ります。音の設定ブロックでは音量を0〜1、高さを0.5〜2の数値（`pitch`）または`N0`〜`N24`（`note`）で指定し、再生先を近くのプレイヤーか接続したプレイヤーから選びます。空欄は既定値に任せます。音名から`N0`〜`N24`への換算はScratchのプログラム側で行います。

「カタログの［ブロックID／エンティティID／パーティクルID］を［リスト］に入れる」は、接続先から取得したカタログのIDを名前空間付きの文字列として、辞書順でリストへ入れます。リストは一覧全体で置き換わります。接続直後のカタログ取得が進行中なら、その完了を待ちます。取得できない場合は案内を表示し、元のリストを保持します。コピーのための追加通信はありません。

ブロックピッカーは、日本語では`gold_block 金ブロック`のようにIDと名前を並べ、英語名も表示します。検索はブロックID・日本語名・英語名を対象とし、空白で区切った語をすべて含む候補を表示します。名前はMinecraft 1.21.11／26.2の[表示・検索辞書](../packages/scratch-gui/src/lib/mcremote-block-names/README_ja.md)を同梱し、利用時の追加取得はありません。選択できるブロックは接続先のカタログにあるものだけで、ブロックへ入れる値はIDと状態です。

### 2.2 共通ツールとの関係

Protocol、WireScope、Bridgeのソースとowner testは、[minecraft-remote-tooling](https://github.com/Naohiro2g/minecraft-remote-tooling)にあります。Scratchは、その共有fixtureと生成物を利用します。

| 場所 | 役割 |
| --- | --- |
| [共通ツールのprotocol](https://github.com/Naohiro2g/minecraft-remote-tooling/tree/main/packages/protocol) | 通信の型・定数と共有fixture |
| [共通ツールのbridge](https://github.com/Naohiro2g/minecraft-remote-tooling/tree/main/packages/bridge) | ブラウザとMcRemoteプラグインの間の通信を中継 |
| [共通ツールのlive](https://github.com/Naohiro2g/minecraft-remote-tooling/tree/main/packages/live) | 共通のWireScope画面と観測schema |
| [`tooling-lock.json`](tooling-lock.json) | このScratch sourceが使う共通ツールのcommitと生成物のidentity |
| [`block-reference/`](block-reference/) | Scratchブロック一覧ページの試作と生成元 |

Scratch拡張は仮想マシンへ組み込まれており、protocol packageを直接importしません。Scratch固有の観測feedと起動UIも、このリポジトリに残ります。

### 2.3 開発・ビルド・取得

ルートの `npm run build` はScratchの各workspaceをビルドし、画面の静的ファイルを `packages/scratch-gui/build/` に出します。[ショーケース](https://naohiro2g.github.io/scratch-editor/)は接続を無効にした別の配布物です。

VM／GUIのMcRemoteテストを実行する前に、共有fixtureを取得してください。

```sh
npm run tooling:fixtures
```

このコマンドは `tooling-lock.json` の固定commitから13件のfixtureを取得し、bytesとSHA-256を検査して `mc-remote/tooling/fixtures/` に置きます。このdirectoryはGit管理外の取得キャッシュです。fixtureを変更するときは共通ツール側で変更し、Scratch側で取得元を更新します。

WireScopeとBridgeの生成物が必要な場合は、GitHub CLIの認証後に実行します。

```sh
npm run tooling:artifacts
```

固定したActions artifactからWireScope ZIP・detached manifest・Bridge OCI archiveを取得し、digest、ファイルのidentity、source provenanceを検査します。取得先は `mc-remote/tooling/artifacts/` です。Linux／macOSの `gh`、`unzip`、`tar` が必要です。Actions artifactには保存期限があるため、期限切れなら共通ツール側で生成し直してlockを明示更新します。取得済みの正常なキャッシュはネットワークなしでも検査できます。

[公開workflow](../.github/workflows/mc-remote-images.yml)は、この固定済み生成物を収集します。Scratch OCIはScratchからビルドし、Bridge OCIはdigestを保持してコピーします。WireScopeのZIPとmanifest、Scratch設定契約、リリースmanifestを同じReleaseへまとめます。[candidate workflow](../.github/workflows/mc-remote-candidate.yml)は、Release・registry公開をせずActions artifactへ出します。

[Release.md](../Release.md)は上流のnpm公開手順との境界、[knowledge](https://github.com/Naohiro2g/mc-remote-knowledge)は横断的な判断の正本です。現在の公開版は[b9](https://github.com/Naohiro2g/scratch-editor/releases/tag/v2320.0.0b9)です。rollbackは直前の公開b8のtag `v2320.0.0b8` と、その公開setを使います。

## 3. 貢献者が調べ始める場所

- **ブロックの見た目を変える**：画面側の `blocks.js` を見てから、対応する仮想マシンのブロック定義を確認します。
- **命令の結果を変える**：仮想マシンの拡張を読み、通信の型や共通検証例へ進みます。
- **接続を調べる**：画面の接続設定、仮想マシンの通信処理、Bridge の順に追います。開発用画面は既定で接続が無効です。
- **通信の観察を調べる**：Scratchの観測feed・起動UIと、共通ツール側の `packages/live/` を読みます。

貢献者も学習者です。まず一つのブロックや画面操作を選び、入力、通信、結果を順に観察してください。変更と確認を小さく繰り返すと、部品同士の境界を理解しやすくなります。作業前には [AGENTS.md](../AGENTS.md) と、上流との関係を定めた[設計文書](https://github.com/Naohiro2g/mc-remote-knowledge/blob/main/13-scratch-client/scratch-upstream-design_ja.md)を確認してください。
