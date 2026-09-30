# スタンプ機制御ソフト

Raspberry Pi Zero 2 WHのカメラ・GC9A01A液晶を制御し、QRを読み取って
サーバーへ押印を送信する独立したPythonプロジェクトです。仕様書6章に従い、
通信不能時はファイルキューに退避して再送します。

## セットアップ

開発PCではダミーのカメラ・液晶で起動できます。Python 3.12以上で実行してください。

```sh
cd device
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp config.example.toml config.toml
```

`config.toml` の `server.base_url`、`server.api_key`、`device.id`、`device.spot_id` を設定します。
APIキーをGitへ追加しないでください。開発PCで起動する場合は
`[hardware].backend = "dummy"` にします。

```sh
.venv/bin/hcd-stamp-device --config config.toml
```

`auto` はPi用ライブラリが見つかる実機ではカメラと液晶を、見つからないPCでは
ダミーを使います。実機ではOpenCV、Picamera2、Blinka、
`adafruit-circuitpython-rgb-display`も導入してください。設定されるカメラは
640×480・15fpsで、3フレームに1回だけ `cv2.QRCodeDetector` が解析します。

## 模擬端末モード

カメラや液晶を使わず、本番と同じHTTPクライアント・永続キューを通してトークンを
送るモードです。ローカル結合試験で使用します。

```sh
.venv/bin/hcd-stamp-device --config config.toml --simulate-token '<押印トークン>'
.venv/bin/hcd-stamp-device --config config.toml --simulate-resend
```

前者でサーバーへ到達できない場合は、通常の端末と同じように
`storage.queue_file` へ一時保存します。サーバー復旧後に後者を実行すると、最古の
未送信レコードを再送します。実機の常駐プロセスは従来どおり5秒間隔で自動再送します。
10月31日16:00までに一時保存したレコードは同日中だけ再送し、日本時間の11月1日0:00に
全キューを削除します。停止中に日付をまたいだ場合も、次回起動時に削除します。

## 資産

`hcd_stamp_device/assets/stamps/` に `spot-01`〜`spot-05` の仮の240×240 PNGを
同梱しています。確定絵柄が届いたら、同名・同寸法のPNGまたはJPEG（`.jpg`）へ差し替えてください。
画像は起動時に5枚ともメモリへ読み込まれます。

日英の液晶表示には同梱のIPAexゴシックを使います。IPA Font License v1.0の情報は
`hcd_stamp_device/assets/fonts/LICENSE-IPA-1.0.txt` を参照してください。

## 検証

以下はそれぞれ1コマンドで実行できます。

```sh
.venv/bin/pytest -v                  # 単体テスト
.venv/bin/ruff check .               # lint
.venv/bin/mypy hcd_stamp_device      # 型チェック
```

単体テストはHTTPをモックし、送信結果の5分類、ファイル永続キュー、再送、
ハートビートの未送信件数、およびダミーカメラ・液晶での起動と安全終了を確認します。
外部サービスには接続しません。

## Pi常駐化

`systemd/hcd-stamp-device.service` を `/etc/systemd/system/` へ配置し、
アプリケーションを `/opt/hcd-stamp-device`、設定ファイルを
`/etc/hcd-stamp-device/config.toml` に配置します。NTP同期を有効にしてから、以下を実行します。

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now hcd-stamp-device.service
```

unitはネットワーク時刻同期後に開始し、異常終了時は5秒後に自動再起動します。
`StateDirectory` により再送キュー用の `/var/lib/hcd-stamp-device` はsystemdが作成します。
Ctrl+Cまたはsystemd停止時には送信中の1件を終え、カメラを解放して液晶を黒へ戻します。
メインループが5秒止まった場合（libcameraの `Camera frontend has timed out!` でフレームが
届かなくなった場合など）は、送信中の1件を終えてから終了コード1で終了し、systemdに再起動させます。
