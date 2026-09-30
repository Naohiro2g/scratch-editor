# ブロック名の表示・検索辞書

ブロックピッカーで使う日本語名・英語名だけを保存します。選択可能なIDとstateは接続先から取得したCURRENT catalogを使い、この辞書から候補を増やしません。

## 保存する内容

- `1.21.11.json`: Minecraft Java 1.21.11のブロック名1,154件。
- `26.2.json`: Minecraft Java 26.2のブロック名1,184件。
- `sources.json`: 生成に使った公式配信URL、元ファイルのハッシュ、英語ファイルのJAR内パス。

各版のJSONは、`minecraft:gold_block`のようなIDをキーに、`en`と`ja`の短い名称を持ちます。元の言語ファイル全体、説明文、旗の模様、エンティティ名は含めません。

日本語と`ja-Hira`ではIDと日本語名を併記し、英語名を下に右寄せで表示します。候補ごとに区切り線を付け、検索に一致した候補の件数を表示します。英語ではIDと英語名を併記します。検索は常にID・日本語名・英語名を対象とし、空白区切りでAND検索します。英字の大小文字と全角・半角の違いは検索時に正規化します。

辞書はcatalogの`mcVersion`と完全一致する版だけを使います。版やIDに名前がない場合はIDだけを表示します。独自resource packやmodの名称は、このVanilla辞書では解決しません。保存・送信するblock IDとstateはmachine tokenのままです。

## 更新手順

リポジトリルートで`npm ci`を実行した環境で、次のコマンドを実行します。

```sh
cd packages/scratch-gui
node scripts/update-mcremote-block-names.mjs 1.21.11 26.2
```

更新スクリプトはMojang公式version manifestから指定版のmetadataとasset indexを取得します。英語は公式client JAR内の`assets/minecraft/lang/en_us.json`、日本語はasset indexが指す`minecraft/lang/ja_jp.json`を使います。manifestに記載されたSHA-1を照合してから、`block.minecraft.<ID>`形式の直接の名称だけを抽出します。取得したJARと元の言語ファイルはディスクへ保存しません。

新しい版を同梱する場合は、その版のJSONを生成し、隣の`mcremote-block-names.js`にimportと版の対応を追加します。辞書の更新は明示的に実行し、通常のビルドやピッカー操作ではMojangへアクセスしません。
