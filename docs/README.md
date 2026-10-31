# 開発文書の参照順

実装時は次の順に参照する。

1. [`spec.md`](spec.md) — 仕様の正本（v1.18正式版）
2. [`design.md`](design.md) — 画面設計の正本（v1.11正式版）。確定済みの設計差分を統合済み
3. [`goals/`](goals/) — 工程別の完了条件
   - `01-server.md`
   - `02-web.md`
   - `03-device.md`
   - `04-integration.md`

運用の文書:

- [`remaining-tasks.md`](remaining-tasks.md) — 本番までの残作業と、日ごとにやること。ここから各手順へたどる
- [`deploy.md`](deploy.md) — サーバー（Cloud Run・Supabase）のデプロイ、試験期間用の設定、前日と当日朝の確認
- [`device.md`](device.md) — スタンプ機のセットアップ、機体ソフトの配り直し、ポケットWi‑Fi、実機試験、予備機への差し替え
- [`data.md`](data.md) — 記録しているデータ、イベント後の書き出しと分析、サービスを閉じる手順

旧版、修正案、差分ファイルは正本へ統合し、並行して参照しない。
