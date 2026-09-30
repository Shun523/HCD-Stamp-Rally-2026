# 実機試験手順書

スタンプ機（Raspberry Pi）と実スマホを使い、ローカル環境と本番環境（Cloud Run）の両方で
「端末 → サーバー → スマホ」の押印フローを確認する手順です。デプロイそのものの手順は
[`deploy.md`](deploy.md) に従い、ここでは試験の順序と確認項目をまとめます。

## 全体の流れ

| Step | 場所 | 目的 |
| --- | --- | --- |
| 1 | 開発PC | 自動テスト・lint・型チェックが通ることを確認する |
| 2 | Pi単体 | OS・カメラ・液晶・常駐化のセットアップ |
| 3 | Pi × ローカルサーバー | 6-7 の5分類とキュー再送を実機で確認する |
| 4 | Cloud Run | 本番デプロイ（`deploy.md` 0〜4章） |
| 5 | Pi × 本番 × 実スマホ | 実スマホを含む押印フロー全体を確認する |
| 6 | 後片付け | Cloud Run設定を戻し、テストデータを整理する |

## 事前の注意点

- **実スマホでの確認はStep 5（本番）で行う。** サーバーはセッションCookieを常に `Secure` で
  発行する（5-1）ため、LAN上の `http://<IP>` をスマホで開いてもセッションが保持されない。
  Step 3ではPCブラウザで `http://localhost:8787` を開き、PC画面に表示したQRをPiに読ませて代用する。
- **PiのOSはPython 3.12以上が必要。** Raspberry Pi OS Bookworm は Python 3.11 のため起動できない。
  Trixieベースの Raspberry Pi OS（64bit Lite）を使う。
- **機体とスポットの対応を揃える。** シードは `DEVICE_KEYS_JSON` の記載順に `dev-01 → spot-01`、
  `dev-02 → spot-02` … と割り当て、6台目以降は `spot-01` から繰り返す。各機体の `config.toml` の
  `device.spot_id`（液晶のスタンプ絵柄の選択に使う）をサーバー側の割当と一致させる。
- **デプロイ前に作業ツリーをコミットする。** イメージタグは `git rev-parse --short HEAD` から作るため、
  未コミットの変更があるとタグと中身が一致しない。

## Step 1 開発PCで自動テストを通す

リポジトリ直下で実行する。

```sh
pnpm install
pnpm test && pnpm lint && pnpm typecheck
pnpm test:e2e
```

`device/` で実行する。

```sh
.venv/bin/pytest -v && .venv/bin/ruff check . && .venv/bin/mypy hcd_stamp_device
```

- [ ] すべて成功する。失敗した場合は実機試験へ進まない。

## Step 2 Piを1台セットアップする

1. Raspberry Pi Imager で Raspberry Pi OS（Trixie、64bit Lite）を書き込む。ホスト名・Wi‑Fi・SSHを
   Imagerで設定しておく。
2. `sudo raspi-config` → Interface Options で **SPI を有効**にして再起動する。
3. カメラが認識されていることを確認する。IMX219 が表示されれば合格。

   ```sh
   rpicam-hello --list-cameras
   ```

4. 時刻同期を確認する。RTCが無いため、キューの時刻判定はNTP同期が前提となる（6-7）。

   ```sh
   timedatectl   # System clock synchronized: yes
   ```

5. 開発PCから `device/` を転送する（`.venv` などは除外）。

   ```sh
   rsync -a --exclude .venv --exclude '.*_cache' --exclude '*.egg-info' \
     device/ <pi-host>:/tmp/hcd-device/
   ```

6. Pi上で実行ユーザーとアプリケーションを用意する。Picamera2 は apt 版を使うため、venv は
   `--system-site-packages` で作る。

   ```sh
   sudo apt install -y python3-picamera2 python3-venv
   sudo useradd -r -M -s /usr/sbin/nologin -G video,spi,gpio stamp
   sudo mkdir -p /opt/hcd-stamp-device /etc/hcd-stamp-device
   sudo python3 -m venv --system-site-packages /opt/hcd-stamp-device/.venv
   sudo /opt/hcd-stamp-device/.venv/bin/pip install /tmp/hcd-device \
     adafruit-blinka adafruit-circuitpython-rgb-display
   ```

   pip版numpyとapt版picamera2の組み合わせでカメラ起動時にエラーが出る場合は、
   `sudo apt install -y python3-opencv` を入れ、venvから `opencv-python-headless` と `numpy` を
   アンインストールしてapt版を使う。

7. 設定ファイルを作る。`hardware.backend` は `pi` にし、実機ライブラリが無い場合に
   ダミーで起動してしまわないようにする。

   ```sh
   sudo cp /tmp/hcd-device/config.example.toml /etc/hcd-stamp-device/config.toml
   sudo chown stamp:stamp /etc/hcd-stamp-device/config.toml
   sudo chmod 600 /etc/hcd-stamp-device/config.toml
   sudo nano /etc/hcd-stamp-device/config.toml
   ```

8. 手動で起動して表示を確認する。

   ```sh
   sudo mkdir -p /var/lib/hcd-stamp-device && sudo chown stamp:stamp /var/lib/hcd-stamp-device
   cd /opt/hcd-stamp-device
   sudo -u stamp /opt/hcd-stamp-device/.venv/bin/hcd-stamp-device
   ```

   - [ ] 液晶にカメラ映像が表示される（中央を正方形に切り抜き、反時計回りに90度回転）（6-2）
   - [ ] QRを映すと緑の枠が表示される
   - [ ] 日英の文言が文字化けしない
   - [ ] Ctrl+C で終了し、液晶が黒になる（6-8）

## Step 3 Pi × ローカルサーバー

### 3-1. WSL2のサーバーをLANへ公開する

WSL2は既定で `nat` モードのため、同じLAN上のPiからWSL2内のサーバーへ接続できない。
Windowsでサーバーを立て直す必要はなく、WSL2を `mirrored` モードに切り替える
（Windows 11 22H2以降）。

1. Windows側の `%UserProfile%\.wslconfig` に次を書く（無ければ作る）。

   ```ini
   [wsl2]
   networkingMode=mirrored
   ```

2. PowerShellで `wsl --shutdown` を実行してからWSLを開き直し、切り替わったことを確認する。

   ```sh
   wslinfo --networking-mode   # mirrored
   ip -4 addr                  # WindowsのLAN IPが表示される
   ```

3. **管理者PowerShell**で、WSL向けの受信許可（Hyper-Vファイアウォール）を試験用ポートだけに付ける。

   ```powershell
   New-NetFirewallHyperVRule -Name HCD-Dev-8787 -DisplayName "HCD stamp rally dev 8787" `
     -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' `
     -Protocol TCP -LocalPorts 8787
   ```

4. 試験が終わったらルールを削除する。`.wslconfig` は `mirrored` のままで問題ない。

   ```powershell
   Remove-NetFirewallHyperVRule -Name HCD-Dev-8787
   ```

大学のWi‑Fiは端末間通信が遮断されていることが多い。PiからPCへ届かない場合は、スマホの
テザリングや持ち込みルーターなど、PCとPiが同じセグメントにいるネットワークを使う。

### 3-2. ローカルサーバーを起動する

リポジトリ直下で実行する。機体キーは試験用の値を使い、本番用キーとは分ける。

```sh
npx supabase start
pnpm --filter @hcd-stamp-rally/server db:migrate
DEVICE_KEYS_JSON='{"dev-01":"test"}' pnpm --filter @hcd-stamp-rally/server db:seed
pnpm --filter @hcd-stamp-rally/shared build
pnpm --filter @hcd-stamp-rally/web build
PORT=8787 ADMIN_PASSWORD=pass pnpm --filter @hcd-stamp-rally/server dev
```
試験用キー：test
試験用パスワード：pass
Piの `config.toml` を次のように設定して、疎通を確認する。

```toml
[server]
base_url = "http://<WindowsのLAN IP>:8787"
api_key = "<試験用キー>"
```

```sh
curl http://<WindowsのLAN IP>:8787/api/health   # Piから実行して {"ok":true,"db":"ok"}
```

### 3-3. 確認項目

PCブラウザで `http://localhost:8787`（スタンプ帳）と `http://localhost:8787/admin`
（ダッシュボード）を開き、Piを手動起動した状態で確認する。

| 操作 | 期待する結果 |
| --- | --- |
| Piを起動して60秒待つ | ダッシュボードで dev-01 が「正常」、未送信キュー0件（初回ハートビートは起動30秒後、画面更新は30秒ごと） |
| PC画面のQRをPiに読ませる | 液晶にスタンプ絵柄が2秒表示され、PCのスタンプ帳に即時反映される |
| 同じQRをもう一度読ませる | 絵柄にチェックが重なって2秒表示される（`already`） |
| 無関係なQRを読ませる | ×アイコンと「このQRは使えません」が2秒表示される |
| `api_key` を誤った値にして再起動し、読ませる | 工具アイコンと「スタッフを呼んでください」が5秒表示され、ダッシュボードで「断」になる |
| サーバーを止めて読ませる | 黄色の背景と「あとで反映されます」が3秒表示される。未送信キューが増える |
| そのままPiを再起動し、サーバーを再開する | キューが失われず、5秒間隔で再送されてスタンプ帳に反映される |
| Piの電源を抜いて90秒待つ | ダッシュボードで「断」になり、音またはブラウザ通知が出る |

### 3-4. 常駐化と筐体での確認

1. systemdに登録する。

   ```sh
   sudo cp /tmp/hcd-device/systemd/hcd-stamp-device.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now hcd-stamp-device.service
   journalctl -u hcd-stamp-device -f
   ```

   - [ ] 電源投入からサービス開始まで60秒以内（6-8）
   - [ ] `sudo systemctl kill -s KILL hcd-stamp-device` の5秒後に自動で再起動する
   - [ ] 電源投入を数回繰り返し、液晶のカメラ映像が止まったままにならない。起動直後にカメラが
     止まった場合も、ログに「メインループが5秒止まりました」が出て、15秒ほどで映像が戻る
   - [ ] 再起動を繰り返す機体がダッシュボードで「正常」に見えない。カメラのケーブルを外した状態で電源を入れる（通電中に抜き差ししない）と、90秒ほどで「断」になりアラートが出る

2. 筐体に組み込み、**実スマホを通常の輝度のまま**押し当てて、75×75 CSSピクセルのQRが
   安定して読めることを確認する（6-2）。ここでは読み取りの安定性だけを見る。
3. 数時間連続で稼働させ、発熱とバッテリーの持ちを確認する（6-6、Q-14）。
4. 残りの機体と予備機にも Step 2〜3 を行う。SDカードを複製した場合は、`config.toml` の
   `device.id`、`device.spot_id`、`server.api_key` と、ホスト名を機体ごとに変える。

## Step 4 本番へデプロイする

[`deploy.md`](deploy.md) の0〜4章をそのまま実行する。試験のために次の点を押さえる。

1. 作業ツリーをコミットしてからイメージを作る。
2. 本番用の `DEVICE_KEYS_JSON` は、全機体と予備機の分をローカル試験用とは別のキーで作る。
   記載順がスポット割当になる。
3. RLS確認SQLで `rowsecurity` が全件 `true`、ポリシーが0件であることを確認する。
4. `/api/health` が `{"ok":true,"db":"ok"}` を返すことを確認する。
5. Mapsキーの制限にCloud RunのURLを登録し、キー入りイメージで再デプロイする。
6. **試験期間中は** `deploy.md` 3章のリハーサル日設定（min-instances 1、CPU常時割り当て）にする。
   通常設定のままでは、リクエスト外でハートビート監視が止まり、断検知とSSEの試験結果が
   当日と一致しない。

## Step 5 Pi × 本番 × 実スマホ

各Piの `config.toml` を本番用に書き換えて再起動する。

```toml
[server]
base_url = "https://<Cloud RunのURL>"
api_key = "<本番用キー>"
```

```sh
sudo systemctl restart hcd-stamp-device
```

iOS Safari と Android Chrome の実機で、それぞれ確認する（4-5）。

- [ ] トップ画面が開き、再読み込みしてもスタンプ帳が同じセッションのまま保たれる
- [ ] 日英の切り替えができる
- [ ] マップ画面にGoogle Mapsと5スポットのマーカーが表示され、開発者ツールにMapsのエラーが出ない
- [ ] QRを表示してPiに押し当てると、液晶のスタンプ絵柄とスマホの反映がほぼ同時に起きる（SSE・ACK）
- [ ] 同じスポットで再押印すると、液晶にチェック付き絵柄が出る
- [ ] Piのネットワークを切って押印すると「あとで反映されます」になり、ネットワークを戻すと再送されて
  スマホに反映される（SSEまたは10秒ごとのポーリング）
- [ ] 5スポット分押印するとゴールページへ遷移し、景品交換所の案内が表示される
- [ ] スタッフのスマホで `/admin` を開き、全機体の「正常」と未送信キュー0件、スポット別押印数を確認する
- [ ] 1台の電源を抜くと、90秒後にダッシュボードで「断」になり、音または通知が出る
- [ ] 予備機を同じスポットに差し替えて押印が通る

会場で実際に使うネットワーク（会場Wi‑Fiまたはテザリング）で、少なくとも1台は同じ確認を行う。

試験で作ったセッションは、日時と端末を記録しておき、本番の集計と区別できるようにする。

## Step 6 後片付け

- [ ] Cloud Runを `deploy.md` 3章の通常設定（min-instances 0、CPUリクエスト時のみ）へ戻す
- [ ] 試験で作ったセッションと押印の扱い（削除するか、集計から除外するか）を決める
- [ ] ローカル試験用のHyper-Vファイアウォールルールを削除する
- [ ] 不具合を修正した場合は、**10月30日より前に**再デプロイしてStep 5をやり直す。
  10月30日以降はデプロイしない（`deploy.md` 3章）
- [ ] 前日と当日朝は `deploy.md` 5〜6章のチェックリストに従う
