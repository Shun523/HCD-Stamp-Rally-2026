# Server

岡山大学ホームカミングデイ デジタルスタンプラリーのHono + Drizzleサーバーです。

## 開発用コマンド

リポジトリルートで依存関係を取得した後、serverディレクトリでローカルPostgreSQL（Supabase CLIのDBなど）を起動し、以下を実行します。

```sh
pnpm --filter @hcd-stamp-rally/server db:migrate
pnpm --filter @hcd-stamp-rally/server db:seed
pnpm --filter @hcd-stamp-rally/server db:export --out ../exports/2026-10-31
pnpm --filter @hcd-stamp-rally/server test
pnpm --filter @hcd-stamp-rally/server lint
pnpm --filter @hcd-stamp-rally/server typecheck
```

実DBの永続化テストは、本番用でないローカルDBを指定して実行します。テストは専用のセッション・スポット・機体IDだけを削除します。

```sh
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm --filter @hcd-stamp-rally/server exec vitest run test/integration.test.ts
```

`db:export` はイベント後にDBを読み、参加者・押印・通知の生データのCSVと集計を `--out` へ書き出します（DBは変更しません）。`--logs` にCloud Loggingの書き出しを渡すと処理時間も集計します。手順と出力の意味は [docs/data.md](../docs/data.md) にあります。書き出しの結合テストも `TEST_DATABASE_URL` を付けて `vitest run test/export.integration.test.ts` で実行できます。

`DATABASE_URL` はSupabaseのSession modeプーラー接続文字列を環境変数で渡します。機体キーは `DEVICE_KEYS_JSON` に指定し、キーそのものはコミットしません。管理APIは `X-Admin-Password`、機体APIは `Authorization: Bearer <device-key>` で認証します。

## DB接続のTLS

仕様8章・11章の通信保護として、外部DBへの接続はTLSを必須にします。接続文字列に
`sslmode=disable` があっても外部DBへ平文で接続しません。`localhost`、`127.0.0.1`、`::1` の
ローカルDBだけは、TLSを要求していない場合に平文接続を許可します。

既定の `ssl: 'require'` は暗号化を必須にしますが、サーバー証明書の検証は行いません。
証明書・ホスト名も検証する場合は、Supabase DashboardのDatabase settingsから取得した
正規のCA証明書を、環境変数 `DATABASE_SSL_CA` へPEM形式で渡してください。改行は実際の改行か、
バックスラッシュとnの2文字で表せます。指定したCAを検証できない場合は接続に失敗し、検証なしでの
再接続はしません。この設定はサーバー起動、マイグレーション、シードの全てに適用します。
既にURLで `sslmode=verify-full` 等を要求している場合も検証を弱めません。

参照: [SupabaseのSSL接続説明](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl)。

TLSの実接続試験は、TLSを有効にしたローカルPostgreSQLと、そのサーバー証明書のCAを用意し、
次の1コマンドで実行します。本番Supabaseは使用しません。

```sh
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
TEST_DATABASE_SSL_CA_FILE=/tmp/local-postgres-ca.crt \
  pnpm --filter @hcd-stamp-rally/server exec vitest run test/db-tls.integration.test.ts
```

## ローカルでの画面確認

ローカルで管理画面を確認する場合は、先にWebをビルドして共有パスワードを指定します。

```sh
pnpm --filter @hcd-stamp-rally/web build
PORT=8799 ADMIN_PASSWORD=change-me pnpm --filter @hcd-stamp-rally/server dev
```

通常の押印受付は10月31日16:00までです。16:00までの `device_stamped_at` を持つ
オフライン再送だけは10月31日中に受理し、日本時間の11月1日0:00以降は拒否します。

## 一般開放前の待機画面

仕様4-8により、一般開放（2026年10月31日10:00、日本時間）より前は参加者画面が待機画面だけになり、
`/` でセッションを発行しません。開放時刻は `src/config.ts` の `PARTICIPANT_OPEN_AT` です。
管理画面で「この端末で開始前の参加者画面を使う」を押した端末だけは、開放前も通常どおり使えます。

ローカル開発と自動テストに限り、環境変数 `PARTICIPANT_OPEN_AT` で開放時刻を上書きできます。
値は時差付きのISO 8601（例 `2026-10-01T00:00:00+09:00`）とし、時差の無い値や不正な値は起動時に
エラーにします。本番（Cloud Run）では設定しません。

```sh
PORT=8799 ADMIN_PASSWORD=change-me PARTICIPANT_OPEN_AT=2026-10-01T00:00:00+09:00 \
  pnpm --filter @hcd-stamp-rally/server dev
```

## 過剰アクセスの制限

仕様5章・7章・11章の通常利用を維持し、2026年10月14日に利用者が指定した「緩め」の
初期値で制限します。各値は環境変数で変更できます。回数・期間・サイズ・接続数は正の整数とし、
0や不正な値を指定した場合は起動時にエラーにします。

| 環境変数 | 既定値 | 対象 |
| --- | --- | --- |
| `ADMIN_MAX_FAILURES` | 20 | 接続元ごとの管理APIの認証失敗回数 |
| `ADMIN_FAILURE_WINDOW_MS` | 600000 | 認証失敗を数える期間（10分） |
| `SESSION_MAX_NEW_PER_SOURCE` | 240 | 接続元ごとの新規参加者発行数 |
| `SESSION_MAX_NEW_TOTAL` | 600 | 全体の新規参加者発行数 |
| `SESSION_CREATION_WINDOW_MS` | 60000 | 新規発行を数える期間（1分） |
| `SSE_MAX_CONNECTIONS_PER_SESSION` | 6 | 参加者ごとの通知接続数 |
| `SSE_MAX_CONNECTIONS_TOTAL` | 1200 | 全体の通知接続数 |
| `MAX_REQUEST_BODY_BYTES` | 8192 | JSON解析前のリクエストボディ上限（8KiB） |

管理API2種の失敗は同じ接続元の枠で合算し、20回失敗した後は期間が終わるまで429を返します。
ログインフォームは1回の操作で管理API2種を呼ぶため、1回の誤入力が2回の失敗になる場合があります。
制限に達する前に正しいパスワードで認証すると、その接続元の失敗数をリセットします。
通常のダッシュボード更新を失敗回数として数えません。失敗ログにはパスだけを記録し、
パスワード・APIキー・接続元のIPは記録しません。

参加者の既存Cookieによる再訪・状態取得は新規発行数に含めません。発行は接続元と全体の枠を
確保してから実行し、同時アクセスでも設定数を超えないようにします。通知接続の枠は、
ブラウザの切断・キャンセル・中断で解放します。300接続の仕様上の想定に対して余裕を持たせています。

回数制限と接続数制限の応答は429で、`Retry-After` に待ち時間の秒数を付けます。
初回のページアクセスが制限された場合は、日英で待ち時間とQRの読み込み直しを案内します。
過大な入力は413 `payload_too_large`、DBの64文字を超える識別子等は400 `invalid_request` です。
機体の通常リクエストはこのサイズ以下で、429は既存の再送処理の対象です。

制限は仕様どおり単一サーバープロセスのメモリで管理し、再起動時にリセットします。
接続元の記録は各回数制限で最大10000件とし、期限切れを次のアクセス時に削除します。
接続元情報はDBへ保存しません。

接続元は実ソケットから取得し、任意に送れる `X-Forwarded-For` の先頭をそのまま使いません。
Cloud Runの `K_SERVICE` がある場合は、現在の直接 `run.app` URLの構成として信頼する段数を1とし、
ヘッダーの右端を使います。ローカルでは0とし、ヘッダーを無視します。
別のプロキシを追加する場合は `TRUSTED_PROXY_HOPS`（0以上の整数）を実際の信頼する段数へ
設定し、クライアントから直接到達できるサーバーでは0にしてください。不正なヘッダーや
実ソケットのないメモリ内試験では、安全側の接続元枠へまとめます。

選択された全体1200接続という値は、現在のCloud Runの同時リクエスト上限1000を超えます。
本番ではCloud Run側の上限が先に働くため、アプリの上限1200は本番で1200接続を処理できるという
意味ではありません。Cloud Runの設定は今回変更していません。

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
