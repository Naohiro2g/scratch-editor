# WireScope 実装ロードマップ

> 人間向けの scratch-editor repo-local roadmap。
> 横断設計の正本は `Naohiro2g/mc-remote-knowledge` の
> `00-hub/DECISIONS_ja.md`、決定 `2026-08-06-03` と `2026-08-02-09`。
> 本書と knowledge が食い違う場合は knowledge を優先する。

作成日: 2026-08-06

基準 source: `develop@7cd936435520875729372bbbf28dd2f7266adb96`

搬送時 knowledge 参照 commit: `371a7823ac057945571e0f2dff625f29348bd97b`

着地済み knowledge commit: `ede3dcc0eec1e052ff48662cc7905105f684e7da`

## 1. 確定した構成

独立 WireScope は、共通の `@mc-remote/live` web app と、Scratch／Python それぞれの
source adapter・launcher で構成する。Scratch 版と Python 版で別々の UI app を作らない。

stream model は `1 stream = 1 connection = 1 build state` を維持する。observer schema は
初版から `streams[]` を持ち、現行の main stream 1件から main／substream の複数 stream へ
追加的に拡張できる形にする。target と stream を同一 ID にせず、target 配下に各 stream を表示する。

Scratch catalog picker は b4 へ送り、b3 catalog 実装と実測を入力に見せ方と state UX を洗練する。
WireScope は別の進行線として前倒しするが、b3 release blocker にはしない。

## 2. 実装段階

### 2.1 b3 前：Scratch read-only 版

- Scratch 側を先行参照実装とする。
- b3 release blocker にはしない。
- 完成・検証できた範囲は b3 へ同梱できる。
- b3 前に最低限、observer schema、security allowlist、lifecycle fixture、Scratch 参照 adapter を固定する。
- WireScope UI 全体が b3 に間に合わない場合も、この契約先行点を Python 追従の入力として残す。
- 初版は Scratch の main stream 1件を観察する。
- 別タブ／window で sanitized hello、permissions、world constants、frame／payload を read-only 表示する。
- runtime config の信頼済み URL、origin/source 検証、exact `targetOrigin`、`MessageChannel`、一回限り grant を用いる。
- `auth.*`、token、pair code、player UUID、credential 情報を独立 WireScope へ渡さない。

### 2.2 b3 release 後：Python 追従

- Python API 担当の着手は b3 release 後とする。
- Scratch 側が先行固定した observer schema、fixture、参照 adapter を入力にする。
- 引数なしの `mcremote wirescope` subcommand を launcher 入口とする。
- Python connection を観察する adapter と local relay を実装し、共通 WireScope app へ同じ schema で渡す。
- 初版は `Minecraft.create()` で成立した main stream 1件を観察する。
- Python 追従開始後、Scratch 側の後続前段と短期間だけ並走して両 adapter の conformance を確認する。
- 長期間の共同設計状態にはしない。
- 完成分は b4 へ同梱できるが、このロードマップだけで b4 blocker には設定しない。

### 2.3 後続前段：Scratch main／substream と長時間観察

- Scratch の main／substream 対応を実装する。
- Scratch object model から main／substream への別途確定する写像に従う。
- 各 stream を独立 connection・独立 build state として観察する。
- observer session が開いている間の長時間観察を実装する。
- observation history、grant、observer session を `.sb3`／`localStorage` へ永続化しない。

### 2.4 後続中段：Python substream と複数 source

- Python の明示 substream API へ追従する。
- 複数 source／複数 stream の read-only 観察、検索、比較を実装する。
- target と stream を同一 ID にせず、target 配下に main／substream を表示する。
- source／target ごとの grant を独立させる。

### 2.5 後続後段：Scratch command 発行の予約

- Scratch からの command 発行機能を将来 roadmap として予約する。
- command 発行の認可、transport、grant、対象 stream、既存 Scratch connection の利用方法は、後段着手前に別途設計・批准する。
- 現時点では別 control capability の必須化を含む具体方式を確定しない。
- pairing、credential 操作、source connection の切断を自動的に範囲へ追加しない。

`2026-08-02-09` は、初期の独立 WireScope を read-only とする現行設計の根拠として維持する。
同決定を「将来も永久に書込み機能を禁止する決定」とは読まない。ただし後段の command 予約は、
同決定の現在の read-only 実装契約を今すぐ改訂するものではない。

## 3. Security と保存境界

- 独立 WireScope は別 origin とする。
- WireScope URL は runtime config の信頼済み値だけを使う。
- handoff は `event.origin` と `event.source` を検証し、exact `targetOrigin` と `MessageChannel` を使う。
- `targetOrigin: "*"`、grant の query／fragment 搬送、`BroadcastChannel`／IndexedDB による grant handoff は採らない。
- observation grant は不透明・短命・一回限りとし、target identity と分離する。
- `auth.*` frame、token、pair code、grant、credential ID／hash、player UUID、device label を observer feed へ渡さない。
- redaction は表示時 denylist ではなく、生成側の allowlist で行う。
- observation history、grant、observer session、display alias、target identity を `.sb3`／`localStorage` へ保存しない。
- pairing、credential 操作、source connection の切断は初期 read-only 版の範囲外とする。

## 4. 段階ごとの影響

### b3 前 Scratch 版

- 必須: scratch-editor、`@mc-remote/live`、knowledge 文書。
- 別 origin で公開する場合: Stack／配信側の静的 artifact、WireScope URL、CSP／COOP、cache、deploy smoke。
- 原則不要: Python API、McRemote plugin、Bridge、McRemote wire protocol の変更。

### b3 後 Python 追従

- 必須: Python API、Python CLI／adapter／local relay。
- 共通 app 契約が成立していれば scratch-editor の必須変更はなく、必要時の互換修正に限定する。
- 原則不要: plugin、Bridge、wire protocol、Stack の変更。

### 後続前段

- 必須: scratch-vm／scratch-gui、共通 WireScope app。
- main／substream を複数の独立 connection として実現する限り、既存の同一 UUID 並行 session と connection 単位 build state を利用でき、plugin／wire 変更は原則不要。

### 後続中段

- 必須: Python API、共通 WireScope app。
- 複数 source／stream の検索・比較を browser 内で行う限り、plugin／Bridge／wire 変更は原則不要。

### 後続後段

- 必須: Scratch adapter、共通 WireScope app、security 設計。
- 既存 Scratch connection と既存 command を利用する方式なら server 側変更なしで成立する可能性がある。
- WireScope の直接接続、新 method、server 側 control 機構を採る場合は protocol、plugin、Bridge、Stack に影響する。方式決定まで未確定とする。

20-教材は、WireScope を利用する教材と Scratch から Python への移行教材を作る段階で追従する。

## 5. 理由

- WireScope を b3 完了条件にすると release を不必要に拘束する一方、Scratch picker の検証、main／substream 観察、Python 版の設計には前倒し価値がある。
- Scratch 側には既存の hello、frame log、display alias、WireScope mini、旧詳細 UI の実装資産があり、参照実装を先行させやすい。
- Python 担当を b3 後に開始することで、2担当が長期間並走する状態を避けられる。
- Python 担当は完成 UI を後付けで解釈せず、Scratch が先行固定した schema、fixture、adapter 契約へ追従できる。
- 初版から `streams[]` を採用すれば、現行単一 stream から Scratch／Python の main／substream へ schema 破壊なしで拡張できる。
- read-only 観察、複数 stream 観察、command 発行を段階分離すれば、各段階の security 境界と検証範囲が明確になる。

## 6. 採らない案

- WireScope を b3 release blocker にする。
- Scratch 版と Python 版を別々の UI app として実装する。
- Scratch と Python を最初から同時に設計・実装し、長期間並走させる。
- Python 担当が「Scratch 完成」という不明確な状態を待つ。
- 単一 stream 専用 schema を初版として固定する。
- 1本の connection 内で main／substream を multiplex する。
- 初期版から複数 source、長時間観察、command 発行をまとめて実装する。
- observation grant の将来仕様や command 認可方式を現段階で推測して固定する。
- `2026-08-02-09` を WireScope の永久的な書込み禁止と解釈する。

## 7. 実装前に読むもの

- knowledge `00-hub/DECISIONS_ja.md`: `2026-08-06-03`、`2026-08-02-09`、`2026-07-21-07`
- knowledge `10-protocol/versioning-design_ja.md`: §10.11.1 項7、項9、項13
- knowledge `13-scratch-client/scratch-roadmap_ja.md`
- knowledge `13-scratch-client/scratch-execution-model-design_ja.md`
- knowledge `12-python-client/python-client-guide_ja.md`

現時点では設計確定のみ。独立 WireScope の実装、unit、integration、live 接続試験は未着手である。
搬送時 worktree にある localhost WS 対応の未 commit 差分は本ロードマップの実装ではなく、本文の実装済み範囲へ含めない。
