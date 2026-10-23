# デプロイ手順書

この手順は本番への実行手順です。実行前に `<...>` を実際の値へ置き換えます。
仕様上、Cloud Run のリージョン、プロジェクトID、サービス名、リハーサル日は未確定のため、
ここでは値を決めません。サーバーの秘密情報をコマンド履歴・Git・Dockerイメージへ残さないでください。
`VITE_GOOGLE_MAPS_API_KEY` はブラウザへ配信される公開キーであり、Webビルド成果物とDockerイメージに
静的に埋め込まれます。秘密として扱うのではなく、Google Cloud側で利用元と利用APIを制限します。

## 0. 事前に確定・用意する値

| 変数 | 内容 |
| --- | --- |
| `PROJECT_ID` | Google CloudプロジェクトID |
| `REGION` | Cloud RunとCloud Schedulerを置くリージョン |
| `SERVICE` | Cloud Runサービス名 |
| `REHEARSAL_DATE` | リハーサル日（要確定） |
| `SUPABASE_SESSION_URL` | Supabaseの**Session pooler**接続文字列 |
| `DEVICE_KEYS_JSON` | 機体IDとAPIキーのJSON。例: `{"dev-01":"..."}` |
| `ADMIN_PASSWORD` | スタッフ用ダッシュボードの共有パスワード |
| `VITE_GOOGLE_MAPS_API_KEY` | HTTPリファラー制限を付けたMaps JavaScript API専用のブラウザキー |

`SUPABASE_SESSION_URL` は Supabase Dashboard の **Connect → Session pooler** からコピーします。
Shared pooler の Session mode はポート `5432`、ユーザー名は `postgres.<PROJECT-REF>` です。
Cloud RunからIPv4で接続するため、この文字列を使います。文字列中のパスワードに予約文字が
ある場合はURLエンコードします。接続方式の詳細は[Supabaseの接続ガイド](https://supabase.com/docs/guides/database/connecting-to-postgres)を参照してください。

## 1. Supabase の準備と確認

1. Supabase Dashboard で東京リージョンのプロジェクトを開く。
2. `server/.env.example` を参考に、ローカルの `DATABASE_URL` へ Session pooler 接続文字列を
   一時的に設定する。リポジトリには保存しない。
3. リポジトリのルートでマイグレーションとサンプルスポットのシードを実行する。

   ```sh
   pnpm --filter @hcd-stamp-rally/server db:migrate
   DEVICE_KEYS_JSON="$DEVICE_KEYS_JSON" pnpm --filter @hcd-stamp-rally/server db:seed
   ```

4. Supabase SQL Editorで、全テーブルのRLSが有効で、ポリシーが作られていないことを確認する。
   `rowsecurity` が全件 `true`、後者の件数が `0` であることが合格条件です。

   ```sql
   select tablename, rowsecurity
   from pg_tables
   where schemaname = 'public'
   order by tablename;

   select schemaname, tablename, policyname
   from pg_policies
   where schemaname = 'public';
   ```

   本システムはブラウザからSupabaseへ接続しません。RLSを有効にしてポリシーを置かないことで
   Data API経由のアクセスを拒否し、サーバーはテーブル所有者としてPostgreSQLへ接続します。
   RLSの有効化とその挙動は[Supabase RLSガイド](https://supabase.com/docs/guides/database/postgres/row-level-security)も参照してください。

## 2. イメージ作成と初回デプロイ

リポジトリ直下の `Dockerfile` は `shared` と `web` をビルドし、`web/dist` を含む単一イメージを
作ります。サーバーはこの成果物を同一オリジンで配信します。Viteの環境変数はビルド時に静的埋め込み
されるため、`VITE_GOOGLE_MAPS_API_KEY` はCloud Runの実行時環境変数ではなく、Cloud Buildから
Dockerのbuild argumentとして渡します。

### 2-1. 初回用イメージを作る

初回は本番URLが未確定なので、Mapsキーを渡さないイメージを作ります。このイメージでは地図の代わりに
スポット一覧が表示されます。

```sh
export PROJECT_ID='<Google CloudプロジェクトID>'
export REGION='<Cloud Runリージョン>'
export SERVICE='<サービス名>'
export REPOSITORY='hcd-stamp-rally'
export IMAGE_BASE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$SERVICE"
export SOURCE_REVISION="$(git rev-parse --short HEAD)"
export BOOTSTRAP_IMAGE="$IMAGE_BASE:$SOURCE_REVISION-bootstrap"
export IMAGE="$IMAGE_BASE:$SOURCE_REVISION"

gcloud config set project "$PROJECT_ID"
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker --location="$REGION"
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_IMAGE=$BOOTSTRAP_IMAGE" \
  .
```

Artifact Registryのリポジトリを作成済みの場合、`gcloud artifacts repositories create` は再実行しません。

接続文字列・機体キー・管理パスワードは Secret Manager に格納します。以下の標準入力は端末履歴を
避けるためのもので、値を貼り付けたシェル履歴を共有しないでください。

```sh
gcloud secrets create hcd-database-url --replication-policy=automatic
gcloud secrets create hcd-device-keys --replication-policy=automatic
gcloud secrets create hcd-admin-password --replication-policy=automatic

printf %s "$SUPABASE_SESSION_URL" | gcloud secrets versions add hcd-database-url --data-file=-
printf %s "$DEVICE_KEYS_JSON" | gcloud secrets versions add hcd-device-keys --data-file=-
printf %s "$ADMIN_PASSWORD" | gcloud secrets versions add hcd-admin-password --data-file=-
```

Cloud Run実行サービスアカウントへ各Secretの `roles/secretmanager.secretAccessor` を付与してから、
次を実行します。

```sh
gcloud run deploy "$SERVICE" \
  --image="$BOOTSTRAP_IMAGE" \
  --region="$REGION" \
  --allow-unauthenticated \
  --set-secrets=DATABASE_URL=hcd-database-url:latest,DEVICE_KEYS_JSON=hcd-device-keys:latest,ADMIN_PASSWORD=hcd-admin-password:latest \
  --timeout=3600 \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=1000 \
  --cpu-throttling
```

デプロイ後にCloud Runが割り当てたURLを取得し、ヘルスチェックを確認します。

```sh
export SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --format='value(status.url)')"
curl --fail-with-body "$SERVICE_URL/api/health"
```

`{"ok":true,"db":"ok"}` が返ることを確認します。

### 2-2. Maps APIキーへ本番URLを登録する

Google Cloud Consoleの **Google Maps Platform → Keys & Credentials** で本番用キーを開き、
Application restrictionsを **Websites**、API restrictionsを **Maps JavaScript APIのみ** にします。
Websitesには、取得したURLが `https://example.run.app` なら次の2件を登録します。

```text
https://example.run.app
https://example.run.app/*
```

独自ドメインからも配信する場合は、そのオリジンと `/*` 付きの値も登録します。保存後、制限が反映
されるまで数分待ちます。Maps JavaScript APIではブラウザからキーを確認できるため、キーを隠すこと
ではなく、このHTTPリファラー制限とAPI制限が必須です。

### 2-3. Mapsキー入りの本番用イメージを作る

次の入力操作はzsh用です。キーの入力内容は画面とシェル履歴に表示されません。Cloud Buildの
ビルドメタデータ・ログとWebビルド成果物には値が残るため、制限済みのブラウザキーだけを使用します。

```sh
read -rs 'VITE_GOOGLE_MAPS_API_KEY?Google Maps API key: '
echo
export VITE_GOOGLE_MAPS_API_KEY

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_IMAGE=$IMAGE,_VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY" \
  .

unset VITE_GOOGLE_MAPS_API_KEY
```

キーを変更した場合も、同じ手順でWebを再ビルドする必要があります。Cloud Runへ実行時環境変数として
設定するだけでは、ビルド済みのWebには反映されません。

本番用イメージを同じサービスへデプロイします。サービスURLと既存のCloud Run設定は維持されます。

```sh
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION"
```

デプロイ後、`/` がWebアプリを返すこと、`/api/me` と `/api/events` が同一オリジンで通信すること、
マップ画面にGoogle Mapsと5スポットのマーカーが表示されることをブラウザで確認します。開発者ツールの
コンソールに `RefererNotAllowedMapError`、`BillingNotEnabledMapError`、`ApiNotActivatedMapError`、
`InvalidKeyMapError` が出ていないことも確認します。

## 3. リハーサル日・イベント前日〜当日のCloud Run設定

SSE接続とACK待機を単一インスタンスのメモリで扱うため、**リハーサル日**および
**2026-10-30から2026-10-31のイベント終了まで**だけ次の設定にします。

```sh
gcloud run services update "$SERVICE" \
  --region="$REGION" \
  --timeout=3600 \
  --min-instances=1 \
  --max-instances=1 \
  --concurrency=1000 \
  --no-cpu-throttling
```

- `--timeout=3600` はSSEを最大60分維持します。
- `--min-instances=1` と `--no-cpu-throttling` は、コールドスタートを避け、リクエスト外の
  ハートビート監視を止めないために必要です。
- `--max-instances=1` はSSE通知とACK待機が別インスタンスへ分かれないようにします。
- この期間はデプロイしません。新旧インスタンスが並走するとメモリ上のSSE状態が分かれます。

イベント終了後と、リハーサル日・イベント前日〜当日以外は、費用を抑えるため必ず戻します。

```sh
gcloud run services update "$SERVICE" \
  --region="$REGION" \
  --min-instances=0 \
  --max-instances=1 \
  --cpu-throttling
```

Cloud Runの最小インスタンスはサービスレベルで設定でき、同時実行数の上限は1000です。
設定の意味は[最小インスタンスの公式ガイド](https://cloud.google.com/run/docs/configuring/min-instances)と
[Cloud Runの設定リファレンス](https://cloud.google.com/run/docs/configuring)で確認できます。

## 4. Supabase停止防止用 Cloud Scheduler

無料プランのSupabaseを稼働状態に保つため、`/api/health` を72時間（3日）ごとに呼びます。
このエンドポイントはDBへ問い合わせるため、HTTP 200だけでなく `db: "ok"` を確認します。

```sh
export SERVICE_URL='https://<Cloud Run URL>'

gcloud scheduler jobs create http hcd-supabase-health \
  --location="$REGION" \
  --schedule='every 72 hours' \
  --time-zone='Asia/Tokyo' \
  --uri="$SERVICE_URL/api/health" \
  --http-method=GET

gcloud scheduler jobs run hcd-supabase-health --location="$REGION"
gcloud scheduler jobs describe hcd-supabase-health --location="$REGION"
```

参加者Webを公開するサービスのため、このヘルスチェックは公開GETとして作成します。将来Cloud Runを
非公開化する場合は、Scheduler専用サービスアカウントに `roles/run.invoker` を付与し、
`--oidc-service-account-email` を指定します。HTTPターゲットとOIDCの設定は
[Cloud Scheduler公式ガイド](https://cloud.google.com/scheduler/docs/http-target-auth)を参照してください。

## 5. 前日（10月30日）の確認

- [ ] 本番用イメージのタグ、Cloud RunのサービスURL、`DATABASE_URL` のSecret参照を確認する。
- [ ] `gcloud run services describe` で `min-instances=1`、`max-instances=1`、
  `concurrency=1000`、timeout 3600秒、CPU常時割り当てを確認する。
- [ ] `/api/health` が200かつ `db: "ok"` を返すこと、Cloud Schedulerの直近実行が成功していることを確認する。
- [ ] 管理画面（`/admin`）の「参加者画面の公開」に、一般開放「10月31日（土）10:00」と状態「開始前」が出ることを確認する。
  別の日時が出たら、Cloud Runに環境変数 `PARTICIPANT_OPEN_AT` が設定されていないか確認する（本番では設定しない。spec 4-8）。
- [ ] SupabaseでSession poolerの接続文字列を再確認し、RLS確認SQLを実行する。
- [ ] Maps APIキーが本番URLからのMaps JavaScript APIだけに制限され、予算アラートが有効なことを確認する。
- [ ] 実スマホのマップ画面でGoogle Mapsと5スポットが表示され、ブラウザコンソールにMaps APIエラーがないことを確認する。
- [ ] 各Piを起動し、ダッシュボードで全機の30秒ハートビート、スポット割当、未送信キュー0件を確認する。
- [ ] 試験に使うスマホで `/admin` にログインし、「この端末で開始前の参加者画面を使う」を押してから「参加者画面を開く」を開く。
  解除していない端末では待機画面が出ることも確認する（spec 4-8、7章）。
- [ ] 予備機を含め、実スマホでQR表示→押印→SSE反映→ACKを1回通す。テスト用セッションを使い、
  本番参加者データを混ぜない。
- [ ] 押印後にWebビルド成果物（画像・`/admin` を含む）が同一のCloud Run URLから読めることを確認する。

## 6. 当日朝（10月31日）の確認

- [ ] Cloud Runの本番設定（min 1、max 1、CPU常時、timeout 3600）を再確認し、以後はデプロイしない。
- [ ] `/api/health`、Cloud Scheduler、Supabaseプロジェクトの稼働状態を確認する。
- [ ] 実スマホでGoogle Mapsと5スポットが表示されること、Maps APIの利用量に異常がないことを確認する。
- [ ] 全5機と予備機のハートビート、電源、ネットワーク、未送信キュー0件をダッシュボードで確認する。
- [ ] 10:00より前の試験押印は、管理画面で解除したスマホで行う。前日に解除した端末は、管理パスワードを変えていなければそのまま使える。
- [ ] 各スポットで1回ずつ試験押印し、機器のスタンプ画像とスマホのスタンプ帳へのSSE反映を確認する。
- [ ] 5スポットを揃えたテストセッションで、スタンプ帳の景品引換券がCOMPLETE表示になり、ホームカミングデイ総合案内で見せる案内文が出ることを目視する。
- [ ] 管理パスワード、機体設定ファイル、予備機を運営担当者だけが扱える状態であることを確認する。
- [ ] 10:00を過ぎたら、解除していないスマホで本番URLを開き、待機画面ではなくスタンプ帳が出ることを確認する。

## 7. イベント終了後

1. Cloud Runを通常設定（min 0、CPUリクエスト時のみ）へ戻す。
2. 必要な集計・CSVを書き出しを行う。データ保存の目安は2026年11月30日までとする。
3. 当日中に未送信キューが残った端末を確認し、必要ならネットワーク回復後に再送してから電源を落とす。
