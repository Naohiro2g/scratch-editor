# 中継（Bridge）

このパッケージは、ブラウザの Scratch エディターとマインクラフト側の McRemote プラグインをつなぎます。ブラウザ側の WebSocket と McRemote プラグインの TCP ポートの間で通信を中継します。[このリポジトリのコード地図](../README.md)から、ほかの部品との関係を確認できます。

## 役割と境界

- 通常の WebSocket メッセージを、改行で区切る TCP メッセージへ変換します。認証前のペアリングに限り、`one-shot-v1` の中継用包みを外します。
- 接続元（Origin）と接続先のマインクラフトサーバー（Sandbox）の許可リストを確認します。
- 通常の命令、結果、認証の内容は解釈しません。命令の意味と応答は McRemote プラグインが決めます。

公開環境では、Bridge の前段が TLS を終端します。接続先の選択肢は、エディターの `mc-remote-runtime-config.json` と Bridge の設定で揃える必要があります。通信形式と配備上の判断は[knowledge の設計文書](https://github.com/Naohiro2g/mc-remote-knowledge)を参照してください。

## 手元で動かす

リポジトリのルートから実行します。

```sh
npm run build --workspace=mc-remote/bridge
npm start --workspace=mc-remote/bridge
```

`npm run dev --workspace=mc-remote/bridge` は変更時に再ビルドします。テストは `npm test --workspace=mc-remote/bridge` です。接続先と待ち受けの設定項目は [`src/config.ts`](src/config.ts) にあります。

| 設定項目                                             | 意味                                     |
| ---------------------------------------------------- | ---------------------------------------- |
| `BRIDGE_WS_HOST`、`BRIDGE_WS_PORT`                   | WebSocket の待ち受け                     |
| `BRIDGE_ORIGIN_ALLOWLIST`                            | 接続を許すエディターの配信元             |
| `BRIDGE_SANDBOX_ALLOWLIST`、`BRIDGE_DEFAULT_SANDBOX` | 接続を許すマインクラフトサーバーと既定値 |
| `BRIDGE_SANDBOX_PORT`                                | マインクラフト側 McRemote 接続先のポート |

このパッケージは非公開の作業単位（workspace）です。公開用のコンテナー画像は [`.github/workflows/mc-remote-images.yml`](../../.github/workflows/mc-remote-images.yml) がビルド済みの `dist/` から作ります。
