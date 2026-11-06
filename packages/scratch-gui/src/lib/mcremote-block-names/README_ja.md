# ブロック名の表示・検索辞書

ブロックピッカーで使う日本語名・英語名を保存します。隣の`mcremote-block-aliases/`には、検索用のクリエイティブインベントリのカテゴリ名を保存します。選択可能なIDとstateは接続先から取得したCURRENT catalogを使い、これらの辞書から候補を増やしません。

## 保存する内容

- `1.21.11.json`: Minecraft Java 1.21.11のブロック名1,154件。
- `26.2.json`: Minecraft Java 26.2のブロック名1,184件。
- `26.3.json`: Minecraft Java 26.3のブロック名1,275件。
- `sources.json`: 生成に使った公式配信URL、元ファイルのハッシュ、英語ファイルのJAR内パス。

各版のJSONは、`minecraft:gold_block`のようなIDをキーに、`en`と`ja`の短い名称を持ちます。元の言語ファイル全体、説明文、旗の模様、エンティティ名は含めません。

日本語と`ja-Hira`ではIDと日本語名を併記し、英語名を下に右寄せで表示します。候補ごとに区切り線を付け、検索に一致した候補の件数を表示します。英語ではIDと英語名を併記します。検索は常にID・日本語名・英語名・英語と日本語のカテゴリ名を対象とし、空白区切りでAND検索します。英字の大小文字と全角・半角の違いは検索時に正規化します。

辞書はcatalogの`mcVersion`と完全一致する版だけを使います。版やIDに名前がない場合はIDだけを表示します。独自resource packやmodの名称は、このVanilla辞書では解決しません。保存・送信するblock IDとstateはmachine tokenのままです。

## 更新手順

リポジトリルートで`npm ci`を実行した環境で、次のコマンドを実行します。

```sh
cd packages/scratch-gui
node scripts/update-mcremote-block-names.mjs 1.21.11 26.2 26.3
```

更新スクリプトはMojang公式version manifestから指定版のmetadataとasset indexを取得します。英語は公式client JAR内の`assets/minecraft/lang/en_us.json`、日本語はasset indexが指す`minecraft/lang/ja_jp.json`を使います。manifestに記載されたSHA-1を照合してから、`block.minecraft.<ID>`形式の直接の名称だけを抽出します。取得したJARと元の言語ファイルはディスクへ保存しません。

新しい版を同梱する場合は、その版のJSONを生成し、隣の`mcremote-block-names.js`にimportと版の対応を追加します。辞書の更新は明示的に実行し、通常のビルドやピッカー操作ではMojangへアクセスしません。

## カテゴリ検索データの更新

`mcremote-block-aliases/{1.21.11,26.2,26.3}.json`は、各ブロックIDに公式の英語・日本語カテゴリ名を対応させます。同じブロックが複数のタブにある場合は、すべての所属を保持します。登録数は順に1,089／1,118／1,207ブロックです。検索語を独自に作ったり、別の版や名前空間へ流用したりしません。カテゴリを持たないブロックはIDと名前で検索できます。

この3版の再生成にはNode.jsとJDK 25以降が必要です。JDKは生成時だけ使い、エディターのビルドや利用時には不要です。

```sh
cd packages/scratch-gui
node scripts/update-mcremote-block-aliases.mjs \
  --java-home /path/to/jdk-25 \
  1.21.11 26.2 26.3
```

生成器は上の名前辞書の`sources.json`で固定した公式metadata・クライアント・日本語assetをSHA-1照合し、同じmetadataに記載された公式ライブラリも取得します。`scripts/mcremote/ExtractCreativeTabs.java`でクライアントのregistryを初期化し、Vanillaのserver dataのタグを読み込んで、通常のfeature flags（`DEFAULT_FLAGS`）と管理者用アイテムの表示を有効にした11個の`CATEGORY`タブから所属を抽出します。検索やホットバーのタブは対象外です。アイテムから`Block.asItem`の対応を引くため、壁付きのたいまつなどの関連ブロックも含みます。resource pack・mod・実験的featureのカテゴリは含めません。

`mcremote-block-aliases/sources.json`に公式URLとハッシュ、抽出条件、Java helper・所属データ・出力JSONのSHA-256を記録します。取得したクライアントとライブラリ、元の言語ファイルは既定で`.cache/mcremote-block-aliases/`にだけ保存し、配布物には同梱しません。`--cache-dir DIR`でキャッシュ先を変えられます。生成器が扱う版はこの3版に固定しており、追加時は公式APIの違いを確認してから明示的に対応します。
