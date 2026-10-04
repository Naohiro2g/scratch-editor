# Scratchブロック一覧（ドラフト）

公開b8のブロックを画像・入力項目・選択肢から探す、静的ページの試作です。[Scratchブロック一覧（ドラフト）](site/index.html)は、サーバーやMinecraftへの接続なしで閲覧できます。まだ公式サイトへ公開していません。

## 表示する

リポジトリのルートで次を実行し、[一覧ページ](http://localhost:8640/)を開きます。

```sh
python3 -m http.server 8640 --bind 127.0.0.1 --directory mc-remote/block-reference/site
```

`site/index.html`を直接ブラウザで開いても表示・検索できます。JavaScriptを無効にしてもブロック一覧は読めます。

GitHub上でHTMLファイルのリンクを開くと、ページのソースコードが表示されます。ページの見た目を確認するには、上の方法で手元のブラウザから開いてください。

## 作り直す

ルートで`npm ci`を実行した開発環境と、PlaywrightのChromiumが必要です。ブラウザが未導入の場合は次で導入します。

```sh
npm exec --workspace=@scratch/scratch-gui -- playwright install chromium
```

対象releaseのScratchエディターを別途ローカルで配信し、日本語（`ja`）で開ける状態にします。**公開したい版のソースから作ったエディターを指定してください。** 生成器は新しいブラウザでブロックを描画し、Minecraft接続を無効にして画像を取り出します。普段使っているブラウザの作品や設定は変更しません。

```sh
node scripts/build-mcremote-block-reference.cjs \
  --editor-url=http://127.0.0.1:8611/ \
  --source-ref=v2320.0.0b8
```

`--editor-url`は手元で配信した対象エディターのURLに置き換えます。`--source-ref`の既定値は公開b8のtagです。作業中のVM・翻訳・ブロック描画のソースがそのrefと異なる場合は、生成を止めます。この検査だけで配信中エディターのsourceを証明するものではありません。配信物とrefの対応は配信側で確認してください。

出力先の既定値は`site/`です。別の場所へ出力するときは`--output=/tmp/mcremote-block-reference`を追加します。

## 入力と出力

| ファイル | 内容 |
| --- | --- |
| `content.json` | 短い説明、分類、入力名の補足、関連ブロック、通信APIの対応 |
| `page.html`・`style.css`・`page.js` | ページの構成・見た目・検索 |
| `../../scripts/build-mcremote-block-reference.cjs` | 対象エディターから定義と画像を取り出し、ページを生成するスクリプト |
| `site/index.html` | 生成した一覧ページ |
| `site/blocks.json` | 生成したブロック一覧データ。source commitを含む |
| `site/images/` | 56ブロックと組み合わせ例2件のSVG画像 |

画像は実際のScratch BlocksのSVGを使います。CSSと画像参照を埋め込み、エディターを開かずに表示できる形にしています。ブロック名・引数・初期値・選択肢はVMに登録された定義から取り出し、非表示ブロックや区切り線、入力用メニューだけのブロックは一覧に含めません。

「最初の値」はパレットに入っている初期値です。通信で省略したときの既定値とは区別します。説明や関連APIの対応は自動抽出ではなく`content.json`で補っています。公開前には文章の人間レビューが必要です。

ページには外部の画像・フォント・JavaScriptへの依存がありません。通信APIのリンクは[公式API一覧](https://mc-remote.com/api/)の該当分類を開きます。公式サイトへの配置やClient API一覧全体のschemaは、この試作では確定していません。

Scratchの実装由来の画像を含むため、このリポジトリのライセンスに従って扱います。
