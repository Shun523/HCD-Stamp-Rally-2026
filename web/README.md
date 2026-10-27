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
pnpm --filter @hcd-stamp-rally/web test:screenshots
```

`/dev/gallery` は開発時だけ使える UI 部品一覧です。通常・押下・フォーカス・無効、未押印・押印済み、未完走・完走、紹介のリンクあり・なしを確認できます。`test:screenshots` はモック API を使い、日英各13画面（待機画面を含む）を 390×844 で `docs/screenshots/` に更新します。初回だけ Chromium が無ければ、リポジトリルートで次を実行してください。

```sh
PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter @hcd-stamp-rally/web exec playwright install chromium
```

開発時に別オリジンのサーバーへ接続する場合は `VITE_API_BASE_URL` にそのURLを設定します。Google Mapsを有効にする場合だけ `VITE_GOOGLE_MAPS_API_KEY` を設定します。キーが未設定、またはMapsの読み込みに失敗した場合は、スポット一覧だけを表示します。これらの値は `.env` に置き、コミットしません。

`/admin` は共有パスワードで管理APIを検証してから表示します。機器状態、未送信キュー、
ACK未到達、参加・完走状況を30秒ごとに更新し、要対応機は固定アラートと音または
ブラウザ通知で知らせます。

## コンテンツと画像の差し替え

画面文言とサンプルフラグは [src/data/content.ts](src/data/content.ts) にあります。`isSample` は画面文言と紹介をあわせたWeb表示内容のフラグです。両方を本番データへ差し替えてから `false` にしてください。

スタンプ絵柄は [public/images/stamps](public/images/stamps) の `spot-01.png` から `spot-05.png` を、同名の背景透過PNGへ置き換えます。コードの変更は不要です。

紹介画面は [src/data/about.ts](src/data/about.ts) の配列を表示順どおりに読みます。名前（日英）、説明（日英）、外部リンク（任意）、写真のパスを差し替えてください。写真は縦横比3:2で用意し、[public/images/about](public/images/about) に置いて `photoPath` をそのファイル名にします。ほかの比率の写真は枠いっぱいに表示され、はみ出した分が切り落とされます。

スポットの名前・座標・案内文はサーバーのシードデータから `/api/spots` で取得します。本番データへは `server/src/db/spot-data.ts` を書き換え、`db:seed` を実行してください。
