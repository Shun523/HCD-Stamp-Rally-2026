# データの記録・書き出し・分析

イベント（2026-10-31）で記録されるデータ、イベント後に書き出す方法、分析できること、サービスを閉じる手順をまとめる。データの保存期間は仕様11章に従い、2026-11-30を目安とする。

## 1. 記録しているデータ

### DB（Supabase）

| 表 | 1行の単位 | 主な項目 | 書き出し |
| --- | --- | --- | --- |
| `sessions` | 参加者（ブラウザ1つ） | 初めて開いた時刻、User-Agent | する（IDは通し番号に置き換え） |
| `stamps` | 押印の成立 | 参加者、スポット、機体、QRを読んだ時刻、何番目に押したか | する |
| `deliveries` | 押印の通知 | 通知の結果（`acked`／`delivered`／`timeout`／`pending`）と時刻 | する |
| `devices` | 機体 | 担当スポット、最後のハートビート時刻と状態 | する（APIキーのハッシュは除く） |
| `spots` | スポット | 名前、表示順、座標 | 名前だけ集計に使う |
| `stamp_tokens` | 押印トークン | QRの中身 | しない |

- 参加者は**ブラウザ単位**で数える。同じ人が別のアプリやブラウザで開くと2人になり、1台のスマホを家族で使うと1人になる
- 一般開放（10月31日10:00）より前に作られたセッションは、すべてスタッフの試験用（仕様4-8）。集計では自動で除く
- ページを開くだけでセッションが作られるため、LINEやSlackにURLを貼ると、プレビューを作るボットのセッションもできる。当日は一般開放後だけで113件あった。集計では User-Agent で判定して除く
- `stamps.stamped_at` は**機体がQRを読んだ時刻**（機体の時計）。オフラインで一時保存された押印も、読んだ時刻で記録される
- `deliveries.result` の意味（仕様5-4）
  - `acked`: スマホに通知が届き、受信確認（ACK）が返った。3秒を過ぎてから返った場合は `ack_timed_out_at` にも時刻が入る
  - `timeout`: 3秒以内にACKが返らなかった。通知先のスマホが接続していなかった場合を含む（そのときは `delivered_at` が空）。押印自体は成立していて、スマホには10秒ごとの確認で反映される
  - `delivered`／`pending`: ACKを待っている間にサーバーが止まり、結果が書かれなかった。`delivered` は通知を送った後、`pending` は送る前

### Cloud Logging（サーバーのログ）

保存期間は既定で**30日**。イベント後に書き出さないと消える。

- 押印ごとのログ（`stamp ACK received`／`stamp ACK timed out`）: 機体ID、ACKの有無、保存にかかった時間（`server_save_ms`）、通知にかかった時間（`sse_publish_ms`）、ACKを待った時間（`ack_wait_ms`）
- ハートビートのログ（`device heartbeat`、仕様5-6）: 30秒ごとに、機体ID、稼働時間、直近の押印成功数、未送信キューの件数、電池残量
- 2回目の押印のログ（`stamp already collected`、仕様5-3）: 機体ID、スポットID。セッションIDは出さない
- 管理画面の認証失敗
- Cloud Runが自動で残すリクエストログ: すべてのAPI呼び出しの時刻、パス、応答コード、応答時間、User-Agent、IPアドレス

### Cloud Monitoring（Cloud Runのグラフ）

リクエスト数、応答時間、CPU・メモリ、インスタンス数。保存期間はおよそ6週間で、数値として書き出すより画面のスクリーンショットで残すほうが手軽。

### 機体（Pi）のログ

`journalctl -u hcd-stamp-device` で見られる。QRを読んだこと、送信結果（`stamped`／`already`／`temporarily_saved`／`invalid_token`／`device_auth_error`）、ハートビートの送信失敗、再送、キューの削除が残る。QRの中身（押印トークン）もログに出るので、生データとして扱う。

## 2. 記録していないもの

| 知りたいこと | 状況 |
| --- | --- |
| 画面の表示回数、マップ・紹介タブの利用、紹介のリンクのクリック、言語の切り替え、QRを開いた回数 | アクセス解析を入れていないので記録しない |
| 同じスポットでの2回目の押印の、参加者ごとの内訳 | DBには成立した最初の1回だけが残る。ログには機体とスポットだけを出すので、誰が押したかは分からない |
| 読み取れなかったQR、無効なQR | DBに残らない。機体ログと、Cloud Runのリクエストログの404に残る |
| サーバーが押印を受け取った時刻 | 残らない。オフライン再送の遅れは、`delivered_at`（通知した時刻）と `stamped_at` の差で推定するしかない（通知先が無ければ分からない） |
| 名前、連絡先、学年などの属性 | 集めていない。IPアドレスはDBに保存しないが、Cloud Runのリクエストログには残る |

## 3. 分析できること

| 問い | 使うデータ | 書き出しでの場所 |
| --- | --- | --- |
| 何人参加し、何人完走したか（完走率） | `sessions`、`stamps` | `summary.md` |
| どこで止まったか（スタンプ数の分布） | `stamps` | `stamp-count-distribution.csv` |
| どのスポットが多く押されたか、最初にどこへ行ったか | `stamps` の `spot_id`、`visit_order` | `by-spot.csv` |
| 回る順番のパターン | `stamps` を参加者ごとに `visit_order` 順に並べる | `raw/stamps.csv` から自分で集計 |
| 混雑した時間帯、参加・押印・完走のピーク | `sessions.created_at`、`stamps.stamped_at` | `by-time.csv`（30分ごと） |
| 完走までにかかった時間 | 参加者ごとの最初と最後の押印 | `summary.md`（中央値・最短・最長） |
| スポット間の移動時間 | 参加者ごとの連続する押印の時刻差 | `raw/stamps.csv` から自分で集計 |
| 機体ごとの押印数 | `stamps.device_id` | `by-device.csv` |
| 予備機を使った時間帯 | 差し替えの記録（device.md 5-4）。予備機は故障機の機体IDで動くので、`device_id` では区別できない。ハートビートのログでは再起動として表れる | `devices.csv` の `restarts` |
| 参加者の端末とブラウザ、LINEなどアプリ内ブラウザの割合 | `sessions.user_agent` | `browsers.csv` |
| 押印が画面にすぐ届いたか（ACK到達率） | `deliveries` | `summary.md` |
| サーバーの処理時間 | Cloud Loggingの押印ログ | `ack-latency.csv` |
| 機体が止まっていた時間、再起動、未送信の溜まり具合、電池の減り方 | ハートビートのログ | `devices.csv`、`raw/heartbeats.csv` |
| 同じスポットで2回押された回数 | 2回目の押印のログ | `devices.csv`、`raw/already-stamps.csv` |
| 機体のトラブルの詳しい経緯（読み取り、送信結果、再送） | 機体ログ | 機体ごとのログファイル |
| 来場者のうち何割が参加したか | 参加者数と、運営が発表する来場者数 | 運営の数字と組み合わせる |

アプリ内ブラウザ（LINEなど）は保存先が普通のブラウザと分かれるため、「スタンプが消えた」問い合わせと関係しやすい（仕様4-1）。`browsers.csv` で割合を確認できる。

## 4. イベント後の書き出し

書き出し先はリポジトリ直下の `exports/` とする（`.gitignore` 済みで、コミットされない）。以下の例では `exports/2026-10-31/` に置く。`$PROJECT_ID` などは deploy.md 0章の値を設定してから使う。

### 4-1. 当日のうちに

- `/admin` の画面を1時間ごとなどにスクリーンショットで残す。機体の状態や参加状況の移り変わりは、ほかに残らない
- 機体の電源を切る前に、機体ごとのログを保存する。ログがSDカードに残る設定か（`journalctl --list-boots` で前回の起動が出るか）にかかわらず、電源を切る前に取っておく

Pi上で（機体ごと）:

```sh
journalctl -u hcd-stamp-device --since "2026-10-31 00:00" --no-pager > ~/hcd-device-2026-10-31.log
```

開発PCのリポジトリ直下で（機体ごと）:

```sh
mkdir -p exports/2026-10-31/devices
scp <ユーザー>@<機体のアドレス>:~/hcd-device-2026-10-31.log exports/2026-10-31/devices/<機体ID>.log
```

### 4-2. Cloud Loggingの書き出し（11月中旬まで）

アプリのログ（押印・ハートビート・2回目の押印。集計用）と、すべてのログ（調べもの用）を書き出す。時刻の範囲は10月31日（日本時間）の1日分。

```sh
mkdir -p exports/2026-10-31
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="'"$SERVICE"'" AND jsonPayload.message:* AND timestamp>="2026-10-30T15:00:00Z" AND timestamp<"2026-10-31T15:00:00Z"' \
  --project="$PROJECT_ID" --format=json > exports/2026-10-31/cloud-logging-app.json
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="'"$SERVICE"'" AND timestamp>="2026-10-30T15:00:00Z" AND timestamp<"2026-10-31T15:00:00Z"' \
  --project="$PROJECT_ID" --format=json > exports/2026-10-31/cloud-logging-all.json
```

### 4-3. DBの書き出しと集計

本番の接続文字列（Session pooler）を渡して実行する。DBは読むだけで変更しないので、何度実行してもよい。

```sh
DATABASE_URL="$SUPABASE_SESSION_URL" pnpm --filter @hcd-stamp-rally/server db:export \
  --out ../exports/2026-10-31 --logs ../exports/2026-10-31/cloud-logging-app.json
```

`--out` と `--logs` は `server/` から見たパスで書く。`--logs` を省くと、処理時間と機体の状態の集計が抜ける。

出力:

| ファイル | 内容 | 保存 |
| --- | --- | --- |
| `raw/sessions.csv` | 参加者ごとの開始時刻、試験用かどうか、ボットかどうか、OS、ブラウザ、User-Agent | 11月30日までに削除 |
| `raw/stamps.csv` | 押印ごとの参加者、スポット、時刻、何番目か、機体 | 11月30日までに削除 |
| `raw/deliveries.csv` | 押印ごとの通知結果と時刻 | 11月30日までに削除 |
| `raw/devices.csv` | 機体ごとの担当スポット、最後のハートビート | 11月30日までに削除 |
| `raw/ack-logs.csv` | 押印ログ（`--logs` を指定した場合。以下2つも同じ） | 11月30日までに削除 |
| `raw/heartbeats.csv` | ハートビートのログ | 11月30日までに削除 |
| `raw/already-stamps.csv` | 2回目の押印のログ | 11月30日までに削除 |
| `summary/summary.md` | 主な数字と表をまとめたもの | 残してよい |
| `summary/*.csv` | スポット別、時間帯別、スタンプ数の分布、機体別、ブラウザ別、処理時間、機体の状態（`devices.csv`） | 残してよい |

- 参加者は `p0001` から作成順の通し番号に置き換える。セッションIDはCookieの値そのものなので、書き出しには出さない。番号は書き出すたびに振り直す
- CSVはUTF-8（BOM付き）で、Excelでそのまま開ける。User-Agent のように参加者が送った値は、式として解釈されないよう先頭に `'` を付ける場合がある
- 試験用（一般開放前）のセッションは `raw/` には `is_test=true` として残し、`summary/` からは除く。ボット（LINE・Facebook・Slackのリンクのプレビューと、当日HTMLだけを取りに来たクローラー）も同じく `is_bot=true` として残し、`summary/` からは除く

### 4-4. そのほか

- Cloud Runの「指標」タブで期間を10月31日にし、リクエスト数・レイテンシ・CPU・メモリのグラフをスクリーンショットで残す
- 最終デプロイしたコミットにタグを付けて、当日どのコードで動いていたかを残す（例: `git tag event-2026-10-31 <コミット>`）

## 5. データの扱い

- 生データ（`raw/`、Cloud Loggingの書き出し、機体ログ、Supabaseの中身）は、仕様11章に従い**11月30日までに削除**する。それまでの間も、共有は運営に関わるメンバーに限る
- `summary/` は参加者ごとの値を含まない集計なので、報告や翌年の参考に残してよい
- 翌年度への引き継ぎは考慮しない（仕様11章）。生データを長く残したい場合は、仕様の変更として決める

## 6. サービスを閉じる手順

書き出しを終えてから閉じる。順番を守らないと、書き出せなくなるものがある。

1. **10月31日イベント終了後**: Cloud Runを通常設定に戻す（deploy.md 7章）。機体はログを保存してから `sudo poweroff` で電源を切る（4-1）
2. **11月中旬まで**（Cloud Loggingは30日で消える）: 4-2〜4-4の書き出しをして、`summary.md` の数字を確認する
3. **書き出しを確認したら**: Google Cloudの資源を消す。予算アラートは最後まで残す

```sh
gcloud run services delete "$SERVICE" --region="$REGION" --project="$PROJECT_ID"
gcloud scheduler jobs delete hcd-supabase-health --location="$REGION" --project="$PROJECT_ID"
gcloud secrets delete hcd-database-url --project="$PROJECT_ID"
gcloud secrets delete hcd-device-keys --project="$PROJECT_ID"
gcloud secrets delete hcd-admin-password --project="$PROJECT_ID"
```

   あわせて、Artifact Registryのイメージ（リポジトリ）と、Maps APIキーをコンソールから削除する。Cloud Schedulerを消すと、無料プランのSupabaseは1週間ほどで一時停止する（データは消えず、ダッシュボードから再開できる）
4. **11月30日まで**: Supabaseのプロジェクトを削除する。`exports/` の `raw/`、Cloud Loggingの書き出し、機体ログも削除し、`summary/` だけを残す
