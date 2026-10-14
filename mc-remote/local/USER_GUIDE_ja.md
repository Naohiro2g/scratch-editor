# mc-remote Scratchを自分のワールドで使う

1. OS用のZIPを展開し、展開先の中にある`mc-remote-scratch-LAN`フォルダーをホームフォルダーの`mc-remote`へコピーします。Windowsでは**展開する前に**ZIPを右クリックして「プロパティ」を開き、「全般」タブの「許可する」にチェックして「適用」を押します。版番号のフォルダーにある`はじめに.html`を開き、同じ場所の起動ファイルを実行します（OS別の方法は下の「起動と終了」）。
2. 初回は設定ページで、マイクラ／マイクラリモコンの接続先を入力して「設定を保存する」を押し、続けて「改造版のScratchを開く」を押します。別タブでmc-remote拡張機能入りのScratchが開きます。
3. Scratchで「接続する」ブロックを実行します。WireScope miniが開いてペアリングコマンドが表示されたら、マイクラのチャットコマンドとしてコピペして実行します。
4. 接続できたら「チャットに [こんにちは] と言う」ブロックをクリックし、マインクラフトのチャットに文字が出ることを確かめます。

ダウンロードしたScratch作品（`.sb3`）は、開いているScratchの画面へドラッグ＆ドロップして読み込めます。今の作品をブラウザへ保存してから切り替わります。ファイルをダブルクリックして開く方式には対応していません。

Minecraftサーバーの準備は[McRemoteのクイックスタート](https://github.com/Naohiro2g/McRemote#readme)を参照してください。サーバーを起動して、そのワールドに参加してからペアリングします。

## 展開後の置き場所と更新

WindowsでZIPをそのまま展開すると、ZIPと同じ名前のフォルダーができ、その中に`mc-remote-scratch-LAN`があります。初回は**内側の`mc-remote-scratch-LAN`**をコピーします。次の版では、その中の**新しい版番号のフォルダー**だけを、既存の`mc-remote-scratch-LAN`へコピーします。

```text
ダウンロードフォルダー/
└─ mc-remote-scratch-LAN-<version>-windows-x64/  ← 展開でできた外側のフォルダー
   └─ mc-remote-scratch-LAN/                     ← 初回はこれをコピー
      └─ <version>/                              ← 更新時はこれをコピー

ホームフォルダー/
└─ mc-remote/
   └─ mc-remote-scratch-LAN/
      ├─ <旧版>/
      └─ <新版>/
```

更新するときは旧版の起動画面を終了してから新版を起動します。動作を確かめるまでは旧版を残してください。現在、接続先の`settings.json`は版番号のフォルダーごとに保存され、新版へ自動では引き継がれません。新版では設定画面で接続先を指定します。Scratchの作品とペアリング情報は、同じブラウザで同じ`127.0.0.1:8601`を使う限り、そのブラウザに残ります。

## このPCだけで使う

ScratchとMinecraftサーバーを同じPCで動かします。接続先は`127.0.0.1`、McRemoteのポートは通常`25575`です。

## LANの別のPCにあるサーバーへ接続する

Scratchを使う各PCでZIPを展開し、起動します。接続先にはサーバー役PCのIPアドレスまたはホスト名を入力します。サーバー役PCではMcRemoteのTCPポート（通常25575）へLANから接続できるようにします。Minecraftへ参加するためのポートとは別です。

## 起動と終了

- Windows: 展開前にZIPのプロパティで「許可する」にチェックした後、`start-mc-remote.cmd`をダブルクリックします。Git Bashを使う場合は起動ファイルのあるフォルダーでGit Bashを開き、`./start-mc-remote.cmd`を実行します。
- macOS: `start-mc-remote.command`をダブルクリックします。
- Linux: Ubuntuのファイルマネージャーでは`start-mc-remote.sh`を右クリックし、「プログラムとして実行」を選びます。ダブルクリックではテキストエディターが開く場合があります。端末からは`./start-mc-remote.sh`でも起動できます。権限不足のエラーが出た場合は、`chmod u+x start-mc-remote.sh data/runtime/bin/node`を実行してから、もう一度起動してください。
- 起動したターミナル画面は閉じてはいけません。終了するには、その画面でCtrl+Cを押します。
- 次回からは保存した接続先を使い、mc-remote拡張機能入りのScratchを直接開きます。設定ページも別タブで開きます。どのタブが前面に出るかはブラウザの設定によります。
- 設定ページは`http://127.0.0.1:8601/`です。「Scratchに戻る」は開いているタブへ戻り、Scratchを再読み込みしません。ブラウザがタブの切り替えを許可しない場合は、タブを選んでください。
- 接続先を変更するときは、作業中の作品を必要に応じて保存し、Scratchのタブを閉じます。設定ページで接続先を変え、「設定を保存する」を押してから「改造版のScratchを開く」を押してください。
- 起動ファイルだけを移動せず、`data/`と同じフォルダーに置いたまま使ってください。Windowsでは起動ファイルへのショートカットを作れます。フォルダー全体は移動できます。フォルダーをエクスプローラーの「クイックアクセス」にピン留めすると、次回見つけやすくなります。
- 「アドレスが使用中」などのエラーが出たら、すでに起動している同じセットを確認してください。

認証情報はScratchを開いたブラウザに保存されます。同じブラウザで次回使う場合は、ペアリング済みの接続を再利用できます。

ランチャーが動いている間は、`http://127.0.0.1:8601/editor/?extension=mcremote`をブックマークして直接開けます。接続先は保存済みの設定を使います。

## 通信を見る

最初の「接続する」ブロックを実行すると、WireScope miniが自動で開きます。接続後は「WireScopeを開く」を押すと、独立した画面に通信が表示されます。WireScopeもこのセットに含まれ、ランチャーと一緒に起動・終了します。

## 初回のOS警告

- macOSで開発元を確認できない旨の警告が出た場合: いったん起動を試した後、「システム設定 → プライバシーとセキュリティ → このまま開く → 開く」で個別に許可できる場合があります。[Appleの案内](https://support.apple.com/en-us/102445)を参照してください。
- WindowsのSmartScreenで未認識のアプリと表示された場合: 「詳細情報 → 実行」を選べる場合があります。組織の管理設定によっては選べません。[Microsoftの案内](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)を参照してください。
- WindowsのSmart App Controlによるブロックは、SmartScreenとは別です。試作では、ダウンロードしたZIPをそのまま展開した場合はダブルクリックがブロックされ、**展開前にZIPのプロパティで「許可する」にチェック**した場合は通常権限で起動できました。Smart App Controlをオフにする操作や「管理者として実行」は、この案内の手順に含めません。ブロックが続く場合は警告の文面を記録して報告してください。[Smart App Controlの案内](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions)を参照してください。

2026年10月の試作ZIPでは、macOSで「このまま開く」を選んだ後、2回目からダブルクリックだけで起動し、接続、最初のチャット命令、再起動後の再接続まで確認しました。Windowsでは上記の「許可する」を展開前に選ぶ経路で、Smart App Controlをオンのままダブルクリック起動を確認しました。公開するZIPでの取得から接続までの確認はpre-releaseで行います。

## 配布物の情報

このZIPはScratch、Bridge、WireScope、Node.js実行環境を含みます。Docker、Node.jsの別途インストール、証明書の設定は不要です。Minecraft本体、Paper、McRemoteプラグインは含みません。

版番号のフォルダーには起動ファイル、この案内、ブラウザで読める`はじめに.html`、`NOTICE_ja.md`があります。実行に必要なファイルは`data/`にまとめています。

版と入力は`data/identity.json`、ライセンスは`NOTICE_ja.md`と`data/licenses/`、対応するソースは以下を参照してください。

## ソースとライセンス

Scratchとランチャーの対応ソースは`data/source/scratch-source.tar.gz`に同梱しています。`npm ci`、`npm run build`で再構築できます。Bridge、WireScope、Node.jsの固定ソースは続くリンクを参照してください。ライセンスと著作権表示は`NOTICE_ja.md`から確認できます。
