# AGENTS.md

岡山大学ホームカミングデイ デジタルスタンプラリーの実装リポジトリ。

## 仕様
- 仕様の正は docs/spec.md（デジタルスタンプラリー 仕様書 v1.9）。実装と仕様が食い違ったら仕様に従う
- 画面の見た目は docs/design.md に従う
- 作業単位ごとの完了条件は docs/goals/ にある
- 仕様に書かれていない判断が必要になったら、推測で決めずに作業を止め、選択肢と推奨を添えて質問する

## ディレクトリ
- shared/ … サーバーとWebで共有するAPIの型定義（Zodスキーマ）
- server/ … バックエンド（TypeScript + Node.js + Hono）。DBはSupabase（PostgreSQL）で、Drizzle ORMから接続する。web/ のビルド成果物も配信する
- web/ … 参加者向けWebアプリとスタッフ用ダッシュボード（TypeScript + React + Vite）
- device/ … スタンプ機制御ソフト（Python）。仕様6章に従い新規に実装する
- reference/ … 試作時のコード（qr_camera_lcs.py など）。液晶の初期化などの参考にしてよいが、改変しない
- docs/ … 仕様書、設計、完了条件、手順書。参照順は docs/README.md に従う

## 技術上の決まり
- pnpm ワークスペースで shared/・server/・web/ を管理する。device/ は独立した Python プロジェクトとする
- API のリクエストとレスポンスは shared/ の Zod スキーマで定義し、server/ と web/ の両方から参照する
- Supabase は純粋な PostgreSQL として使う。接続文字列は Session mode のプーラーのものを使う
- 仕様書の章番号（例：6-7）を、該当する実装のコメントに書く
- web/ の色・枠線・影・角丸・フォントは web/src/styles/tokens.css の変数だけを使う

## 禁止事項
- Cloud Run など本番環境へのデプロイを実行しない
- Supabase のクライアントライブラリ（supabase-js）、認証機能、Realtime は使わない。DB にはサーバーからのみ接続する
- APIキー・接続文字列・認証情報をコミットしない。環境変数か gitignore 済みの設定ファイルで受け取る
- 利用者から仕様・設計・完了条件の変更を明示された場合を除き、docs/spec.md、docs/design.md、docs/goals/ を編集しない
- 完了条件を満たすためにテストを削除したり、期待値を実装に合わせて書き換えたりしない

## 検証
- 各ディレクトリで、テスト・lint・型チェックをそれぞれ1コマンドで実行できるようにし、README に書く
- 完了の判断は、そのコマンドが実際に成功したことで行う
- テストに外部サービス（本番の Supabase、Google Maps）を使わない。ローカルの PostgreSQL（Supabase CLI）とモックで行う
