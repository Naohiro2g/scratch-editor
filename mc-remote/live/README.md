# ワイヤースコープ（WireScope）

WireScope は、Scratch と McRemote プラグインの間の通信を読み取り専用で観察する画面です。このパッケージには、観察画面、観察データの型、接続を受け渡す処理、共通の検証例（fixture）が入っています。[このリポジトリのコード地図](../README.md)で Scratch 側との関係を確認できます。

## 画面を手元で見る

リポジトリのルートから実行します。

```sh
npm run build --workspace=@mc-remote/live
npm run preview --workspace=@mc-remote/live
```

画面は <http://127.0.0.1:4173/> で開けます。Scratch エディターとは別の配信元（origin）で動かします。直接開いただけでは観察対象がないため、接続済みの Scratch エディターのワイヤースコープ画面から開いてください。テストは `npm test --workspace=@mc-remote/live` です。

## コードと検証例

| 場所                                               | 役割                                         |
| -------------------------------------------------- | -------------------------------------------- |
| [`src/observer.ts`](src/observer.ts)               | 表示してよい観察データの検証と整形           |
| [`src/scratch-adapter.ts`](src/scratch-adapter.ts) | Scratch から観察対象を受け取る処理           |
| [`src/station-adapter.ts`](src/station-adapter.ts) | 同じ配信元の中継局から観察対象を受け取る処理 |
| [`src/session.ts`](src/session.ts)                 | 観察の開始・更新・終了                       |
| [`test/fixtures/`](test/fixtures/)                 | 接続、表示名、観察の経過を確かめる共通例     |

観察対象を渡す手順、データの形、対応する通信版の詳しい契約は [knowledge の WireScope 文書](https://github.com/Naohiro2g/mc-remote-knowledge/tree/main/15-wirescope)を正本とします。この README に通信方式や版ごとの命令一覧を複製しません。

## 配布用の成果物

配布用の画面一式と、その内容を記録した別ファイルは、対応するソースのコミットを指定して作ります。

```sh
npm run build:artifact --workspace=@mc-remote/live -- --source-commit <40桁のコミット>
```

結果は `dist/artifacts/wirescope-app.zip` と `dist/artifacts/wirescope-app.manifest.json` です。受け渡す際は、この二つのファイルを組として扱います。公開や配備の手順は[リリースの設計資料](https://github.com/Naohiro2g/mc-remote-knowledge)を確認してください。

観察画面へ渡す情報は許可した項目だけに絞ります。認証情報やプレイヤーの識別情報は表示用データへ含めず、観察を許す情報もブラウザの永続保存には書き込みません。
