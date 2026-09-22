# Server

岡山大学ホームカミングデー デジタルスタンプラリーのHono + Drizzleサーバーです。

## 開発用コマンド

リポジトリルートで依存関係を取得した後、serverディレクトリでローカルPostgreSQL（Supabase CLIのDBなど）を起動し、以下を実行します。

```sh
pnpm --filter @hcd-stamp-rally/server db:migrate
pnpm --filter @hcd-stamp-rally/server db:seed
pnpm --filter @hcd-stamp-rally/server test
pnpm --filter @hcd-stamp-rally/server lint
pnpm --filter @hcd-stamp-rally/server typecheck
```

実DBの永続化テストは、本番用でないローカルDBを指定して実行します。テストは専用のセッション・スポット・機体IDだけを削除します。

```sh
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm --filter @hcd-stamp-rally/server exec vitest run test/integration.test.ts
```

`DATABASE_URL` はSupabaseのSession modeプーラー接続文字列を環境変数で渡します。機体キーは `DEVICE_KEYS_JSON` に指定し、キーそのものはコミットしません。管理APIは `X-Admin-Password`、機体APIは `Authorization: Bearer <device-key>` で認証します。

ローカルで管理画面を確認する場合は、先にWebをビルドして共有パスワードを指定します。

```sh
pnpm --filter @hcd-stamp-rally/web build
PORT=8799 ADMIN_PASSWORD=change-me pnpm --filter @hcd-stamp-rally/server dev
```

通常の押印受付は10月31日16:00までです。16:00までの `device_stamped_at` を持つ
オフライン再送だけは10月31日中に受理し、日本時間の11月1日0:00以降は拒否します。

## 結合E2E

リポジトリ直下で、Webをビルドしてから次の1コマンドを実行します。

```sh
pnpm test:e2e
```

Playwrightがサーバーから配信されたWebを開き、`device/` のカメラなし模擬端末で押印します。
サーバー停止中のファイルキュー保存・復旧後の再送・5個目のゴール遷移まで確認します。
事前に `device/.venv` をREADMEどおりセットアップし、Playwright Chromiumを
`PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter @hcd-stamp-rally/server exec playwright install chromium`
で取得してください。

## コンテナ

リポジトリ直下の単一 `Dockerfile` はWebをビルドしてサーバーから同一オリジン配信します。

```sh
docker build -t hcd-stamp-rally:local .
```

Cloud Runへの設定手順と当日チェックリストは [../docs/deploy.md](../docs/deploy.md) を参照してください。

`drizzle/` のマイグレーションは仕様8章の全テーブルを作り、全テーブルでRLSを有効化します。スキーマを変えたら `pnpm --filter @hcd-stamp-rally/server db:generate` で追加のマイグレーションを生成してください。ポリシーは作成しません。サーバー接続はDB所有者として行うため、APIからの直接アクセスはありません。
