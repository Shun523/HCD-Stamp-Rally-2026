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

`drizzle/0000_initial.sql` は仕様8章の全テーブルを作り、全テーブルでRLSを有効化します。ポリシーは作成しません。サーバー接続はDB所有者として行うため、APIからの直接アクセスはありません。
