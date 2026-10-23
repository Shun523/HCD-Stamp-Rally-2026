# 実機試験手順書

スタンプ機（Raspberry Pi）と実スマホを使い、ローカル環境と本番環境（Cloud Run）の両方で
「端末 → サーバー → スマホ」の押印フローを確認する手順です。デプロイそのものの手順は
[`deploy.md`](deploy.md) に従い、ここでは試験の順序と確認項目をまとめます。

## 全体の流れ

| Step | 場所 | 目的 |
| --- | --- | --- |
| 1 | 開発PC | 自動テスト・lint・型チェックが通ることを確認する |
| 2 | Pi × 普段のWi-Fi | OS・SSH・コード導入・カメラと液晶の動作確認 |
| 3 | Pi × ローカルサーバー | 6-7 の5分類とキュー再送を実機で確認する |
| 4 | Cloud Run | 本番デプロイ（`deploy.md` 0〜4章） |
| 5 | Pi × 本番 × 実スマホ | 普段のWi-Fiで押印確認後、ポケットWi-Fiを追加して接続・押印確認 |
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

**最初は自宅など、普段使っているWi-Fiで作業する。** OSを書き込む → SSHで入る →
カメラ単体で撮影する → コードを入れる → 液晶にカメラ映像が出ることを確認する、の順に進める。
ポケットWi-FiはStep 5で追加する。パッケージのダウンロードも普段のWi-Fiで済ませる。

以下の `<SSHユーザー>` と `<Piホスト名>` は、Imagerで自分が設定した値に置き換える。
SSH用のユーザーと、後で作るアプリ実行用ユーザー `stamp` は別のユーザー。

**カメラ本体と制御ライブラリの名前について。** 今回`hcd-dev-04`で認識されたカメラ本体は
**Raspberry Pi Camera Module 3（IMX708）**。以下の **Picamera2** はカメラを制御する
Pythonライブラリの名前で、Camera Module 3にも使う。導入するパッケージ名は
`python3-picamera2`のままでよい。仕様6-1の`IMX219`は、試験機で認識されたセンサー名。

### 2-1. OSを書き込み、最初のWi-FiとSSHを設定する（開発PC）

1. Raspberry Pi Imagerで機種を **Raspberry Pi Zero 2 W** にする。OSの選択画面で
   **Raspberry Pi OS (other)**（その他）を開き、**Raspberry Pi OS Lite (64-bit)** を選ぶ。
   説明が **Debian Trixie・デスクトップなし** のものを使う（6-1）。
   一覧に見つからない場合は、[公式OSダウンロードページ](https://www.raspberrypi.com/software/operating-systems/)
   の **Raspberry Pi OS (64-bit)** の節にある **Raspberry Pi OS Lite** をダウンロードし、
   Imagerの **Use Custom**（カスタムイメージを使う）でその`.img.xz`ファイルを選ぶ。
   **Legacy / Bookworm** はPythonのバージョンが要件を満たさないため選ばない。
2. 書き込み前のOSカスタマイズで、次を設定する。画面の名称はImagerの版によって異なる。

   | 項目 | 設定する内容 |
   | --- | --- |
   | ホスト名 | 機体ごとに異なる名前。例：`hcd-dev-01` |
   | ユーザー | SSHでログインするユーザー名とパスワード |
   | Wi-Fi | 普段使うWi-FiのSSIDとパスワード。Pi Zero 2 Wが接続できる2.4GHzを使う |
   | 国・地域 | 日本（Wi-Fiの国設定は`JP`）、タイムゾーンは`Asia/Tokyo` |
   | SSH | 有効にする。上で設定したユーザーのパスワード認証、または手元のSSH公開鍵を設定する |
   | Enable Raspberry Pi Connect | 今回の手順ではオフのままでよい。同じLANからSSHで作業するため不要 |

   Raspberry Pi Connectは、Raspberry Pi IDと機体を紐づけ、インターネット経由でブラウザから
   遠隔操作する任意のサービス。詳しくは [公式Connect手順](https://www.raspberrypi.com/documentation/services/connect.html)
   を参照。SSHの有効化は上のSSH設定で行う。

3. Piの電源を切った状態でカメラ・液晶の配線を確認し、microSDカードを挿して電源を入れる。
   液晶の信号線は仕様6-1の対応表に従う。カメラケーブルは通電中に抜き差ししない。
4. 初回起動の処理が終わるまで数分待つ。開発PCも同じLANへ接続しておく。

Imagerの設定画面は [Raspberry Pi公式の初期セットアップ手順](https://www.raspberrypi.com/documentation/computers/getting-started.html#install-an-operating-system)
も参照できる。

### 2-2. SSHで入り、OSとネットワークを確認する

**開発PCで実行する。** WindowsのPowerShell、WSL、macOS、Linuxのターミナルから接続できる。

```sh
ssh <SSHユーザー>@<Piホスト名>.local
```

初回は接続先を確認してホスト鍵を登録し、Imagerで設定した認証方法でログインする。
`.local` で見つからない場合は、Wi-Fiルーターの接続端末一覧でPiのIPアドレスを調べ、
`ssh <SSHユーザー>@<PiのIPアドレス>` で接続する。大学・ゲスト用Wi-Fiなどで端末間通信が
遮断されている場合は、端末同士が通信できる自宅のWi-Fiや持ち込みルーターを使う。

**SSHで入ったPi上で実行する。**

```sh
cat /etc/os-release
getconf LONG_BIT
python3 --version
nmcli device status
hostname -I
timedatectl
```

- [ ] OSはTrixie、64bit、Pythonは3.12以上
- [ ] `wlan0` が普段のWi-Fiへ接続している
- [ ] `System clock synchronized: yes`。RTCが無いため、キューの時刻判定はNTP同期が前提（6-7）

### 2-3. SPIを有効にし、カメラ単体で撮影する（Pi）

1. パッケージ一覧を更新し、転送・Python用のパッケージを入れる。カメラ制御ライブラリのPicamera2はapt版を使い、
   Lite環境向けにGUIの推奨パッケージを省く。

   ```sh
   sudo apt update
   sudo apt install -y rsync python3-venv python3-dev build-essential
   sudo apt install -y --no-install-recommends python3-picamera2
   ```

2. `sudo raspi-config` → Interface Options で **SPIを有効**にして、`sudo reboot` で再起動する。
   SSHが切れるので、起動を待って2-2と同じコマンドで入り直す。
3. SPIとカメラの認識を確認する。

   ```sh
   ls -l /dev/spidev0.*
   rpicam-hello --list-cameras
   ```

   - [ ] `/dev/spidev0.0` がある
   - [ ] カメラが一覧に表示される。仕様6-1の試験機は`imx219`だが、Camera Module 3では
     `imx708`と表示される。センサー名が違うだけでは異常ではない。次の撮影確認も行う

4. **一覧に出るだけでなく、実際に撮影できることも確認する。** SSHとLite環境なので、
   プレビュー画面を開かず、JPEGへ保存する。

   ```sh
   rpicam-still --nopreview --timeout 2000 --width 640 --height 480 --output /tmp/camera-test.jpg
   ```

   別のターミナルを開き、**開発PCで**画像を取り出す。

   ```sh
   scp <SSHユーザー>@<Piホスト名>.local:/tmp/camera-test.jpg ./camera-test.jpg
   ```

   - [ ] PCで画像を開き、カメラの前の物が写っている

   このコマンドは円形液晶には映像を出さない。液晶表示は2-6で確認する。
   撮影が失敗した場合はコード導入へ進まず、電源を切ってカメラケーブルの向き・差し込みを確認する。

撮影コマンドは [Raspberry Pi公式のカメラ手順](https://www.raspberrypi.com/documentation/computers/camera_software.html)
を、apt版の導入は [Picamera2公式README](https://github.com/raspberrypi/picamera2#installation) を参照。

### 2-4. コードを転送し、インストールする

**開発PCのリポジトリ直下で実行する。** Windowsの場合、この`rsync`はWSLのターミナルで実行する。
Piの名前がWSLから解決できない場合は、2-2で確認したIPアドレスを使う。
`.venv`やローカルの設定ファイルは転送しない。

```sh
rsync -a --exclude .venv --exclude '.*_cache' --exclude '*.egg-info' \
  --exclude __pycache__ --exclude config.toml \
  device/ <SSHユーザー>@<Piホスト名>.local:/tmp/hcd-device/
```

**Pi上で実行する。** 新規セットアップの機体で、実行ユーザーとアプリケーションを用意する。
Picamera2はapt版を使うため、venvは`--system-site-packages`で作る。

```sh
sudo useradd -r -M -s /usr/sbin/nologin -G video,spi,gpio stamp
sudo mkdir -p /opt/hcd-stamp-device /etc/hcd-stamp-device
sudo python3 -m venv --system-site-packages /opt/hcd-stamp-device/.venv
sudo apt install -y python3-dev build-essential
sudo /opt/hcd-stamp-device/.venv/bin/pip install /tmp/hcd-device \
  adafruit-blinka adafruit-circuitpython-rgb-display
```

`python3-dev`は、Blinkaの依存ライブラリ（`RPi.GPIO`、`rpi_ws281x`など）をビルドする際の
`Python.h`を用意するために必要。`build-essential`はコンパイラなどのビルド用ツールを用意する。
`fatal error: Python.h: No such file or directory`で止まった場合は、Pi上で次を実行する。
既に作ったユーザーやvenvはそのままで、失敗したインストールだけをやり直す。

```sh
sudo apt install -y python3-dev build-essential
sudo /opt/hcd-stamp-device/.venv/bin/pip install /tmp/hcd-device \
  adafruit-blinka adafruit-circuitpython-rgb-display
```

pip版numpyとapt版Picamera2の組み合わせでカメラ起動時にエラーが出る場合は、次でapt版の
OpenCV・numpyを使う。削除するのはこのvenvへpipで入れたものだけ。

```sh
sudo apt install -y python3-opencv
sudo /opt/hcd-stamp-device/.venv/bin/pip uninstall -y opencv-python-headless numpy
```

**全機体で、アプリのvenvからカメラ制御ライブラリを読み込めることを確認する。**
カメラ単体の`rpicam-still`が成功していても、Pythonライブラリの導入確認は別に必要。

```sh
sudo -u stamp /opt/hcd-stamp-device/.venv/bin/python -c 'from picamera2 import Picamera2; print("Picamera2 OK")'
```

`ModuleNotFoundError: No module named 'picamera2'`の場合は、apt版の未導入、またはvenvから
システムのライブラリを参照できていない可能性がある。常駐化済みの場合は、先に
`sudo systemctl stop hcd-stamp-device`で再起動の繰り返しを止め、次を実行する。

```sh
sudo apt install -y --no-install-recommends python3-picamera2
sudo python3 -m venv --system-site-packages --without-pip /opt/hcd-stamp-device/.venv
sudo -u stamp /opt/hcd-stamp-device/.venv/bin/python -c 'from picamera2 import Picamera2; print("Picamera2 OK")'
```

既存のvenvを再利用して参照設定を更新する。`--clear`は付けず、導入済みのアプリと依存パッケージを
残す。`Picamera2 OK`が出たら次へ進む。常駐化済みの機体は
`sudo systemctl start hcd-stamp-device`で戻す。numpyの互換性エラーになった場合は上のapt版への
切り替え手順を使い、もう一度読み込みを確認する。

**インストールが成功したら、全機体で次を実行する。** エラー後にインストールをやり直した場合も
この手順が必要。pipはアプリを入れるが、systemdのserviceファイルは配置しない。

```sh
sudo cp /tmp/hcd-device/systemd/hcd-stamp-device.service /opt/hcd-stamp-device/
ls -l /opt/hcd-stamp-device/hcd-stamp-device.service
```

serviceファイルが表示されることを確認して2-5へ進む。`/tmp/hcd-device/`は再起動で消えることが
あるため、常駐化用のファイルを`/opt/hcd-stamp-device/`へ保存しておき、3-4で使う。

### 2-5. 機体の設定ファイルを作る（Pi）

```sh
sudo cp /tmp/hcd-device/config.example.toml /etc/hcd-stamp-device/config.toml
sudo chown stamp:stamp /etc/hcd-stamp-device/config.toml
sudo chmod 600 /etc/hcd-stamp-device/config.toml
sudo nano /etc/hcd-stamp-device/config.toml
```

次の値を確認する。

| 設定 | 内容 |
| --- | --- |
| `server.base_url` | Step 3で使うローカルサーバーのURL（`http://<WindowsのLAN IP>:8787`） |
| `server.api_key` | ローカル試験用キー。Step 3の例では`test` |
| `device.id` | 機体ID。最初の試験機は`dev-01` |
| `device.spot_id` | サーバー側の割当と同じスポットID。最初の試験機は`spot-01` |
| `storage.queue_file` | `/var/lib/hcd-stamp-device/pending-stamps.json`（ひな形のまま） |
| `hardware.backend` | **`pi`に変更**。実機ライブラリが無い場合にダミーで起動してしまうことを防ぐ |

サーバーがまだ起動していなくても、次のカメラ・液晶の確認はできる。
押印成功とスマホへの反映は、サーバーを起動してからStep 3・5で確認する。
APIキー入りの設定はPi上で管理し、リポジトリへ追加しない。

### 2-6. 手動で起動し、カメラ映像と液晶を確認する（Pi）

```sh
sudo mkdir -p /var/lib/hcd-stamp-device
sudo chown stamp:stamp /var/lib/hcd-stamp-device
cd /opt/hcd-stamp-device
sudo -u stamp /opt/hcd-stamp-device/.venv/bin/hcd-stamp-device
```

- [ ] 液晶にカメラ映像が表示される（中央を正方形に切り抜き、反時計回りに90度回転）（6-2）
- [ ] カメラの前で物を動かすと、液晶の映像も動く
- [ ] QRを映すと緑の枠が表示される
- [ ] 結果表示の日英の文言が文字化けしない。サーバーに接続できなければ「あとで反映されます」になる（6-7）
- [ ] Ctrl+Cで終了し、液晶が黒になる（6-8）

ここまで確認したら、普段のWi-FiのままStep 3へ進む。常駐化は手動での確認後、3-4で行う。
常駐化後にカメラ単体の撮影や手動起動をやり直す場合は、先に
`sudo systemctl stop hcd-stamp-device` でサービスを止める。確認後は
`sudo systemctl start hcd-stamp-device` で戻す。

## Step 3 Pi × ローカルサーバー

引き続き普段のWi-Fiを使い、開発PCとPiを同じLANにつなぐ。
ポケットWi-Fiの追加は、ローカル試験と本番サーバーでの押印確認を済ませてから行う（Step 5）。

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

1. **Pi上で、まずserviceファイルがあることを確認する。**

   ```sh
   ls -l /opt/hcd-stamp-device/hcd-stamp-device.service
   ```

   見つからない場合は、2-4のserviceファイルの保存が未完了。この手順書の修正前にインストールを
   済ませた機体でも、次のコピーが必要になる。`/tmp/hcd-device`内の元ファイルを確認して保存する。

   ```sh
   ls -l /tmp/hcd-device/systemd/hcd-stamp-device.service
   sudo cp /tmp/hcd-device/systemd/hcd-stamp-device.service /opt/hcd-stamp-device/
   ```

   元ファイルも無い場合だけ、**開発PCのリポジトリ直下**からserviceファイルを転送し直す。

   ```sh
   scp device/systemd/hcd-stamp-device.service <SSHユーザー>@<Piホスト名>.local:/tmp/
   ```

   転送したファイルを**Pi上で**保存する。アプリの再インストールは不要。

   ```sh
   sudo cp /tmp/hcd-stamp-device.service /opt/hcd-stamp-device/
   ```

   **保存が成功してから**systemdに登録する。コピーに失敗した場合は、この先を実行せず元ファイルを
   確認する。手動起動したアプリが動いている場合は、先にCtrl+Cで終了しておく。

   ```sh
   sudo cp /opt/hcd-stamp-device/hcd-stamp-device.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now hcd-stamp-device.service
   sudo systemctl status hcd-stamp-device.service --no-pager
   journalctl -u hcd-stamp-device -f
   ```

   起動直後の`active (running)`だけで合格にせず、60秒以上動かし、ログに例外や再起動の繰り返しが
   出ず、液晶のカメラ映像が動き続けることを確認する。ログの表示はCtrl+Cで
   終了できる（サービスは動き続ける）。

   - [ ] 電源投入からサービス開始まで60秒以内（6-8）
   - [ ] `sudo systemctl kill -s KILL hcd-stamp-device` の5秒後に自動で再起動する
   - [ ] 電源投入を数回繰り返し、液晶のカメラ映像が止まったままにならない。起動直後にカメラが
     止まった場合も、ログに「メインループが5秒止まりました」が出て、15秒ほどで映像が戻る
   - [ ] 再起動を繰り返す機体がダッシュボードで「正常」に見えない。カメラのケーブルを外した状態で電源を入れる（通電中に抜き差ししない）と、90秒ほどで「断」になりアラートが出る

2. 筐体に組み込み、**実スマホを通常の輝度のまま**押し当てて、50×50 CSSピクセルのQRが
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

### 5-1. まず普段のWi-Fiで本番サーバーへの押印を確認する

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
- [ ] 5スポット分押印すると、スタンプ帳の景品引換券がCOMPLETE表示になり、ホームカミングデイ総合案内の案内が表示される
- [ ] スタッフのスマホで `/admin` を開き、全機体の「正常」と未送信キュー0件、スポット別押印数を確認する
- [ ] 1台の電源を抜くと、90秒後にダッシュボードで「断」になり、音または通知が出る
- [ ] 予備機を同じスポットに差し替えて押印が通る

### 5-2. ポケットWi-Fiを追加し、接続と押印を確認する

普段のWi-Fiで動作を確認できたら、[`pocket-wifi.md`](pocket-wifi.md) の手順に進む。
OSを書き直す必要はなく、普段のWi-Fiの設定を残したまま接続設定を追加する。

1. 普段のWi-FiでPiへSSHし、全ポケットWi-Fiの接続設定と優先度を登録する（同手順書2章）。
   設定を追加するだけなら、今のSSH接続は切れない。
2. ポケットWi-Fiの電源を入れ、登録した全SSIDで実際に接続できるか確認する（同3章）。
   **接続先を切り替えるとSSHが切れる。** 同章の`systemd-run`の手順を使い、切り替え先の
   Wi-FiへPCも接続して、Piへ入り直す。IPアドレスも変わるので、ホスト名または新しいIPを使う。
3. `/api/health`、時刻同期、ダッシュボードの「正常」を確認する（同4章）。
4. 実スマホで押印し、液晶とスマホへの反映を確認する。スマホはモバイル通信のままでよい。
5. 実際の設置場所でも、接続先・電波・切断後の再送を確認する（同5章）。
6. 試験後は同7章に従ってPiを終了し、ポケットWi-Fiの電源を切る。

会場で実際に使うネットワークで、少なくとも1台は5-1と同じ確認を行う。

試験で作ったセッションは、日時と端末を記録しておき、本番の集計と区別できるようにする。

## Step 6 後片付け

- [ ] Cloud Runを `deploy.md` 3章の通常設定（min-instances 0、CPUリクエスト時のみ）へ戻す
- [ ] 試験で作ったセッションと押印の扱い（削除するか、集計から除外するか）を決める
- [ ] ローカル試験用のHyper-Vファイアウォールルールを削除する
- [ ] 不具合を修正した場合は、**10月30日より前に**再デプロイしてStep 5をやり直す。
  10月30日以降はデプロイしない（`deploy.md` 3章）
- [ ] 前日と当日朝は `deploy.md` 5〜6章のチェックリストに従う
