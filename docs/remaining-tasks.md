# 本番までの残作業

10月5日時点の洗い出し。終わったものから `[x]` にする。
本番URL: `https://hcd-stamp-rally-th6cagb4vq-an.a.run.app`（地図キーの許可はこのURLのみ。別形式の `...71301449694.asia-northeast1.run.app` は使わない）

## 期限

| 日付 | 内容 |
| --- | --- |
| 10月中旬（目安） | 確定コンテンツが揃う。差し替え・Pi再配布・再試験の時間を確保するため |
| 10月29日 | 最終デプロイ。10月30日以降はデプロイしない（deploy.md 3章） |
| 10月30日 | 前日確認（deploy.md 5章） |
| 10月31日 | 当日朝の確認（deploy.md 6章）、イベント |
| 11月30日 | データ保存の目安。集計・CSV書き出しを済ませる |

## A. 当日までに必須

- [ ] **A1 確定コンテンツの入手**（運営側）。提供者と期限が未定（spec Q-32、Q-39）。A2〜A7はこれ待ち
- [ ] A2 スポット情報5件の差し替え（ID、日英の名前、表示順、緯度経度、日英の案内文、設置場所の補足）
  - 現在は `server/src/db/seed.ts` にサンプルを直書き。spec 4-6 は「データファイルの置き換えだけで済む作り」なので、差し替え時にデータを分離する
  - 差し替え後、Supabase に `db:seed` を実行し直す（既存行は上書きされる）
- [ ] A3 画面の文言の差し替え（遊び方3ステップ、完走メッセージ、景品交換所の名称・場所・案内文。日英）: `web/src/data/content.ts`
- [ ] A4 協賛企業の差し替え（日英の企業名、ロゴ、紹介文、リンク、表示順）: `web/src/data/sponsors.ts`、`web/public/images/sponsors/`
- [ ] A5 スタンプ画像の差し替え
  - [ ] Web用5種（SVGまたは背景透過PNG、ファイル名はスポットID）: `web/public/images/stamps/`
  - [ ] Pi用5種（240×240、ファイル名はスポットID）: `device/hcd_stamp_device/assets/stamps/`
- [ ] A6 初回説明画面のスタンプ機の写真: `web/public/images/stamp-machine.svg` を置き換え
- [ ] A7 差し替え後の反映
  - [ ] テスト・lint・型チェック・`pnpm test:e2e` を通す
  - [ ] Mapsキー入りイメージを作り直して再デプロイ（deploy.md 2-3章）
  - [ ] Pi 6台へ機体ソフトを再配布（スタンプ画像が変わるため）
  - [ ] `/admin` 上部のサンプル警告が消えたことを確認
- [ ] A8 チラシ用のQRとURL。本番URLを使う。印刷の締め切りから逆算する
- [ ] A9 リハーサル日の決定。当日は試験期間用の設定（下記「Cloud Run設定」）で臨む
- [ ] A10 一般開放前の待機画面（spec 4-8、ブランチ `feature/pre-event-waiting`）を main へ取り込み、10月29日の最終デプロイに含める。デプロイ後、`/admin` の「参加者画面の公開」に「10月31日（土）10:00」「開始前」と出ることを確認する

## B. 実機試験の残り（device-test.md Step 5）

試験の前に試験期間用の設定へ切り替え、終わったら通常設定へ戻す。
一般開放（10月31日10:00）より前の本番試験は、スマホで `/admin` にログインし、「この端末で開始前の参加者画面を使う」を押してから行う（spec 4-8、7章）。

- [ ] 同じスポットで再押印し、液晶にチェック付きの絵柄が出る
- [ ] Piのネットワークを切って押印 →「あとで反映されます」→ 戻すと再送されてスマホに反映される
- [ ] 5スポット分押印してゴールページへ遷移し、景品交換所の案内が出る
- [ ] Android Chrome で一通り確認する（iOS Safari は確認済み）
- [ ] 予備機（dev-spare-01）を spot-01 に差し替えて押印が通る
- [ ] 会場で実際に使うネットワーク（会場Wi‑Fiまたはテザリング）で、少なくとも1台確認する
- [ ] iOS Safari で、QR表示中に画面が消灯しない（Wake Lock、spec 4-2）
- [ ] 数時間の連続稼働で、発熱とバッテリーの持ちを確認する（spec Q-14。未実施なら）
- [ ] QR 50px での読み取りを、iOS・Android の両方で再確認する
- [ ] Cloud Logging で押印ログが1行のJSON（`jsonPayload.deviceId` など）で出ていることを確認する

## C. 運用の決め事

- [ ] **予備機の差し替え手順を決める**。予備機はサーバー側で spot-01 に固定。別スポットへ回すには、DBの `devices.spot_id` と予備機の `config.toml` の `spot_id` の両方を変える必要がある。SQL手順書にするか、管理画面に変更機能を付けるかを決める（仕様にない判断）
- [ ] 試験で作ったセッションと押印の扱い（削除するか、集計から除外するか）。一般開放前に発行されたセッションはすべて試験用（spec 4-8）なので、`sessions.created_at` が10月31日10:00より前のものとして除外できる
- [ ] 当日のスタッフ体制（`/admin` を見る人、機体トラブルの対応者、予備機の保管者）

## D. セキュリティと後片付け

- [ ] 管理パスワードを推測されにくいものに変える（Secret Manager `hcd-admin-password` に新しい版を追加 → 再デプロイ）。変更すると開始前の解除がすべて無効になるので、前日確認・当日朝の確認に使うスマホは変更後に `/admin` で解除し直す
- [ ] 開発中の会話記録に機体キー・DBパスワードの一部・Mapsキーが表示された。記録を共有するなら、機体キーとDBパスワードを作り直す
- [ ] Google Cloud の予算アラートと、Maps API の利用量アラートを設定する
- [ ] ローカル試験用のHyper-Vファイアウォールルールを削除する（Windowsの管理者PowerShellで `Remove-NetFirewallHyperVRule -Name HCD-Dev-8787`）

## E. 前日・当日・事後

- [ ] 10月29日までに最終デプロイ
- [ ] 10月30日: 試験期間用の設定へ切り替え、deploy.md 5章のチェックリスト
- [ ] 10月31日朝: deploy.md 6章のチェックリスト。以後デプロイしない
- [ ] 10月31日イベント後: 未送信キューが残った機体を確認し、必要なら再送してから電源を切る（11月1日0:00に機体のキューは自動で消える）
- [ ] 終了後すぐ: Cloud Run を通常設定に戻す
- [ ] 11月30日まで: 集計とCSVの書き出し

## Cloud Run設定

試験・リハーサル・10月30日〜31日:

```sh
gcloud run services update hcd-stamp-rally --region=asia-northeast1 --timeout=3600 --min-instances=1 --max-instances=1 --concurrency=1000 --no-cpu-throttling
```

それ以外（通常）:

```sh
gcloud run services update hcd-stamp-rally --region=asia-northeast1 --min-instances=0 --max-instances=1 --cpu-throttling
```

## 完了済み（参考）

- 自動テスト、Pi単体のセットアップ、Pi × ローカルサーバーの試験（device-test.md Step 1〜3）
- 本番デプロイ（deploy.md 0〜4章）: Supabaseのマイグレーションとシード、RLS確認、Secret Manager、Mapsキーの制限、Cloud Scheduler
- Step 5 の一部: 押印とSSE・ACK、再読み込みでセッション維持、日英切り替え、地図表示、`/admin`、断の検知
- QRを50pxへ縮小（spec v1.9）、サーバーログの1行JSON化
- スポットごとにQRを変える案は見送り（今の設計を維持）。将来入れる場合は「記録はして案内を出す」中間案から検討する
