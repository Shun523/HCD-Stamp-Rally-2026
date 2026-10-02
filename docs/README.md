# 開発文書の参照順

実装時は次の順に参照する。

1. [`spec.md`](spec.md) — 仕様の正本（v1.9正式版）
2. [`design.md`](design.md) — 画面設計の正本。確定済みの設計差分を統合済み
3. [`goals/`](goals/) — 工程別の完了条件
   - `01-server.md`
   - `02-web.md`
   - `03-device.md`
   - `04-integration.md`
4. [`deploy.md`](deploy.md) — 結合完了後のデプロイ手順
5. [`device-test.md`](device-test.md) — 実機（Pi・実スマホ）でのローカル試験と本番試験の手順

旧版、修正案、差分ファイルは正本へ統合し、並行して参照しない。
