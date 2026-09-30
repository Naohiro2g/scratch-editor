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

「カタログの［ブロックID／エンティティID／パーティクルID］を［リスト］に入れる」は、接続先から取得したカタログのIDを名前空間付きの文字列として、辞書順でリストへ入れます。リストは一覧全体で置き換わります。接続直後のカタログ取得が進行中なら、その完了を待ちます。取得できない場合は案内を表示し、元のリストを保持します。コピーのための追加通信はありません。

ブロックピッカーは、日本語では`gold_block 金ブロック`のようにIDと名前を並べ、英語名も表示します。検索はブロックID・日本語名・英語名を対象とし、空白で区切った語をすべて含む候補を表示します。名前はMinecraft 1.21.11／26.2の[表示・検索辞書](../packages/scratch-gui/src/lib/mcremote-block-names/README_ja.md)を同梱し、利用時の追加取得はありません。選択できるブロックは接続先のカタログにあるものだけで、ブロックへ入れる値はIDと状態です。

### 2.2 このフォークで追加した部品

| 場所 | 役割 | 詳細 |
| --- | --- | --- |
| [`mc-remote/protocol/`](protocol/) | 通信の型・定数と共通の検証例（fixture） | [README](protocol/README.md) |
| [`mc-remote/bridge/`](bridge/) | ブラウザと McRemote プラグインの間の通信を中継する Bridge | [README](bridge/README.md) |
| [`mc-remote/live/`](live/) | 通信を読み取り専用で観察する WireScope | [README](live/README.md) |

`protocol` は通信契約をコードと検証例へ写す場所です。Scratch 拡張はビルド時に仮想マシンへ組み込まれるため、このパッケージを直接読み込みません。Bridge も命令の内容を解釈せず、中継に徹します。

### 2.3 ビルド成果物と公開経路

ルートの `npm run build` は各作業単位（workspace）をビルドします。画面の静的ファイルは `packages/scratch-gui/build/`、Bridge は `mc-remote/bridge/dist/`、WireScope は `mc-remote/live/dist/` に出ます。GitHub Pages の[ショーケース](https://naohiro2g.github.io/scratch-editor/)はマイクラリモコンの接続を無効にした別の配布物です。

配布物を作るワークフローは [`.github/workflows/mc-remote-images.yml`](../.github/workflows/mc-remote-images.yml) にあります。[Release.md](../Release.md) は上流由来の npm 公開手順と、マイクラリモコン版のリリース名との境界を説明します。リリースの横断的な判断は[knowledge](https://github.com/Naohiro2g/mc-remote-knowledge)が正本です。

## 3. 貢献者が調べ始める場所

- **ブロックの見た目を変える**：画面側の `blocks.js` を見てから、対応する仮想マシンのブロック定義を確認します。
- **命令の結果を変える**：仮想マシンの拡張を読み、通信の型や共通検証例へ進みます。
- **接続を調べる**：画面の接続設定、仮想マシンの通信処理、Bridge の順に追います。開発用画面は既定で接続が無効です。
- **通信の観察を調べる**：Scratch の観察画面への入口と `mc-remote/live/` を読みます。

貢献者も学習者です。まず一つのブロックや画面操作を選び、入力、通信、結果を順に観察してください。変更と確認を小さく繰り返すと、部品同士の境界を理解しやすくなります。作業前には [AGENTS.md](../AGENTS.md) と、上流との関係を定めた[設計文書](https://github.com/Naohiro2g/mc-remote-knowledge/blob/main/13-scratch-client/scratch-upstream-design_ja.md)を確認してください。
