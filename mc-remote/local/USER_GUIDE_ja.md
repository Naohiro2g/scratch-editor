# mc-remote Scratchを自分のワールドで使う

1. OS用のZIPを展開し、ZIPと同じ名前のフォルダーを開きます。その直下のランチャー（Windowsは`start-mc-remote.cmd`、macOSは`start-mc-remote.command`、Linuxは`start-mc-remote.sh`）を起動します。
2. ブラウザで開いたページに、マインクラフトサーバーの接続先を入力し「保存してScratchを開く」を押します。
3. Scratchで「拡張機能を追加」から「mc-remote / マイクラリモコン」を選び、「接続する」ブロックを実行します。表示されたペアリングコマンドをマインクラフトのチャットで実行します。

Minecraftサーバーの準備は[McRemoteのクイックスタート](https://github.com/Naohiro2g/McRemote#readme)を参照してください。サーバーを起動して、そのワールドに参加してからペアリングします。

## このPCだけで使う

ScratchとMinecraftサーバーを同じPCで動かします。接続先は`127.0.0.1`、McRemoteのポートは通常`25575`です。

## LANの別のPCにあるサーバーへ接続する

Scratchを使う各PCでZIPを展開し、起動します。接続先にはサーバー役PCのIPアドレスまたはホスト名を入力します。サーバー役PCではMcRemoteのTCPポート（通常25575）へLANから接続できるようにします。Minecraftへ参加するためのポートとは別です。

## 起動と終了

- Windows: `start-mc-remote.cmd`。
- macOS: `start-mc-remote.command`。
- Linux: フォルダーを端末で開き、`./start-mc-remote.sh`を実行します。権限不足のエラーが出た場合は、`chmod u+x start-mc-remote.sh runtime/bin/node`を実行してから、もう一度起動してください。
- 起動画面を開いたまま使います。終了するには、その画面でCtrl+Cを押します。
- 次回も同じフォルダーから起動してください。前回保存した接続先が使われます。設定のページは`http://127.0.0.1:8601/`です。
- 接続先を変更する前に、Scratchの接続を切ってください。保存後に再び接続します。
- 「アドレスが使用中」などのエラーが出たら、すでに起動している同じセットを確認してください。

認証情報はScratchを開いたブラウザに保存されます。同じブラウザで次回使う場合は、ペアリング済みの接続を再利用できます。

## 通信を見る

接続後、Scratchの「WireScope mini」を開き、「WireScopeを開く」を押します。独立した画面に通信が表示されます。WireScopeもこのセットに含まれ、ランチャーと一緒に起動・終了します。

## 初回のOS警告

- macOSで開発元を確認できない旨の警告が出た場合: いったん起動を試した後、「システム設定 → プライバシーとセキュリティ → このまま開く → 開く」で個別に許可できる場合があります。[Appleの案内](https://support.apple.com/en-us/102445)を参照してください。
- WindowsのSmartScreenで未認識のアプリと表示された場合: 「詳細情報 → 実行」を選べる場合があります。組織の管理設定によっては選べません。[Microsoftの案内](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)を参照してください。
- WindowsのSmart App Controlによるブロックは、SmartScreenとは別です。アプリ単位の許可はできないため、警告の種類を確認して報告してください。[Smart App Controlの案内](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions)を参照してください。

この初回手順は公式案内を基にした検証用の説明です。Windows／macOSの本ZIPでの実機確認は未完了です。

## 配布物の情報

このZIPはScratch、Bridge、WireScope、Node.js実行環境を含みます。Docker、Node.jsの別途インストール、証明書の設定は不要です。Minecraft本体、Paper、McRemoteプラグインは含みません。

版と入力は`identity.json`、ライセンスは`NOTICE_ja.md`と`licenses/`、対応するソースは`SOURCE_ja.md`を参照してください。
