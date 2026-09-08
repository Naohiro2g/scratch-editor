# scratch-editor (McRemote Fork)

マイクラリモコン（Minecraft Remote / mc-remote）のためのWeb版Scratchエディタです。ブラウザだけで最新のマインクラフトの世界をプログラミング・遠隔操作できます。

> [!NOTE]
> **🌐 言語方針について / Language Policy**  
> 本リポジトリは、一次情報（SSOT）の鮮度と正確性を保つため、日本語を正本として記述しています。多言語参加やIssue/PRの利用方針については [主要言語についての方針転換 / Language Policy](https://github.com/Naohiro2g/mc-remote-knowledge/blob/main/LANGUAGE_POLICY.md) をご覧ください。  
> *This repository is maintained in Japanese as its primary Single Source of Truth (SSOT). Multi-language contributions are welcome. Please see our [Language Policy](https://github.com/Naohiro2g/mc-remote-knowledge/blob/main/LANGUAGE_POLICY.md).*

---

## 3分で動かす（ブラウザ最短クイックスタート）

ソフトウェアのインストールは不要です。PCやタブレット（iPad等）のブラウザですぐに動かせます。

### Step 1: Web版エディタを開く

👉 **[Web版エディタ（scratch-beta）を開く](https://scratch-beta.mc-remote.com/)**

### Step 2: マインクラフトを起動して箱庭サーバーに接続

1. マインクラフトを起動し、「マルチプレイ」を選択します。
2. サーバーアドレスに公式箱庭サーバー **`sb-beta.mc-remote.com`** を入力して接続します。
3. **推奨バージョン**: Java版 **1.21.1**
4. **統合版（Bedrock / Switch / iPad / スマホ等）で接続する場合**:
   - サーバーアドレス: `sb-beta.mc-remote.com`
   - **ポート番号: `25565`**（※通常の統合版ポート 19132 ではなく、Java版と同じ 25565 に変更してください）
   - > [!WARNING]
     > マインクラフト統合版の大型アップデート直後は、Geyser/Floodgateの追従待ちのため数日間接続できなくなる場合があります。

### Step 3: Scratchから接続して動かす

1. Scratchエディタ画面の左下にある **「拡張機能を追加」** アイコンをクリックし、**「Minecraft Remote」** を選択します。
2. ブロックパレットの `マインクラフトに接続する` ブロックをクリックして実行します。
3. 画面下部のWireScope miniペインに `/mcremote pair NNN-NNN`（数字6桁）が表示されます。
4. マインクラフト内のチャットを開き、そのコマンドを貼り付けてEnterキーを押します。
5. ペアリングが完了したら、`マインクラフトのチャットに [こんにちは] と表示する` ブロックを実行します。マイクラのチャットにメッセージが表示されれば成功です！

---

## 主な機能と特徴

- **ブラウザ自動保存**: 作成したプロジェクトはブラウザ（IndexedDB）に自動保存されます。メニューの **「ファイル」→「ブラウザ保存した作品」** からいつでも再開・管理できます。通常の `.sb3` ファイルとしての保存・読み込みにも対応しています。
- **WireScope（パケット観察）**: ブラウザとマインクラフトの間でどのような通信（JSON-RPC 2.0メッセージ）が行われているかを、WireScope画面でリアルタイムに観察できます。プログラミングと同時にネットワーク通信の仕組みを学ぶことができます。
- **豊富なマイクラ操作ブロック**:
  - ブロックの設置・取得（自動建築）
  - プレイヤーの座標移動・向きの制御
  - 看板のテキスト書き込み・読み取り
  - 落雷（ライトニング）やパーティクルの演出
  - ツルハシでブロックを叩いたイベントの検知

---

## 開発者向け情報（ソースコードからの起動）

ローカル環境でScratchエディタをビルド・起動する手順です。

```bash
git clone https://github.com/Naohiro2g/scratch-editor.git
cd scratch-editor
npm ci
npm start
```

ブラウザで `http://localhost:8601/` を開きます。  
*(※ローカル開発時の接続先設定は `packages/scratch-gui/static/mc-remote-runtime-config.json` で管理されます)*

### リポジトリ構成とUpstream（MIT Scratch）との関係

本リポジトリは、MITメディアラボによる [Scratch Editor Monorepo (`scratchfoundation/scratch-editor`)](https://github.com/scratchfoundation/scratch-editor) の公式フォークです。

- **`mc-remote/`**: McRemote固有の独立パッケージ群
  - `protocol`: TypeScript型定義およびワイヤ契約
  - `bridge`: ブラウザ（WSS）とマイクラサーバー（TCP）を繋ぐ中継プロキシ
  - `live`: 通信観察ツール WireScope
- **`packages/scratch-vm/src/extensions/scratch3_mcremote/`**: Scratch VM内のMcRemote拡張機能
- **`packages/scratch-gui/`**: McRemote向けUI統合（接続パネル、WireScope miniなど）
- その他の `packages/*` は上流Scratch monorepoに追従しています。

---

## 関連プロジェクト & 設計思想

- **プロジェクト公式サイト**: [mc-remote.com](https://mc-remote.com/)（カリキュラム全体像、Python版案内、開発ロードマップ）
- **ナレッジベース & 設計正本 (SSOT)**: [Naohiro2g/mc-remote-knowledge](https://github.com/Naohiro2g/mc-remote-knowledge)
  - Scratchクライアント設計仕様: [`13-scratch-client/`](https://github.com/Naohiro2g/mc-remote-knowledge/tree/main/13-scratch-client)
  - 作品の保存・移送設計: [`13-scratch-client/scratch-project-storage-transfer-design_ja.md`](https://github.com/Naohiro2g/mc-remote-knowledge/blob/main/13-scratch-client/scratch-project-storage-transfer-design_ja.md)
  - 通信プロトコル仕様: [`10-protocol/`](https://github.com/Naohiro2g/mc-remote-knowledge/tree/main/10-protocol)

---

## ライセンス

本リポジトリのコードは、上流Scratchのライセンス（GPL-2.0 / MIT等）に準拠しています。McRemote固有パッケージのうち、WireScope (`@mc-remote/live`) は **AGPL-3.0-only** です。詳細は各パッケージの `package.json` およびライセンス表示を参照してください。
