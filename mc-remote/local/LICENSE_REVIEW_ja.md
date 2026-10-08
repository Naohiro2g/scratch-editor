# Scratch Local candidateのライセンス確認

knowledge `5e248a9cd9243c1ca654abfbed65ee2646087316`のb10「次の操作」とDEC `2026-08-11-01`に従う確認です。

依存更新前の本文不足135 entryを`license-gap-review.json`の`original_reconciliation`で1件ずつ照合しています。
現在の入力では132 entryです（entryはインストール場所ごとに数え、同じname/versionが複数ある場合を含む）。
132件のうち、配布に入るものが26件、buildだけで使うものが106件です。

分類はnpmのdev flagに依存しません。ZIPへ入れる生成済みGUIの全source mapの実ファイル由来を読み、
入れ子のnode_modulesは最後のpackageを所有者として扱います。scratch-blocksへ埋め込まれたBlocklyと、
CopyWebpackPluginで同梱されるMediaPipeも含めます。source mapと本文不足表は生成時に再計算します。
この文書とJSONは手元の入力の照合結果であり、CIの配布物の結果はZIP内`licenses/review.json`が正です。

26 componentへ本文とpublisherのnoticeを補いました。対応する公開版のsource commitに本文があるものはraw bytesで収容し、
本文が後から追加されたprojectは原packageのMIT表記と公式本文を併記します。本文そのものが無いMIT／Apache表記は、
SPDX公式の標準本文と原package.jsonの著者・license metadataを併記し、copyright表示を創作しません。
`license-overrides.json`へ出典とbytes／SHA-256を固定し、ビルド時に照合します。
既存のbundleのLICENSE.txt、package rootのLICENSE／NOTICE、Node／Bridge／wsの本文、Scratchの商標案内、
対応sourceと再構築の案内も同梱します。buildだけの本文不足106件は、配布codeに含めたという主張をしません。

## 公開前に残る確認

`microee 0.0.6`はpublisherが「BSD」とだけ表記しています。原本文と条項数を公式sourceで確認できませんでした。
BSD-3-Clauseの標準本文を参照用に入れ、原表記・原作者metadataと未確定であることをnoticeへ保持しています。
BSD-3-Clauseへ再ライセンスしたという主張や、配布前license gateがPASSしたという主張はしません。
coordinatorへこの1件を返します。candidateの固定とOS検証の根拠を、公開の許可へ読み替えません。
