# Web application

参加者向けスタンプ帳と、`/admin` のスタッフ用ダッシュボードです。APIのリクエスト・レスポンスは `@hcd-stamp-rally/shared` のZodスキーマで検証します。

## 開発

リポジトリルートで依存関係を取得後、以下を実行します。

```sh
pnpm --filter @hcd-stamp-rally/web dev
pnpm --filter @hcd-stamp-rally/web test
pnpm --filter @hcd-stamp-rally/web lint
pnpm --filter @hcd-stamp-rally/web typecheck
pnpm --filter @hcd-stamp-rally/web build
```

開発時に別オリジンのサーバーへ接続する場合は `VITE_API_BASE_URL` にそのURLを設定します。Google Mapsを有効にする場合だけ `VITE_GOOGLE_MAPS_API_KEY` を設定します。キーが未設定、またはMapsの読み込みに失敗した場合は、スポット一覧だけを表示します。これらの値は `.env` に置き、コミットしません。

## コンテンツと画像の差し替え

画面文言とサンプルフラグは [src/data/content.ts](src/data/content.ts) にあります。本番化時は文言を差し替え、`isSample` を `false` にしてください。

スタンプ絵柄は [public/images/stamps](public/images/stamps) の `spot-01.svg` から `spot-05.svg` を同名のSVGまたは透過PNGへ置き換えます。初回説明の機器写真は [public/images/stamp-machine.svg](public/images/stamp-machine.svg) を置き換えます。コードの変更は不要です。

スポットの名前・座標・案内文はサーバーのシードデータから `/api/spots` で取得します。本番データへは `server/src/db/seed.ts` のサンプルスポットを差し替えてください。
