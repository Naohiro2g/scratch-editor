# ライセンスと著作権表示

このZIPには、異なるライセンスのソフトウェアが含まれます。本文と著作権表示は、次の場所で確認できます。

- Scratch Editorと派生component: AGPL-3.0-only。本文は`data/licenses/Scratch-AGPL-3.0.txt`、商標の案内は`data/licenses/Scratch-TRADEMARK`。
- 固定版McRemote Bridge: AGPL-3.0-only。本文は`data/licenses/Bridge-AGPL-3.0.txt`。
- 固定版WireScope: AGPL-3.0-only。本文とnoticeは`data/wirescope/LICENSE`と`data/wirescope/NOTICE`、固定sourceとassetの一覧は`data/wirescope-app.manifest.json`。
- ws: MIT。本文と著作権表示は`data/licenses/ws-LICENSE`。
- Node.js: MITと同梱第三者の各ライセンス。本文と第三者noticeは`data/licenses/Node-LICENSE`。公式配布の実行ファイルを変更せず同梱しています。
- ランチャーと配布処理: scratch-editorのLICENSEに従います。対応するソースは`data/source/scratch-source.tar.gz`です。
- Scratchの第三者code: 各bundleに付属する`*.LICENSE.txt`を保持しています。build入力のライセンス本文・noticeは`data/licenses/build-inputs/`、名前・版・元のnpm上の場所・本文の保存先は`data/licenses/build-inputs.json`です。この一覧にはbuild時だけ使う依存も含みます。
- packageに本文が無かったcomponentの補完本文とpublisherの著者・ライセンス情報は`data/licenses/supplemental/`、出典・固定commit・SHA-256は`data/licenses/supplemental-sources.json`です。配布に入るcodeとbuildだけの入力の分類は`data/licenses/review.json`に記録しています。

`microee 0.0.6`のpublisher表記は「BSD」です。原本文と条項数の確認が残るため、同梱のBSD-3-Clause標準本文は参照用であり、このcomponentのライセンスを変更するものではありません。candidateの公開前確認事項として記録しています。

対応するソースと再構築の入口は`README_ja.md`の「ソースとライセンス」です。version、Scratch source、固定tooling、実行環境のidentityは`data/identity.json`を参照してください。
