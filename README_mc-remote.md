# マイクラリモコン版 Scratch エディター

このリポジトリは、マイクラリモコンの **Scratch クライアント**です。Scratch で組んだ命令を、マインクラフトサーバー上の McRemote プラグインへ送り、マインクラフトの世界で実行します。Scratch Foundation の[エディター](https://github.com/scratchfoundation/scratch-editor)を基に、マイクラリモコンのブロック、接続画面、作品のブラウザ保存などを加えています。

## 1. 試してみる

Scratch を知っていても、マインクラフトが初めてでも、[公式サイトの「はじめる」](https://mc-remote.com/)から進められます。マインクラフト本体と、複数人で遊べるアカウントを用意してください。ゲームの対応版や公式箱庭サーバーの接続先は、更新されることがあるため公式サイトで確認してください。

1. マインクラフト（Minecraft クライアント）で、公式サイトに案内された箱庭サーバーへ入ります。
2. 同じサイトから Scratch エディターを開き、マイクラリモコンの「接続する」ブロックを動かします。Scratch エディターは Bridge を経由し、同じ箱庭サーバーの McRemote プラグインへゲームとは別に接続します。
3. 画面に出た `/mcremote pair NNN-NNN` をゲーム内のチャットに入力します。接続できたら、Scratch のブロックで短い言葉をチャットに送ってみてください。

箱庭サーバーには、ゲームの Minecraft クライアントと、マイクラリモコンのクライアントである Scratch エディターが別々に接続しています。手順3のペアリングで、Scratch の命令がどのプレイヤーに結び付くかが決まります。

命令がゲーム内に表示されれば、最初の接続を確かめられます。箱庭の世界は定期的にリセットされるため、残したいものは作品のプログラムとして保存してください。

[ショーケース](https://naohiro2g.github.io/scratch-editor/)では画面とブロックを見られますが、マイクラリモコンの接続は無効です。

## 2. 使い続ける・別の方法から移る

以前使ったことがある方も、公開中のエディターと接続先は[公式サイト](https://mc-remote.com/)から確認してください。接続時に新しいペアリングコマンドが出たら、ゲーム内のチャットで入力します。

作品はブラウザ内に保存できます。ブラウザ内の保存は、そのブラウザとサイトに結び付いています。別の端末やサイトでも残したい作品は、Scratch の作品ファイル（`.sb3`）としても保存してください。

[Python 版](https://github.com/Naohiro2g/minecraft-remote-api)を使ったことがある方には、Scratch は同じマイクラリモコンをブロックで操作する別の入口です。通信を観察したい場合は、エディターから[ワイヤースコープ](mc-remote/live/README.md)を開けます。

## 3. コードを読み、開発する

貢献する方も学習者です。最初から通信仕様を全部読むより、**画面のブロックがどこで命令になり、どこへ届くか**を追うと、変更する場所を見つけやすくなります。[このリポジトリのコード地図](mc-remote/README.md)に、Scratch 本体への変更、中継、通信の型、ワイヤースコープの位置をまとめました。

ソースコードを手元で動かす手順は[ルート README](README.md)にあります。各部品の詳しい実行・検証方法は、それぞれの README を参照してください。

- [中継（Bridge）](mc-remote/bridge/README.md)
- [通信の型と共通の検証例（protocol／fixture）](mc-remote/protocol/README.md)
- [通信を観察する画面（WireScope）](mc-remote/live/README.md)

このリポジトリは上流の Scratch エディターを引き継いでいます。変更を提案する際は、[開発者向けの案内](AGENTS.md)と[上流との関係](https://github.com/Naohiro2g/mc-remote-knowledge/blob/main/13-scratch-client/scratch-upstream-design_ja.md)を確認してください。マイクラリモコン全体の設計と通信の正本は[knowledge リポジトリ](https://github.com/Naohiro2g/mc-remote-knowledge)にあります。
