# 同梱物のライセンスとnotice

この配布物は複数のライセンスのcomponentを含みます。

- Scratch Editorと派生component: AGPL-3.0-only。本文は`licenses/Scratch-AGPL-3.0.txt`、商標の案内は`licenses/Scratch-TRADEMARK`。
- 固定版McRemote Bridge: AGPL-3.0-only。本文は`licenses/Bridge-AGPL-3.0.txt`。
- ws: MIT。本文と著作権表示は`licenses/ws-LICENSE`。
- Node.js: MITと同梱第三者の各ライセンス。本文と第三者noticeは`licenses/Node-LICENSE`。公式配布の実行ファイルを変更せず同梱しています。
- ランチャーと配布処理: scratch-editorのLICENSEに従います。
- Scratchの第三者code: 各bundleに付属する`*.LICENSE.txt`を保持しています。build入力のライセンス本文・noticeは`licenses/build-inputs/`、名前・版・宣言と本文の一覧は`licenses/build-inputs.json`です。この一覧にはbuild時だけ使う依存も含みます。
- packageに本文が無かったcomponentの補完本文とpublisherの著者・ライセンス情報は`licenses/supplemental/`、出典・固定commit・SHA-256は`licenses/supplemental-sources.json`です。配布に入るcodeとbuildだけの入力の分類は`licenses/review.json`に記録しています。

`microee 0.0.6`のpublisher表記は「BSD」です。原本文と条項数の確認が残るため、同梱のBSD-3-Clause標準本文は参照用であり、このcomponentのライセンスを変更するものではありません。candidateの公開前確認事項として記録しています。

対応するソースと再構築の入口は`SOURCE_ja.md`です。version、Scratch source、固定tooling、実行環境のidentityは`identity.json`を参照してください。
