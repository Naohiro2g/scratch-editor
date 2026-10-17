# Scratch LANパッケージの配布と検証

[Scratch LANパッケージの案内](https://mc-remote.com/lan/scratch/)から公開b10のOS別ZIPを取得できます。ScratchとBridgeを各PCのlocalhostで動かします。利用者の操作は[ZIP内の案内](USER_GUIDE_ja.md)を参照してください。rc1の候補ZIPは検証中です。

箱庭からLANでの制作へつなぐ目的と導入・再開の設計は、knowledgeの[Scratch LANパッケージの設計](https://github.com/Naohiro2g/mc-remote-knowledge/blob/main/13-scratch-client/scratch-lan-package-design_ja.md)を正本とします。教材まで含めた対話の記録は[ローカル設計記録](LAN_EXPERIENCE_DESIGN_ja.md)にあります。

## 配布物を作る

開発用Linux環境で、Python 3、Git、npmとNode.js、依存のインストール済みcheckoutを使います。利用者のPCには同梱Node.jsだけが必要で、Python、npm、Dockerは要求しません。

リポジトリのルートから実行します。

```sh
npm ci
npm run tooling:artifacts
npm run tooling:release-manifest
npm run build
npm run local:test
npm run local:lint
npm run release-manifest:test
npm run release-manifest:lint
npm run local:build -- --os windows --arch x64 --commit <40桁のHEAD>
npm run local:build -- --os macos --arch arm64 --commit <40桁のHEAD>
npm run local:build -- --os linux --arch x64 --commit <40桁のHEAD>
```

出力先は`candidate/`です。未コミットの状態を手元で試す場合だけ`--allow-dirty`を追加します。このZIPはidentityにその状態を記録し、公開用の収集では拒否します。

Node.jsの版と公式archiveのSHA-256は[`local-runtime-lock.json`](../local-runtime-lock.json)で固定し、取得先は`mc-remote/local-inputs/`です。Bridgeは[`tooling-lock.json`](../tooling-lock.json)のOCIから`/app`のJavaScriptとwsを変更せず取り出します。x64／arm64の内容が一致し、ネイティブ依存が無いことを生成時に確認します。利用者はOCIを扱いません。

OS別ZIPは`mc-remote-scratch-LAN-<version>-<os>-<arch>.zip`です。内部は`mc-remote-scratch-LAN/<version>/`で、その直下には`start-mc-remote.*`、`README_ja.md`、`はじめに.html`、`NOTICE_ja.md`を置きます。`はじめに.html`はREADMEと同じ原稿から生成します。実行に必要なファイルは`data/`へまとめ、設定保存後の`settings.json`は起動ファイルの隣にできます。ソースの所在と再構築方法はREADMEに含め、独立したSOURCE文書は置きません。Scratch、Bridge、WireScope、Node.js実行ファイル、identity、ライセンス本文と対応sourceは`data/`にあります。Node.jsのnpmなど、この構成に不要な実行物は同梱しません。Scratchのbuild入力のライセンスも収集します。

OS標準の展開でZIP名の外側フォルダーが増えても、初回は内側の`mc-remote-scratch-LAN`を`HOME/mc-remote/`へコピーします。次版は新しい`<version>`フォルダーだけを同じ場所へ追加し、旧版は残します。版ごとの`settings.json`の自動引き継ぎは未実装です。

Windowsでは、ZIPを展開する前にファイルのプロパティの「許可する」にチェックしてから展開します。その後は`start-mc-remote.cmd`をダブルクリックします。ターミナルで起動する場合は、同じフォルダーをGit Bashで開いて`./start-mc-remote.cmd`を実行します。Smart App Controlをオフにする操作や管理者権限での起動は案内しません。配布物を取得する前にも分かるよう、この一手はRelease本文にも記載します（`2026-10-14-01`）。

WireScopeは同じtooling lockのZIPとdetached manifestを保持し、`data/wirescope/`へ配信用の各fileを収めます。両artifactのbytes／SHA-256、source commitと各assetのidentityを照合し、内容を変更せず同梱します。`data/wirescope/LICENSE`と`data/wirescope/NOTICE`も保持します。

生成済みsource mapとコピーされた素材から、配布に入るcodeとbuildだけの入力を分け、`data/licenses/review.json`へ記録します。本文不足のruntime依存は`license-overrides.json`で固定した本文・noticeを補います。取得元、commit、bytes、SHA-256を照合し、不足や破損があればZIP生成を止めます。buildだけの依存には本文未収容を明記します。ZIP内のbuild入力ライセンス本文は短い識別子のフォルダーに置き、元のnpm上の場所と保存先の対応は`data/licenses/build-inputs.json`に残します。元の135件と現在の入力の照合は[`LICENSE_REVIEW_ja.md`](LICENSE_REVIEW_ja.md)を参照してください。ライセンスの公開前確認事項はcandidateの固定だけで閉じません。

## 接続設定と終了

初回は設定ページを開き、接続先を保存して別タブでScratchを開きます。設定済みならランチャーが設定ページとScratchを順に開きます。ScratchのURLは`http://127.0.0.1:8601/editor/?extension=mcremote`です。設定ページは同じoriginのBroadcastChannelで開いているScratchを把握し、ボタンの連打でタブを追加せず、接続先を再保存してBridgeを再起動することもありません。前面への切り替えはブラウザの制御に従います。

localhostの設定ページは`http://127.0.0.1:8601/`、Bridgeは`ws://127.0.0.1:8602`、独立WireScopeは`http://127.0.0.1:8603/`です。すべて`127.0.0.1`だけにbindします。Scratchのruntime configへ別originの`wirescope_url`を渡し、接続後のminiから開きます。既存の開発配信とは別ポートです。

接続先を保存すると、Bridgeの接続先allowlist／既定値／TCPポートと、Scratchのruntime configが揃います。設定は起動ファイルの隣の`settings.json`へhostとportだけ保存します。認証とペアリングは従来どおりMcRemoteが扱い、ブラウザに保存するtokenをランチャーへ移しません。接続先を変更する際はScratchのタブを閉じてから設定します。

HTTPのHost確認、設定POSTのOrigin確認、JSONの境界検証、公開する静的ファイルのdirectory制限を設けています。Ctrl+CはScratch／WireScopeの配信とBridgeを終了します。使用中ポートは起動エラーとして返し、既存サービスを停止しません。開発・模擬サーバー試験では`MCREMOTE_LOCAL_WEB_PORT`／`MCREMOTE_LOCAL_BRIDGE_PORT`／`MCREMOTE_LOCAL_WIRESCOPE_PORT`で別のlocalhostポートを指定できます。

## 最終ZIPを検証して、そのまま公開する

candidate workflowは、同じsourceから3 ZIPとsidecar identity、candidate manifestをActions artifactへ収容します。Windows 11 x64、macOS arm64、Linux x64で、取得・展開・初回起動・再起動・1台構成・LAN構成・警告・firewall・接続先・ペアリングを観察します。署名・公証の要否は結果で判断します。ライセンス確認はDECISION `2026-08-11-01`に従います。

公開workflowはZIPを再ビルドせず、coordinatorが凍結したActions artifact ID／digestから同じbytesを収集します。source commit、ownerの成功したcandidate workflow、外側artifact digest、candidate manifestと各ZIPのbytes／SHA-256を照合してからReleaseへ添付します。公開manifestは`mc-remote.release-manifest` v2、kind `https-file`、role `scratch-local`と`os`／`arch`です。既存のWireScope ZIP、detached manifest、contractsを含む全https-fileに、生のbytesとSHA-256を載せます。candidate側はkind `file`を維持します。

workflow dispatchでは`local_candidate_artifact_id`と`local_candidate_artifact_digest`を指定します。Release publishedイベントでの自動実行では、公開前に同じ値をrepository variables `SCRATCH_LOCAL_CANDIDATE_ARTIFACT_ID`／`SCRATCH_LOCAL_CANDIDATE_ARTIFACT_DIGEST`へ設定する必要があります。未指定・不一致なら、OCI公開前に収集で停止します。これらの値の設定、tag／Release操作はcoordinatorの公開許可後の作業です。

manifestの契約は[`release-manifest-lock.json`](../release-manifest-lock.json)で、Bridge／WireScopeのlockとは別に固定します。取得したschema、fixture、reference実装はGit管理外の`mc-remote/release-manifest/`へ置き、実行時にもbytesとSHA-256を照合します。schema versionでv1／v2を選んで文書全体を検査し、未知version、不正なv2、鍵の重複やrole内の混在を拒否します。baselineのScratch OCIは、roleが1件でkindが`oci`のものだけを利用します。変種の選択は明示したos／archが一致する1件に限り、別のOSへfallbackしません。

v2の形はDECISION `2026-10-07-09`で確定しています。共有fixtureのconsumer照合は`npm run release-manifest:test`で行います。McRemote／Stackの取り込みと公開の可否は、横断gateで確認します。
