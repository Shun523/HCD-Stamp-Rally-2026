# スタンプ機の手順書

スタンプ機（Raspberry Pi Zero 2 W）を扱う手順をまとめる。ソフトの作りと開発PCでの起動は
[`device/README.md`](../device/README.md)、サーバーのデプロイは [`deploy.md`](deploy.md) を参照する。

| 章 | 内容 | 使うとき |
| --- | --- | --- |
| [0](#0-共通の注意) | 共通の注意 | 最初に読む |
| [1](#1-初回セットアップ) | 初回セットアップ | SDカードから作り直すとき |
| [2](#2-機体ソフトの配り直し) | 機体ソフトの配り直し | 新しい版を入れるとき（予備機を含む6台） |
| [3](#3-ポケットwi-fi) | ポケットWi‑Fi | 会場のネットワークを登録・確認するとき |
| [4](#4-実機試験) | 実機試験 | ローカルサーバー、本番サーバーで押印を確かめるとき |
| [5](#5-予備機への差し替え) | 予備機への差し替え | 予備機の準備（10月30日まで）と、当日の故障時 |
| [6](#6-うまくいかないとき) | うまくいかないとき | |

「spec 6-2」は仕様書の節、「2-3」のような番号はこの文書の節を指す。
以下の `<SSHユーザー>` と `<Piホスト名>` は、Imagerで設定した値に置き換える。
SSH用のユーザーと、アプリを動かすユーザー `stamp` は別のユーザー。

## 0. 共通の注意

- **機体は予備機を含めて6台**（`dev-01`〜`dev-05`、`dev-spare-01`）。全台に同じ版の機体ソフトを入れる。
- **機体とスポットの対応を揃える。** シードは `DEVICE_KEYS_JSON` の記載順に `dev-01 → spot-01`、
  `dev-02 → spot-02` … と割り当て、6台目以降は `spot-01` から繰り返す。各機体の `config.toml` の
  `device.spot_id`（液晶のスタンプ絵柄の選択に使う）をサーバー側の割当と一致させる。
- **PiのOSはPython 3.12以上が必要。** Raspberry Pi OS Bookworm は Python 3.11 のため起動できない。
  Trixieベースの Raspberry Pi OS（64bit Lite）を使う。
- **実スマホでの確認は本番サーバーで行う。** サーバーはセッションCookieを常に `Secure` で
  発行する（spec 5-1）ため、LAN上の `http://<IP>` をスマホで開いてもセッションが保持されない。
  ローカル試験ではPCブラウザで `http://localhost:8787` を開き、PC画面に表示したQRをPiに読ませて代用する。
- **一般開放（10月31日10:00）より前の確認では、使うスマホを `/admin` で解除しておく**（spec 4-8、7章）。
  `/admin` にログインし、「この端末で開始前の参加者画面を使う」を押す。解除しないと待機画面になり、QRを出せない。
- **電源を切るときは `sudo poweroff` を使い、** OSの終了処理が完了してから電源を外す。
  SDカード上に保存していても、書き込み途中の電源断ではデータが壊れる可能性がある。
- APIキー入りの設定はPi上で管理し、リポジトリへ追加しない。
- **開発PC（WSLのzsh）で貼るコマンドには、`#` のコメントを入れない。** zshは既定で `#` をコメントとして扱わず、
  `bad pattern: #` で止まる。Pi上（bash）で貼るブロックのコメントはそのままでよい。

## 1. 初回セットアップ

**最初は自宅など、普段使っているWi-Fiで作業する。** OSを書き込む → SSHで入る →
カメラ単体で撮影する → コードを入れる → 液晶にカメラ映像が出ることを確認する → 常駐化する、の順に進める。
ポケットWi-Fiは3章で追加する。パッケージのダウンロードも普段のWi-Fiで済ませる。

**カメラ本体と制御ライブラリの名前について。** `hcd-dev-04`で認識されたカメラ本体は
**Raspberry Pi Camera Module 3（IMX708）**。以下の **Picamera2** はカメラを制御する
Pythonライブラリの名前で、Camera Module 3にも使う。導入するパッケージ名は
`python3-picamera2`のままでよい。仕様6-1の`IMX219`は、試験機で認識されたセンサー名。

### 1-1. OSを書き込み、最初のWi-FiとSSHを設定する（開発PC）

1. Raspberry Pi Imagerで機種を **Raspberry Pi Zero 2 W** にする。OSの選択画面で
   **Raspberry Pi OS (other)**（その他）を開き、**Raspberry Pi OS Lite (64-bit)** を選ぶ。
   説明が **Debian Trixie・デスクトップなし** のものを使う（spec 6-1）。
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
   | Enable Raspberry Pi Connect | オフのままでよい。同じLANからSSHで作業するため不要 |

3. Piの電源を切った状態でカメラ・液晶の配線を確認し、microSDカードを挿して電源を入れる。
   液晶の信号線は仕様6-1の対応表に従う。カメラケーブルは通電中に抜き差ししない。
4. 初回起動の処理が終わるまで数分待つ。開発PCも同じLANへ接続しておく。

Imagerの設定画面は [Raspberry Pi公式の初期セットアップ手順](https://www.raspberrypi.com/documentation/computers/getting-started.html#install-an-operating-system)
も参照できる。

### 1-2. SSHで入り、OSとネットワークを確認する

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
- [ ] `System clock synchronized: yes`。RTCが無いため、キューの時刻判定はNTP同期が前提（spec 6-7）

### 1-3. SPIを有効にし、カメラ単体で撮影する（Pi）

1. パッケージ一覧を更新し、転送・Python用のパッケージを入れる。カメラ制御ライブラリのPicamera2はapt版を使い、
   Lite環境向けにGUIの推奨パッケージを省く。

   ```sh
   sudo apt update
   sudo apt install -y rsync python3-venv python3-dev build-essential
   sudo apt install -y --no-install-recommends python3-picamera2
   ```

2. `sudo raspi-config` → Interface Options で **SPIを有効**にして、`sudo reboot` で再起動する。
   SSHが切れるので、起動を待って1-2と同じコマンドで入り直す。
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

   このコマンドは円形液晶には映像を出さない。液晶表示は1-6で確認する。
   撮影が失敗した場合はコード導入へ進まず、電源を切ってカメラケーブルの向き・差し込みを確認する。

撮影コマンドは [Raspberry Pi公式のカメラ手順](https://www.raspberrypi.com/documentation/computers/camera_software.html)
を、apt版の導入は [Picamera2公式README](https://github.com/raspberrypi/picamera2#installation) を参照。

### 1-4. コードを転送し、インストールする

**開発PCのリポジトリ直下で実行する。** Windowsの場合、この`rsync`はWSLのターミナルで実行する。
Piの名前がWSLから解決できない場合は、1-2で確認したIPアドレスを使う。
`.venv`やローカルの設定ファイルは転送しない。

```sh
(
set -eu
rsync -a --exclude .venv --exclude '.*_cache' --exclude '*.egg-info' \
  --exclude __pycache__ --exclude config.toml \
  device/ <SSHユーザー>@<Piホスト名>.local:hcd-device-source/
ssh <SSHユーザー>@<Piホスト名>.local 'sync -f "$HOME/hcd-device-source"'
)
```

転送先はPiのSSHユーザーの `~/hcd-device-source/`（`admin`なら
`/home/admin/hcd-device-source/`）で、SDカード上に残る。再起動で消えることがある
`/tmp` はソースの保存先に使わない。以降も転送時と同じSSHユーザーで作業する。

**Pi上で実行する。** 新規セットアップの機体で、実行ユーザーとアプリケーションを用意する。
Picamera2はapt版を使うため、venvは`--system-site-packages`で作る。

```sh
tar -czf "$HOME/hcd-stamp-device.tar.gz" -C "$HOME/hcd-device-source" .
sudo useradd -r -M -s /usr/sbin/nologin -G video,spi,gpio stamp
sudo mkdir -p /opt/hcd-stamp-device /etc/hcd-stamp-device
sudo python3 -m venv --system-site-packages /opt/hcd-stamp-device/.venv
sudo apt install -y python3-dev build-essential
sudo /opt/hcd-stamp-device/.venv/bin/pip install "$HOME/hcd-stamp-device.tar.gz" \
  adafruit-blinka adafruit-circuitpython-rgb-display
```

`python3-dev`は、Blinkaの依存ライブラリ（`RPi.GPIO`、`rpi_ws281x`など）をビルドする際の
`Python.h`を用意するために必要。`build-essential`はコンパイラなどのビルド用ツールを用意する。
`fatal error: Python.h: No such file or directory`で止まった場合は、Pi上で次を実行する。
既に作ったユーザーやvenvはそのままで、失敗したインストールだけをやり直す。

```sh
tar -czf "$HOME/hcd-stamp-device.tar.gz" -C "$HOME/hcd-device-source" .
sudo apt install -y python3-dev build-essential
sudo /opt/hcd-stamp-device/.venv/bin/pip install "$HOME/hcd-stamp-device.tar.gz" \
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
sudo cp "$HOME/hcd-device-source/systemd/hcd-stamp-device.service" /opt/hcd-stamp-device/
sudo sync -f /opt/hcd-stamp-device
ls -l /opt/hcd-stamp-device/hcd-stamp-device.service
```

serviceファイルが表示されることを確認して1-5へ進む。ソースはホームディレクトリに残し、
常駐化用のファイルは`/opt/hcd-stamp-device/`へ保存して1-7で使う。

### 1-5. 機体の設定ファイルを作る（Pi）

```sh
sudo cp "$HOME/hcd-device-source/config.example.toml" /etc/hcd-stamp-device/config.toml
sudo chown stamp:stamp /etc/hcd-stamp-device/config.toml
sudo chmod 600 /etc/hcd-stamp-device/config.toml
sudo nano /etc/hcd-stamp-device/config.toml
```

次の値を確認する。

| 設定 | 内容 |
| --- | --- |
| `server.base_url` | 接続するサーバーのURL。ローカル試験なら `http://<WindowsのLAN IP>:8787`（4-2）、本番なら本番URL（4-4） |
| `server.api_key` | ローカル試験用キー（4-2の例では`test`）、または本番用キー |
| `device.id` | 機体ID。最初の試験機は`dev-01` |
| `device.spot_id` | サーバー側の割当と同じスポットID。最初の試験機は`spot-01` |
| `storage.queue_file` | `/var/lib/hcd-stamp-device/pending-stamps.json`（ひな形のまま） |
| `hardware.backend` | **`pi`に変更**。実機ライブラリが無い場合にダミーで起動してしまうことを防ぐ |

サーバーがまだ起動していなくても、次のカメラ・液晶の確認はできる。
押印成功とスマホへの反映は、サーバーを起動してから4章で確認する。

### 1-6. 手動で起動し、カメラ映像と液晶を確認する（Pi）

```sh
sudo mkdir -p /var/lib/hcd-stamp-device
sudo chown stamp:stamp /var/lib/hcd-stamp-device
cd /opt/hcd-stamp-device
sudo -u stamp /opt/hcd-stamp-device/.venv/bin/hcd-stamp-device
```

- [ ] 液晶にカメラ映像が表示される（中央を正方形に切り抜き、反時計回りに90度回転）（spec 6-2）
- [ ] カメラの前で物を動かすと、液晶の映像も動く
- [ ] QRを映すと緑の枠が表示される
- [ ] 結果表示の日英の文言が文字化けしない。サーバーに接続できなければ「あとで反映されます」になる（spec 6-7）
- [ ] Ctrl+Cで終了し、液晶が黒になる（spec 6-8）

常駐化した後にカメラ単体の撮影や手動起動をやり直す場合は、先に
`sudo systemctl stop hcd-stamp-device` でサービスを止める。確認後は
`sudo systemctl start hcd-stamp-device` で戻す。

### 1-7. 常駐化する（Pi）

1. **まずserviceファイルがあることを確認する。**

   ```sh
   ls -l /opt/hcd-stamp-device/hcd-stamp-device.service
   ```

   見つからない場合は、1-4のserviceファイルの保存が未完了。`~/hcd-device-source/`内の元ファイルを確認して保存する。

   ```sh
   ls -l "$HOME/hcd-device-source/systemd/hcd-stamp-device.service"
   sudo cp "$HOME/hcd-device-source/systemd/hcd-stamp-device.service" /opt/hcd-stamp-device/
   ```

   元ファイルも無い場合だけ、**開発PCのリポジトリ直下**からserviceファイルを転送し直す。

   ```sh
   scp device/systemd/hcd-stamp-device.service <SSHユーザー>@<Piホスト名>.local:hcd-stamp-device.service
   ```

   転送したファイルを**Pi上で**保存する。アプリの再インストールは不要。

   ```sh
   sudo cp "$HOME/hcd-stamp-device.service" /opt/hcd-stamp-device/
   ```

2. **保存が成功してから**systemdに登録する。コピーに失敗した場合は、この先を実行せず元ファイルを
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

   - [ ] 電源投入からサービス開始まで60秒以内（spec 6-8）
   - [ ] `sudo reboot` 後、ソースの再転送や再インストールをせずにカメラ映像が出て、
     60秒以上動き続ける。`journalctl -u hcd-stamp-device -b --no-pager` に例外や再起動の繰り返しがない
   - [ ] `sudo systemctl kill -s KILL hcd-stamp-device` の5秒後に自動で再起動する
   - [ ] `sudo poweroff` による終了処理の完了後に電源を外し、電源投入を数回繰り返しても、
     液晶のカメラ映像が止まったままにならない。起動直後にカメラが
     止まった場合も、ログに「メインループが5秒止まりました」が出て、15秒ほどで映像が戻る
   - [ ] サーバーにつないだ状態で、再起動を繰り返す機体がダッシュボードで「正常」に見えない。カメラのケーブルを外した状態で電源を入れる（通電中に抜き差ししない）と、90秒ほどで「断」になりアラートが出る

3. 筐体に組み込み、**実スマホを通常の輝度のまま**押し当てて、75×75 CSSピクセルのQRが
   安定して読めることを確認する（spec 6-2）。
   **カメラのケーブルは実機試験で抜けやすいと分かったため、組み込むときに固定する。**
   抜けると「断」になり予備機と交換するしかない（5-4）。作業は `sudo poweroff` で電源を切ってから行う。
   - [ ] Pi側（細い22ピン側）とカメラ基板側の両方で、ケーブルを奥まで差してロックを閉めている
   - [ ] ケーブルを筐体の内側にテープで1〜2か所留め、ケーブルを引っ張ってもコネクタに力がかからない。
     コネクタの手前は少したるませる
   - [ ] 筐体を閉じてから電源を入れ、液晶にカメラ映像が出る。スマホを押し当てる操作を何回か繰り返しても映像が止まらない
4. 数時間連続で稼働させ、発熱とバッテリーの持ちを確認する（spec 6-6、Q-14）。
5. 残りの機体と予備機にも1章を行う。SDカードを複製した場合は、`config.toml` の
   `device.id`、`device.spot_id`、`server.api_key` と、ホスト名を機体ごとに変える。

## 2. 機体ソフトの配り直し

一度セットアップを済ませた機体に、新しい版の機体ソフトを入れ直す手順。

- **予備機を含む6台すべて**に、同じ版を入れる。
- **配るのはコミット済みの版。** 開発PCの作業ツリーには未コミットの変更が混ざることがあるため、
  `git archive` でコミットの中身だけを取り出して送る。
- **入れ替えるのはアプリだけ。** 実行ユーザー、venv、aptのパッケージ、systemdの登録、
  `/etc/hcd-stamp-device/config.toml`、未送信キューのファイルはそのまま残る。
- **転送したソースもSDカード上に残す。** SSHユーザーの `~/hcd-device-source/` に保存し、
  そこから `/opt/hcd-stamp-device/.venv/` にインストールする。起動時はsystemdが
  `/opt` にインストールしたアプリを実行するため、PCへの接続や再転送は不要。
- **前日確認（[`deploy.md`](deploy.md) 5章）より前に終える。** 前日確認で、配り直した版の動作を確かめる。
- **最初の1台で確かめてから残りへ配る。** 起動ログの「押印演出のコマを48枚作りました（○秒）」の秒数と、
  押印したときの液晶の動き（カクつき具合）を見る。

### 2-1. 配る版を用意する（開発PC）

WSLのターミナルで、リポジトリ直下で実行する。途中に出る1行は device/ を最後に変えたコミットで、
最後に出る短いコミットIDが配る版。2-5の記録に控える。
コミットはこの開発PCで行っているので、GitHubから取り込む（`git pull`）必要はない。
別の場所でコミットした場合だけ、先に `git pull` しておく（GitHubの認証を求められる）。

```sh
(
set -eu
git switch main
git --no-pager log -1 --format='%h %ad %s' --date=short -- device
REV=$(git rev-parse --short HEAD)
rm -rf /tmp/hcd-release && mkdir -p /tmp/hcd-release
git archive "$REV" device | tar -x -C /tmp/hcd-release
echo "$REV"
)
```

10月29日時点の main には、次がすべて入っている。未コミットの修正は `git archive` の配布物に入らない。

- スタンプ画像の確定版（`99a529b`。spec 4-6、6-2）
- Camera Module 3のピントを位置20に固定する変更（`ed62dde`。spec 6-2）
- 再送キューが0バイトでも起動を続ける修正（`6636320`。spec 6-7）。2-3の確認で `起動修正 OK` が出ることを確かめる
- 押印成功時の液晶の演出と3秒表示（`7384cac`。spec v1.15、6-2）
- `backend = "auto"` でも、実機でカメラを開けないときはダミーで動き続けず異常終了する（`cb9e142`。spec 5-6、6-8）。`backend = "pi"` の機体（1-5）の動きは変わらない

依存パッケージ、systemdのunit、設定ファイルの項目は `ed62dde` から変わっていない。手順は前回と同じでよい。

### 2-2. Piへ転送する（開発PC・機体ごと）

```sh
(
set -eu
rsync -a --delete /tmp/hcd-release/device/ <SSHユーザー>@<Piホスト名>.local:hcd-device-source/
ssh <SSHユーザー>@<Piホスト名>.local 'sync -f "$HOME/hcd-device-source"'
)
```

- 転送先の `hcd-device-source/` は、PiのSSHユーザーのホームディレクトリ内。
  たとえば `admin` なら `/home/admin/hcd-device-source/` で、通常の再起動では消えない。
- `--delete` が削除する範囲は、このソース用ディレクトリ内だけ。配る版とまったく同じ中身にする。
- ホスト名で接続できない場合は、1-2で確認したIPアドレスを使う。
- 転送後の `sync -f` で、転送先のファイルシステムの書き込み完了を待つ。
  押印の再送キューは別の場所（`/var/lib/hcd-stamp-device/`）に保存される。
- 新しい版に更新するときは転送し直す。同じ版の入れ直しやPiの再起動のための再転送は不要。

### 2-3. 入れ直す（Pi・機体ごと）

次のブロック全体を一度に貼り付ける。転送済みのファイルを確認し、アプリを停止して
再送キューをバックアップしてから入れ替える。途中で失敗した場合は、そこで止まり、
残りのコマンドは実行しない。サービス停止後に失敗した場合は、サービスは停止したまま。
`storage.queue_file` をひな形から変更している機体では、バックアップ元のパスも設定先に合わせる。

```sh
(
set -eu
HCD_SOURCE_DIR="$HOME/hcd-device-source"
HCD_PACKAGE_FILE="$HOME/hcd-stamp-device.tar.gz"

if [ ! -f "$HCD_SOURCE_DIR/pyproject.toml" ]; then
  echo '更新用のソースがありません。開発PCで2-1〜2-2を行ってから、2-3をやり直してください。' >&2
  exit 1
fi
tar -czf "$HCD_PACKAGE_FILE" -C "$HCD_SOURCE_DIR" .

# Camera Module 3の機体で、ピント制御のライブラリを読み込めるか先に確かめる（"libcamera OK" が出ればよい）
sudo -u stamp /opt/hcd-stamp-device/.venv/bin/python -c 'from libcamera import controls; print("libcamera OK")'

sudo systemctl stop hcd-stamp-device
# 仕様6-7: 未送信の押印を保持する。停止後のキューを更新ごとに別のディレクトリへ保存する。
sudo install -d -m 700 /var/backups/hcd-stamp-device
HCD_BACKUP_DIR=$(sudo mktemp -d /var/backups/hcd-stamp-device/update.XXXXXX)
sudo cp -a /var/lib/hcd-stamp-device/. "$HCD_BACKUP_DIR/"
echo "再送キューのバックアップ: $HCD_BACKUP_DIR"

sudo /opt/hcd-stamp-device/.venv/bin/pip install --no-deps --force-reinstall "$HCD_PACKAGE_FILE"
# インストール済みの修正を使い捨てのファイルで確認する。実際の再送キューには触れない。
sudo -u stamp /opt/hcd-stamp-device/.venv/bin/python -I - <<'PY'
import logging
import tempfile
from pathlib import Path
from hcd_stamp_device.queue import PersistentStampQueue

logging.getLogger("hcd_stamp_device.queue").setLevel(logging.ERROR)
with tempfile.TemporaryDirectory(prefix="hcd-startup-check-") as directory:
    path = Path(directory) / "pending-stamps.json"
    path.touch()
    queue = PersistentStampQueue(path)
    backups = list(path.parent.glob("pending-stamps.json.empty-*.bak"))
    if len(queue) != 0 or path.read_bytes() != b"[]" or len(backups) != 1:
        raise SystemExit("起動修正の確認に失敗しました")
    if backups[0].read_bytes() != b"" or len(PersistentStampQueue(path)) != 0:
        raise SystemExit("退避または次回起動の確認に失敗しました")
print("起動修正 OK（0バイトの退避・空キュー保存・次回読み込み）")
PY
# SDカード上のアプリとバックアップの書き込み完了を待ってから起動する。
sudo sync -f /opt/hcd-stamp-device
sudo systemctl start hcd-stamp-device
sudo systemctl status hcd-stamp-device --no-pager
journalctl -u hcd-stamp-device -n 30 --no-pager
)
```

- **エラーが出たら、その内容を確認してからブロック全体をやり直す。** pipが失敗した後に、
  続きの起動コマンドだけを実行しない。
- **`起動修正 OK` が出なければ、この修正を含む版がインストールされたとは判断しない。**
  確認用ファイルは終了時に削除される。実際の押印データを空にして試す操作は不要。
- ソースから作った `~/hcd-stamp-device.tar.gz` をインストールする。pipのビルドで
  ソース内にroot所有のファイルができ、次の転送を妨げることを避けるため。
- バックアップには未送信の押印トークンが含まれる。保存先はrootだけがアクセスできる
  ディレクトリ。更新前から壊れていたキューは、バックアップしても修復されない。
- **`--no-deps` は必ず付ける。** 付けないと、pip版のOpenCVとnumpyが入り直す。
  1-4でapt版に切り替えた機体では、カメラのエラーが再発するおそれがある。
- **`--force-reinstall` を付ける。** 機体ソフトのバージョン番号（0.1.0）は変わらないため、付けないと入れ直されないことがある。

10月29日時点の版が入ったかは、次で確かめられる。

```sh
grep -c LensPosition /opt/hcd-stamp-device/.venv/lib/python3*/site-packages/hcd_stamp_device/hardware.py
ls -l /opt/hcd-stamp-device/.venv/lib/python3*/site-packages/hcd_stamp_device/assets/stamps/
journalctl -u hcd-stamp-device -b --no-pager | grep 押印演出のコマ
```

- [ ] `grep -c` の結果が `2`（ピントの固定が入っている。`LensPosition` を含む行の数で、固定前の版なら `0`）
- [ ] スタンプ画像の大きさ（`ls -l` のバイト数）が、spot-01から順に `56126`、`60174`、`63003`、`59452`、`60228`
  （確定版と一致。古い仮画像は6〜7千バイト）
- [ ] 「押印演出のコマを48枚作りました（○秒）」が出る（押印演出が入っている。古い版では何も出ない）

### 2-4. 動作を確かめる（機体ごと）

- [ ] `systemctl is-active hcd-stamp-device` が `active`
- [ ] `sudo grep -n backend /etc/hcd-stamp-device/config.toml` が `backend = "pi"`（1-5）。`auto` なら `pi` に直して
  `sudo systemctl restart hcd-stamp-device` する。古い版の `auto` は、カメラを開けないとダミーで動き続け、
  ケーブルが外れても `/admin` で「正常」に見える
- [ ] 60秒以上動かし、ログに例外や再起動の繰り返しが出ず、液晶のカメラ映像が動き続ける
- [ ] ダッシュボード（`/admin`）で、この機体が「正常」、未送信キューが0件
- [ ] 解除したスマホでQR（75×75 CSSピクセル）を出し、普段の明るさのまま筐体に押し当てて押印できる。
  液晶でスタンプが落ちて着地し、きらきらが出て、絵柄が合わせて3秒出る。スマホのスタンプ帳にも反映される
- [ ] 同じスポットでもう一度押すと、チェック付きの絵柄が出る
- [ ] 0バイトのキューから復旧した機体は、この起動のログに退避先があり、そのファイルが残っている

ここまで確認したら、Piを再起動する。

```sh
sudo reboot
```

SSHが切れるので、Piの起動を待って同じSSHユーザーで入り直し、Pi上で次を実行する。
ソースの再転送やアプリの再インストールは行わない。

```sh
systemctl is-enabled hcd-stamp-device
systemctl is-active hcd-stamp-device
systemctl show hcd-stamp-device -p NRestarts
journalctl -u hcd-stamp-device -b -n 80 --no-pager
```

- [ ] `is-enabled` が `enabled`、`is-active` が `active`
- [ ] 再起動後もカメラ映像が60秒以上動き続け、その間に `NRestarts` が増えない
- [ ] 今回の起動ログ（`-b`）に例外や再起動の繰り返しがない
- [ ] 0バイトのキューから復旧した機体も、次の起動では復旧を繰り返さず、通常どおり起動する

起動直後の `active` だけでは完了にしない。再起動後の確認も成功してから「2-5. 記録」の
「2-4の確認」を完了にする。作業後に電源を切る場合は `sudo poweroff` を使う（0章）。

### 2-5. 記録

| 機体ID | 配った版 | 日付 | 2-4の確認 |
| --- | --- | --- | --- |
| dev-01 | | | |
| dev-02 | | | |
| dev-03 | | | |
| dev-04 | | | |
| dev-05 | | | |
| dev-spare-01 | | | |

前の版に戻したいときは、`git log --oneline -- device` で戻したい版のコミットを探し、2-1の `REV` にそのコミットを指定して、2-1〜2-4をやり直す。

## 3. ポケットWi-Fi

スタンプ機を、レンタルのポケットWi‑Fi経由で本番サーバーへ接続する手順。
Raspberry Pi OS（Trixie）はNetworkManagerでWi‑Fiを管理するため、`nmcli` を使う。
SSID・パスワードはこのリポジトリに書かない。

### 3-1. 方針

- **全部のPiに、全部のポケットWi‑Fiを登録する。** レンタル品はSSIDを変更できないため、
  1台ずつ別のSSIDになる。全部を登録しておけば、Piはその場で見えているSSIDへ自動で接続する。
  予備機をどのスポットへ持って行っても、ポケットWi‑Fiが1台故障して隣の電波が届く場合も、
  そのままつながる。
- 登録名は全部のPiで共通にし、`pocket-wifi-1`、`pocket-wifi-2` … とする。番号と本体の対応は、
  本体にテープなどで番号を貼って管理する。**番号はスポット番号と揃え**、`pocket-wifi-1` は
  spot-01 に置く、のようにする。
- **各機体は、自分のスポットのポケットWi‑Fiを最優先にする**（優先度20、ほかは10）。本番の日は、
  ポケットWi‑Fiの電源を入れてからPiを起動するだけで、そのスポットのWi‑Fiにつながる。
  そのWi‑Fiが止まった場合は、届くほかのポケットWi‑Fiへ自動で逃げる。
- **1台のポケットWi‑Fiが届くのは、見通しで十数メートル程度。** スポットが離れているなら、
  スポットごとに1台置く。
- **Pi Zero 2 Wは2.4GHz帯にしか接続できない。** 5GHz専用の設定になっていると、SSIDが見えない。
- **通信量に上限がある。** 電源を入れるのは試験中だけにし、終わったらすぐ切る（3-7、3-8）。

### 3-2. ポケットWi‑Fi本体の設定

本体の画面、または管理画面（説明書に記載のアドレス）で設定する。

| 項目 | 設定 | 理由 |
| --- | --- | --- |
| 周波数帯 | 2.4GHzを有効（2.4GHz専用、または2.4GHz/5GHz同時） | Pi Zero 2 Wは2.4GHzのみ |
| 同時接続台数 | その場所で使う台数（Pi＋スタッフのPC・スマホ）以上 | 上限を超えると後から来た機器がつながらない |
| 無通信時のスリープ・自動電源オフ | 当日は無効。試験期間中は有効のままでもよい | 当日にスリープすると断になる。試験中は切り忘れ対策になる |
| データ容量 | 上限と、残量の確認方法を確かめる | 3-7の見込みと比べる |

電源は、イベントの時間（準備を含めて8時間以上）を電池だけで持つか確認する。足りない場合は、
モバイルバッテリーかACアダプターを用意する。

### 3-3. 全部のPiに、全部のポケットWi‑Fiを登録する

今つながっているネットワーク（自宅Wi‑Fi、テザリングなど）でPiへSSHし、ポケットWi‑Fiの設定を
**追加**する。登録は設定を保存するだけなので、ポケットWi‑Fiの電源が入っていなくても行える。
SSHも切れない。既存の接続設定は消さずに予備として残す。

1. 今の接続設定の名前を確認する。Raspberry Pi Imagerで設定したWi‑Fiは、OSの版により
   `preconfigured` や `netplan-wlan0-<SSID>` などの名前になる。以降は `<既存の接続名>` と書く。

   ```sh
   nmcli connection show
   ```

2. ポケットWi‑Fiの台数分、次を繰り返す。`<番号>` と `<SSID>` を書き換え、パスワードは
   プロンプトに入力する（画面と履歴に残らない）。

   ```sh
   read -rsp 'Pocket Wi-Fi password: ' PSK; echo
   sudo nmcli connection add type wifi con-name pocket-wifi-<番号> ifname wlan0 ssid '<SSID>' \
     wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PSK" \
     connection.autoconnect yes connection.autoconnect-priority 10 \
     802-11-wireless.powersave 2
   unset PSK
   ```

   - `autoconnect-priority 10`: 既存の設定（優先度0）より優先する。ポケットWi‑Fi同士は同じ優先度にする。
   - `powersave 2`: Wi‑Fiの省電力を切る。省電力が効いていると、押印の応答が遅れることがある。
   - 設定は `/etc/NetworkManager/system-connections/` にroot専用の権限で保存される。

3. **自分のスポットのポケットWi‑Fiを最優先にする。** 予備機は、どこへ持って行くか決まって
   いないため、この手順を行わない（全部10のまま）。

   | 機体 | 実行するコマンド |
   | --- | --- |
   | dev-01（spot-01） | `sudo nmcli connection modify pocket-wifi-1 connection.autoconnect-priority 20` |
   | dev-02（spot-02） | `sudo nmcli connection modify pocket-wifi-2 connection.autoconnect-priority 20` |
   | dev-03（spot-03） | `sudo nmcli connection modify pocket-wifi-3 connection.autoconnect-priority 20` |
   | dev-04（spot-04） | `sudo nmcli connection modify pocket-wifi-4 connection.autoconnect-priority 20` |
   | dev-05（spot-05） | `sudo nmcli connection modify pocket-wifi-5 connection.autoconnect-priority 20` |
   | dev-spare-01 | 行わない |

   この変更は、次に接続先を選ぶとき（起動時、接続が切れたとき）から効く。今つながっている
   接続は切り替わらない。

4. 登録できたことを確認する。全部の `pocket-wifi-<番号>` が並び、自分のスポットの番号だけが
   `20`、ほかが `10` になっていれば完了。

   ```sh
   nmcli -f NAME,TYPE,AUTOCONNECT,AUTOCONNECT-PRIORITY connection show
   ```

これを全部のPi（予備機を含む）で行う。

### 3-4. 全部のSSIDにつながるか一括で確かめる

パスワードの打ち間違いは、登録の時点では分からない。全部のポケットWi‑Fiの電源を入れて同じ場所に
置き、各Piで次を実行する。Piが順番に全部のSSIDへ接続し、本番サーバーへの疎通を記録する。

```sh
sudo systemd-run --unit wifi-check bash -c '
for c in $(nmcli -g NAME connection show | grep ^pocket-wifi); do
  echo "== $c"
  nmcli connection up "$c" && sleep 5 && curl -s -m 10 https://hcd-stamp-rally-th6cagb4vq-an.a.run.app/api/health
  echo
done'
```

1. 実行するとWi‑Fiが切り替わるため、**SSHは途中で切れる。** `systemd-run` で動かしているので、
   確認は最後まで続く。
2. 1分ほど待ち、**最後に確認したSSID**にPCをつないで、Piへ入り直す（`ssh <ホスト名>.local`）。
3. 結果を見る。全部のSSIDで `{"ok":true,"db":"ok"}` が出ていれば合格。

   ```sh
   journalctl -u wifi-check --no-pager
   ```

   `Error: Connection activation failed` が出たSSIDは、パスワードの誤り。
   `sudo nmcli connection delete pocket-wifi-<番号>` で消して、3-3の手順で登録し直す。

同じPiでもう一度実行する場合は、先に `sudo systemctl reset-failed wifi-check` を実行する。

### 3-5. 接続の確認

```sh
nmcli device status
iw dev wlan0 link
curl https://hcd-stamp-rally-th6cagb4vq-an.a.run.app/api/health
timedatectl
journalctl -u hcd-stamp-device -n 30
```

- [ ] `nmcli device status` で `wlan0` が `pocket-wifi-<番号>` のどれかに接続している
- [ ] `iw dev wlan0 link` の `freq` が2412〜2472（2.4GHz）、`signal` が -70 dBm より大きい（-50などが良好）
- [ ] `/api/health` が `{"ok":true,"db":"ok"}` を返す
- [ ] `timedatectl` で `System clock synchronized: yes`（オフライン押印の時刻判定に必要、spec 6-7）
- [ ] 1分ほど待つと、`/admin` でその機体が「正常」になる
- [ ] 実スマホで押印し、液晶とスマホに反映される

### 3-6. 本番の日の起動と、設置場所での確認

**起動の順番**

1. **先にポケットWi‑Fiの電源を入れ**、スポットに置く。
2. 1分ほど待ってから、Piの電源を入れる。Piは起動時に、見えている登録済みのWi‑Fiのうち優先度の
   高いもの（そのスポットのポケットWi‑Fi）へ自動でつながる。
3. 1分ほど待ち、`/admin` でその機体が「正常」になったことを確認する。

Piを先に起動した場合、その時点で見えているほかのポケットWi‑Fiにつながることがある。
**接続中のWi‑Fiから、優先度の高いWi‑Fiへ自分から乗り換えることはない。** 何も見えて
いなければ、Piは探し続け、ポケットWi‑Fiの電源が入った時点でつながる。

**接続先の確認**

SSHできる場合は、各機体で接続先を確かめる。

```sh
nmcli -f NAME,DEVICE connection show --active
iw dev wlan0 link
```

`wlan0` の接続がそのスポットの `pocket-wifi-<番号>` でなければ、切り替える（SSHはここで切れる）。

```sh
sudo nmcli connection up pocket-wifi-<そのスポットの番号>
```

SSHできない場合は、Piを再起動するか、つながっているほうのポケットWi‑Fiの電源を一時的に切る。
Piはそのスポットのポケットへ移る。

**設置場所での確認項目**

ポケットWi‑Fiは、実際に置く場所と同じ位置・同じ距離で確認する。建物の壁や人混みで電波は弱くなる。

- [ ] 各機体が、そのスポットのポケットWi‑Fiにつながっている
- [ ] 設置位置で `signal` が -70 dBm より大きい（弱い場合は近づける）
- [ ] そのスポットのポケットWi‑Fiの電源を切ると、ほかのポケットWi‑Fiが届く場所ではそちらへ移り、
  届かない場所では、押印で液晶に「あとで反映されます」が出る
- [ ] 電源を入れ直したあと、届かない場所だった機体は自動で再接続し、5秒間隔の再送でスマホに反映される。
  ほかへ移った機体は自動では戻らないため、上の「接続先の確認」で戻す
- [ ] 当日の設定（スリープ無効）で数時間置いて、ポケットWi‑Fiが勝手に電源オフしない

**予備機を差し替えるとき**

予備機は全部のポケットWi‑Fiが優先度10のため、行き先で見えているどれかにつながる。そのスポットの
ポケットWi‑Fiを優先させる場合は、差し替え先で次を実行する。機体IDとスポットの切り替えは5章で行う。

```sh
sudo nmcli connection modify pocket-wifi-<行き先の番号> connection.autoconnect-priority 20
sudo nmcli connection up pocket-wifi-<行き先の番号>
```

### 3-7. 通信量を抑える

**Piの通信量の見込み。** Piが使うのは、30秒ごとのハートビートと押印だけ。1回あたり暗号化の
やり取りを含めて10KB未満のため、1台あたり1時間で1MB程度、6台で8時間動かしても100MB未満の見込み。
実際の量は、ポケットWi‑Fi本体の画面で、試験の前後に確認する。

通信量を大きく消費するのは、Piよりも次の2つ。

- **PCやスマホ。** OSの更新、クラウドの同期、アプリの更新で、数GB使うことがある。
  - ポケットWi‑FiにつなぐのはSSHが必要なときだけにし、終わったら切断する。
  - Windowsでは、そのWi‑Fiの「プロパティ」で「従量制課金接続として設定する」をオンにする。
    Windows Updateなどの大きなダウンロードが止まる。
  - スマホは、Piの押印確認用ならモバイル通信のままでよく、ポケットWi‑Fiにつなぐ必要はない。
- **Piの自動更新。** 次で、パッケージ一覧の自動ダウンロードが有効かを確認する。

  ```sh
  apt-config dump APT::Periodic
  ```

  `APT::Periodic::Update-Package-Lists "1";` が出たら有効。イベントが終わるまで止める。

  ```sh
  sudo systemctl disable --now apt-daily.timer apt-daily-upgrade.timer
  ```

  何も出ない、または `"0"` なら、何もしなくてよい。イベント後に戻す場合は、
  `disable` を `enable` に変えて実行する。

### 3-8. 試験が終わったら、すぐ切る

次の順に行う。ポケットWi‑Fiの電源を切れば、Piからの通信は確実に止まる。

1. `/admin` で、全機体の**未送信キューが0件**であることを確認する。
   残っていても失われることはなく、次にネットワークへつながったときに再送される。
2. Piをもう使わない場合は、SSHで入り、`sudo poweroff` で電源を切る。
   SSHが切れてから10秒ほど待ち、基板の緑のランプが消えたことを確かめてから電源ケーブルを抜く。
   液晶は、電源が入っている間は最後の画面を表示したまま。
3. **ポケットWi‑Fiの電源を切る。** Piの電源を入れたままの場合、Piは自宅などの既存のWi‑Fiが
   届けばそちらへ自動で切り替わり、届かなければ通信しない。ダッシュボードではその機体が
   「断」になるが、異常ではない。
4. PCをポケットWi‑Fiから切断する。
5. 本番環境を試験期間用の設定にしていた場合は、通常設定に戻す（[`deploy.md`](deploy.md) 3章）。

Piを動かしたまま、ポケットWi‑Fiだけを使わせたくない場合は、Wi‑Fiを既存の接続へ戻す。
SSHは、既存の接続側のIPアドレスへ入り直す。

```sh
sudo nmcli connection up '<既存の接続名>'
```

ポケットWi‑Fiの設定を消す場合は `sudo nmcli connection delete pocket-wifi-<番号>` を実行する。

## 4. 実機試験

「機体 → サーバー → スマホ」の押印フローを確かめる。ローカル試験（4-1〜4-3）と、本番での確認（4-4〜4-5）がある。
試験の前に、開発PCで自動テスト・lint・型チェックが通ることを確かめておく（各ディレクトリのREADME）。

本番での試験は、試験期間用のCloud Run設定（[`deploy.md`](deploy.md) 3章。min-instances 1、CPU常時割り当て）で行う。
通常設定のままでは、リクエスト外でハートビート監視が止まり、断検知とSSEの試験結果が当日と一致しない。
試験で作ったセッションは削除しない。一般開放前のセッションはすべて試験用として扱われ、`db:export` が集計から除く（[`data.md`](data.md)）。

### 4-1. WSL2のサーバーをLANへ公開する（ローカル試験）

普段のWi-Fiで、開発PCとPiを同じLANにつなぐ。WSL2は既定で `nat` モードのため、同じLAN上のPiから
WSL2内のサーバーへ接続できない。Windowsでサーバーを立て直す必要はなく、WSL2を `mirrored` モードに
切り替える（Windows 11 22H2以降）。

1. Windows側の `%UserProfile%\.wslconfig` に次を書く（無ければ作る）。

   ```ini
   [wsl2]
   networkingMode=mirrored
   ```

2. PowerShellで `wsl --shutdown` を実行してからWSLを開き直し、切り替わったことを確認する。
   `wslinfo` が `mirrored` を返し、`ip -4 addr` にWindowsのLAN IPが出ればよい。

   ```sh
   wslinfo --networking-mode
   ip -4 addr
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

### 4-2. ローカルサーバーを起動する

リポジトリ直下で実行する。機体キーは試験用の値（例では `test`）、管理パスワードも試験用の値（例では `pass`）を使い、本番用とは分ける。

```sh
npx supabase start
pnpm --filter @hcd-stamp-rally/server db:migrate
DEVICE_KEYS_JSON='{"dev-01":"test"}' pnpm --filter @hcd-stamp-rally/server db:seed
pnpm --filter @hcd-stamp-rally/shared build
pnpm --filter @hcd-stamp-rally/web build
PORT=8787 ADMIN_PASSWORD=pass pnpm --filter @hcd-stamp-rally/server dev
```

Piの `config.toml` を次のように設定して、疎通を確認する。

```toml
[server]
base_url = "http://<WindowsのLAN IP>:8787"
api_key = "<試験用キー>"
```

```sh
curl http://<WindowsのLAN IP>:8787/api/health   # Piから実行して {"ok":true,"db":"ok"}
```

### 4-3. ローカルでの確認項目

PCブラウザで `http://localhost:8787`（スタンプ帳）と `http://localhost:8787/admin`
（ダッシュボード）を開き、Piを起動した状態で確認する。

| 操作 | 期待する結果 |
| --- | --- |
| Piを起動して60秒待つ | ダッシュボードで dev-01 が「正常」、未送信キュー0件（初回ハートビートは起動30秒後、画面更新は30秒ごと） |
| PC画面のQRをPiに読ませる | 液晶でスタンプが落ちて着地し、きらきらが出たあと、絵柄が合わせて3秒表示される。PCのスタンプ帳に即時反映される |
| 同じQRをもう一度読ませる | 絵柄にチェックが重なって2秒表示される（`already`） |
| 無関係なQRを読ませる | ×アイコンと「このQRは使えません」が2秒表示される |
| `api_key` を誤った値にして再起動し、読ませる | 工具アイコンと「スタッフを呼んでください」が5秒表示され、ダッシュボードで「断」になる |
| サーバーを止めて読ませる | 黄色の背景と「あとで反映されます」が3秒表示される。未送信キューが増える |
| そのままPiを再起動し、サーバーを再開する | キューが失われず、5秒間隔で再送されてスタンプ帳に反映される |
| `sudo poweroff`で終了処理が完了してから電源を抜き、90秒待つ | ダッシュボードで「断」になり、音またはブラウザ通知が出る |

### 4-4. 本番サーバーで確認する（普段のWi-Fi）

各Piの `config.toml` を本番用に書き換えて再起動する。

```toml
[server]
base_url = "https://hcd-stamp-rally-th6cagb4vq-an.a.run.app"
api_key = "<本番用キー>"
```

```sh
sudo systemctl restart hcd-stamp-device
```

iOS Safari と Android Chrome の実機で、それぞれ確認する（spec 4-5）。一般開放前は、スマホを `/admin` で解除しておく（0章）。

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
- [ ] 予備機を5-4の手順で別の機体として起動し、押印が通る。終わったら5-5で戻す

### 4-5. ポケットWi-Fiで確認する

普段のWi-Fiで動作を確認できたら、ポケットWi-Fiを追加する。
OSを書き直す必要はなく、普段のWi-Fiの設定を残したまま接続設定を追加する。

1. 普段のWi-FiでPiへSSHし、全ポケットWi-Fiの接続設定と優先度を登録する（3-3）。
   設定を追加するだけなら、今のSSH接続は切れない。
2. ポケットWi-Fiの電源を入れ、登録した全SSIDで実際に接続できるか確認する（3-4）。
   **接続先を切り替えるとSSHが切れる。** 3-4の`systemd-run`の手順を使い、切り替え先の
   Wi-FiへPCも接続して、Piへ入り直す。IPアドレスも変わるので、ホスト名または新しいIPを使う。
3. `/api/health`、時刻同期、ダッシュボードの「正常」を確認する（3-5）。
4. 実スマホで押印し、液晶とスマホへの反映を確認する。スマホはモバイル通信のままでよい。
5. 実際の設置場所でも、接続先・電波・切断後の再送を確認する（3-6）。
6. 試験後は3-8に従ってPiを終了し、ポケットWi-Fiの電源を切る。

会場で実際に使うネットワークで、少なくとも1台は4-4と同じ確認を行う。

## 5. 予備機への差し替え

故障したスタンプ機を、予備機（`dev-spare-01`）と入れ替える手順。予備機は**故障機の機体IDとAPIキーを名乗って**動く。
サーバーは機体IDから押印のスポットを決めるので（spec 6-8）、本番DBの変更やデプロイは要らない。
液晶のスタンプ画像は設定ファイルの `spot_id` で選ばれ、5スポット分の画像は全機体に入っている（spec 6-2）。

### 5-1. 方針

- 予備機は**普段は電源を切って**保管し、差し替えるときだけ電源を入れる。
- 当日その場でキーを打ち込まなくて済むよう、**5スポット分の設定ファイルを予備機へ前もって入れておく**（5-3）。当日は、ファイルをコピーしてサービスを再起動するだけ（5-4）。
- 予備機には全機体のAPIキーが入るので、運営担当者が保管する（[`deploy.md`](deploy.md) 6章）。
- `/admin` では、電源を切っている予備機（`dev-spare-01`）が「断」として要対応アラートに出続ける。想定どおりの表示。当日のスタッフに伝えておく。

守ること:

1. **故障機の電源を先に切る。** 同じ機体IDが2台同時に動くと、ハートビートが混ざって `/admin` で故障に気づけず、両方から押印が届く。
2. **予備機の未送信キューが空のときだけ切り替える。** キューには押印トークンと時刻しか入っておらず、再送のときは今の機体IDで送る。残ったまま名乗りを変えると、前のスポットで読んだ押印が別のスポットとして記録される（spec 6-7）。
3. **使い終えたら予備機の設定を `dev-spare-01` に戻してから電源を切る**（5-5）。戻さずに切ると、次に電源を入れたときに故障機の名前で動き出し、直った元の機体と重なる。

### 5-2. 用意するもの

- 開発PC（`gcloud` を使えること）と、予備機へSSHできるネットワーク。会場ではポケットWi‑Fiに開発PCもつなぐ（3章）
- 充電済みの予備機。機体ソフトは本番の5台と同じ版にしておく（2章）
- `/admin` を開けるスマホ

### 5-3. 設定ファイルを予備機へ入れる（10月30日のリハーサルまでに1回）

予備機の今の `config.toml`（本番サーバーへつながる設定）をひな形にして、APIキー・機体ID・スポットIDの3項目だけを差し替えたファイルを5つ作る。APIキーは Secret Manager の `hcd-device-keys` から読む。

1. `/admin` の機体一覧で、`dev-01`〜`dev-05` のスポットがそれぞれ `spot-01`〜`spot-05` であることを確かめる。違っていたら、下のスクリプトの対応表（`spot-{number:02d}`）をその割り当てに合わせる。
2. 予備機の電源を入れ、開発PCで次を実行する。キーは画面とシェル履歴に出ず、開発PCの一時ディレクトリは最後に消える。

```sh
(
set -eu
umask 077
SPARE='<SSHユーザー>@<予備機のホスト名>.local'
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
ssh "$SPARE" 'sudo -n cat /etc/hcd-stamp-device/config.toml' > "$work/base.toml"
gcloud secrets versions access latest --secret=hcd-device-keys --project=hcd-stamp-rarry-2026 > "$work/keys.json"
python3 -I - "$work" <<'EOF'
import json, pathlib, re, sys
work = pathlib.Path(sys.argv[1])
base = (work / "base.toml").read_text()
# 予備機自身の設定を dev-spare-01.toml として控えるので、予備機が自分の設定のときだけ進める。
assert re.search(r'(?m)^id\s*=\s*"dev-spare-01"', base), "予備機を dev-spare-01 の設定に戻してから実行すること"
keys = json.loads((work / "keys.json").read_text())
for number in range(1, 6):
    device_id = f"dev-{number:02d}"
    text = base
    for key, value in (("api_key", keys[device_id]), ("id", device_id), ("spot_id", f"spot-{number:02d}")):
        text, count = re.subn(rf"(?m)^{key}\s*=.*$", f'{key} = "{value}"', text)
        assert count == 1, f"{key} が config.toml に1つだけあること"
    (work / f"{device_id}.toml").write_text(text)
EOF
scp -q "$work"/dev-0[1-5].toml "$SPARE":
ssh "$SPARE" '
set -eu
sudo -n install -d -m 700 /etc/hcd-stamp-device/spots
sudo -n install -m 600 -o stamp -g stamp ~/dev-0[1-5].toml /etc/hcd-stamp-device/spots/
sudo -n install -m 600 -o stamp -g stamp /etc/hcd-stamp-device/config.toml /etc/hcd-stamp-device/spots/dev-spare-01.toml
rm ~/dev-0[1-5].toml
sudo -n sync -f /etc/hcd-stamp-device/spots
sudo -n ls -l /etc/hcd-stamp-device/spots
'
)
```

   予備機のSSHユーザーが、パスワードなしで `sudo` できる前提（Raspberry Pi OSの初期ユーザーの既定）。`sudo: a password is required` で止まった場合、予備機には何も書き込まれていない。その場合はSSHでログインした中で同じ処理をする手順に直す必要があるので、この節は当日より前に試しておく。

3. 最後の一覧に `dev-01.toml`〜`dev-05.toml` と `dev-spare-01.toml` の6つが、所有者 `stamp`、権限 `-rw-------` で出ればよい。`dev-spare-01.toml` は予備機自身の設定の控えで、5-5で戻すときに使う。
4. リハーサルで5-4の切り替えを一度通す（どれか1台の電源を切り、予備機をその機体として起動して押印する）。終わったら5-5で戻し、予備機の電源を切る。

APIキーを作り直したときは、この節をやり直す。

### 5-4. 当日に差し替える

`/admin` に「断」が出たら、まずその機体の液晶を見て原因を分ける。どの原因でも「断」と出るため、
画面だけでは区別できない。カメラが外れた場合は、外れてから60〜90秒で「断」になる（spec 5-6、6-8）。

| 液晶の様子 | 考えられる原因 | 対処 |
| --- | --- | --- |
| カメラ映像が止まっている、または何も映らない | カメラ（ケーブル外れなど） | 通電中にケーブルを差し直さず、下の手順で予備機と差し替える。故障機は電源を切ってからケーブルを差し直し、固定し直す（1-7の3） |
| カメラ映像が動いている | ネットワーク | 3-6の「接続先の確認」でポケットWi‑Fiを確かめる。押印すると液晶に「あとで反映されます」が出る |
| 真っ暗で、Piのランプも消えている | 電源（バッテリー切れなど） | バッテリーを替えて電源を入れ直す。戻らなければ予備機と差し替える |

`dev-03` が故障した場合の例。機体IDは故障機のものに読み替える。

1. **故障機の電源を切る。** SSHできれば `sudo poweroff` で切り、終了処理が済んでから電源を外す。SSHできなければ電源を外す。故障機の未送信キューは故障機の中に残る。
2. 予備機を故障機の場所に置いて電源を入れ、1分ほど待ってからSSHで入る。
3. 予備機の未送信キューが空であることを確かめる。`[]` が出るか、ファイルが無ければよい。

```sh
sudo cat /var/lib/hcd-stamp-device/pending-stamps.json 2>/dev/null || echo "キューのファイルなし"
```

   空でなければ切り替えない。前に名乗っていた機体のまま、ネットワークにつないで再送が終わる（空になる）のを待つ。

4. 設定を差し替えて、サービスを再起動する。

```sh
sudo install -m 600 -o stamp -g stamp /etc/hcd-stamp-device/spots/dev-03.toml /etc/hcd-stamp-device/config.toml
sudo sync -f /etc/hcd-stamp-device/config.toml
sudo systemctl restart hcd-stamp-device
journalctl -u hcd-stamp-device -n 20 --no-pager
```

5. 確かめる。
   - 起動から30秒ほどで、`/admin` の `dev-03` が「正常」に戻る
   - 実スマホ（一般開放前なら `/admin` で解除したもの）で1回押印し、液晶に `spot-03` の絵柄が出て、スマホに反映される
6. 切り替えた時刻と機体IDを記録しておく。データ上は予備機の押印も `dev-03` として残るため、あとで予備機を使った時間帯を知るにはこの記録が要る（[`data.md`](data.md)）。

### 5-5. 予備機を戻す

元の機体が直ったとき、またはイベントが終わったときに行う。

1. 予備機の未送信キューが空であることを5-4の3と同じ方法で確かめる。空でなければ、再送が終わるまで待つ。
2. 予備機の設定を自分のものに戻し、電源を切る。

```sh
sudo install -m 600 -o stamp -g stamp /etc/hcd-stamp-device/spots/dev-spare-01.toml /etc/hcd-stamp-device/config.toml
sudo sync -f /etc/hcd-stamp-device/config.toml
sudo poweroff
```

3. 元の機体を使うなら、予備機の電源が切れてから電源を入れる。元の機体に残っていた未送信キューは、ネットワークにつながれば同じ機体IDで再送される（11月1日0:00に自動で消えるので、それまでに）。

## 6. うまくいかないとき

### `更新用のソースがありません` または `File '/tmp/hcd-device' does not exist` で更新できない

旧手順の `/tmp/hcd-device/` は一時置き場のため、再起動などで消えることがある。
開発PCで2-1〜2-2を行って `~/hcd-device-source/` に転送し、Piで2-3を実行する。
同じSSHユーザーで転送・インストールする。以降、通常の再起動ではソースは消えない。
ソースが見つからないエラーでは、アプリのインストールは行われていない。

### `JSONDecodeError` と `再送キューを読み込めません` で起動できない

再送キューの内容がJSONとして読めず、カメラを初期化する前に停止している。
このログだけでは、ファイルが壊れた原因や、以前に未送信の押印が入っていたかは分からない。
更新手順ではキューを削除・初期化しない。

起動修正を含む版（`6636320` 以降）では、キューが0バイトで、書き込み途中の一時ファイルもない場合に限り、
元ファイルを `pending-stamps.json.empty-<ランダム文字列>.bak` へ退避する。
空のキュー（`[]`）を保存し、警告ログへ退避先を出してカメラの起動を続ける。
内容が残る破損ファイル、一時ファイル、退避・保存の失敗がある場合は停止する。
この復旧は、以前の未送信データを復元したことや、データが失われていないことを意味しない。

キューは既にSDカード上にある。保存先がSDカードであることと、電源断時にも
書き込みが完了していることは別。保存処理では一時ファイルの内容を `fsync` し、
元のキューと置換した後にディレクトリも同期する（仕様6-7）。
この処理でも、SDカード自体の故障やあらゆるタイミングの電源断による破損は防ぎきれない。

まずPiで停止し、ファイルの大きさと、一時ファイル・バックアップの有無を確認する。
`storage.queue_file` を変更している機体では、その設定先を確認する。

```sh
sudo systemctl stop hcd-stamp-device
sudo ls -la /var/lib/hcd-stamp-device/
sudo wc -c /var/lib/hcd-stamp-device/pending-stamps.json
sudo ls -la /var/backups/hcd-stamp-device/
```

修正前の版が入ったPiで、`pending-stamps.json` が0バイトで、`pending-stamps.json.tmp` もなく、復元できる
バックアップもない場合は、空ファイルを削除せず別名で退避して起動を試せる。
アプリはキューファイルが存在しなければ空のキューとして起動する。

```sh
(
set -eu
HCD_QUEUE_FILE=/var/lib/hcd-stamp-device/pending-stamps.json
sudo systemctl stop hcd-stamp-device
sudo test -f "$HCD_QUEUE_FILE"
sudo test ! -s "$HCD_QUEUE_FILE"
sudo test ! -e "$HCD_QUEUE_FILE.tmp"
sudo mv --backup=numbered "$HCD_QUEUE_FILE" "$HCD_QUEUE_FILE.broken"
sudo sync -f /var/lib/hcd-stamp-device
sudo systemctl start hcd-stamp-device
)
```

このブロックは0バイト以外や一時ファイルがある場合には停止する。実行後にカメラ映像が
60秒以上動き続けることを確認し、`sudo reboot` 後にも同じ確認を行う。

0バイト以外のファイル、一時ファイル、バックアップがある場合は、未送信の押印が
残っている可能性がある。元のファイルを保全して内容を確認し、復元先を決めるまでは
上書き・初期化しない。現在のファイルが0バイトでも、以前の未送信データが
失われていないとは判断できない。起動後は2-4の動作確認を行う。

### `No camera number 0 found` で再起動を繰り返す

カメラがOSに認識されていない。ソフトの版とは関係なく、カメラを開く最初の処理で止まっている。

```sh
sudo systemctl stop hcd-stamp-device        # 再起動の繰り返しを止める
rpicam-hello --list-cameras                 # "No cameras available!" なら未認識
dmesg | grep -i imx                         # センサーのドライバーが読み込まれたか
grep -n camera_auto_detect /boot/firmware/config.txt   # 1 なら自動判別
```

- `dmesg` に何も出ない、または `failed to read chip id` が出る場合は、接続の問題。
  **電源を切ってから**、Pi側とカメラ基板側の両方でケーブルを差し直す（向き、奥まで差さっているか、ロック）。
  Pi Zero 2 Wには、片側が細い22ピンのZero用ケーブルが必要。
- 直ったら `sudo systemctl start hcd-stamp-device` で起動し、2-4の確認を行う。
- カメラのケーブルは、通電中に抜き差ししない。

### ピントが合わない、QRが読めない

- **Camera Module 3（標準レンズ）は、約6.7cmより近くにピントを合わせられない。**
  ソフトはピントに20（約5cm）を指定するが、標準レンズでは最も近い15（約6.7cm）に切り詰められる。
  Camera Module 3 Wideは約5cmから合わせられる。センサーはどちらも `imx708` と表示される。
- スマホの画面がピントの合う範囲に来るよう、筐体の中のスマホとレンズの距離を調整する。
  次で、実際に読める距離を測れる。0.5秒ごとに、QRが読めたかとQRの映る大きさを90秒間表示する。

```sh
sudo systemctl stop hcd-stamp-device
sudo -u stamp /opt/hcd-stamp-device/.venv/bin/python - <<'EOF'
import time
import cv2
from libcamera import controls
from picamera2 import Picamera2

camera = Picamera2()
camera.configure(camera.create_video_configuration(
    main={"format": "RGB888", "size": (640, 480)},
    controls={"FrameRate": 15, "AfMode": controls.AfModeEnum.Manual, "LensPosition": 15.0},
))
camera.start()
detector = cv2.QRCodeDetector()
print("スマホを近くから、ゆっくり遠ざけてください（90秒）")
end = time.monotonic() + 90
while time.monotonic() < end:
    frame = camera.capture_array()
    text, points, _ = detector.detectAndDecode(frame)
    side = 0 if points is None else int(cv2.norm(points[0][0] - points[0][1]))
    state = "読めた" if text else ("見つけたが読めない" if points is not None else "-")
    print(f"{time.strftime('%H:%M:%S')}  QR {state}  一辺 {side}px")
    time.sleep(0.5)
camera.stop()
EOF
sudo systemctl start hcd-stamp-device
```

- スマホを1cmごとに2秒ほど止めながら遠ざけ、「読めた」が続く範囲を定規で測る。
  その**真ん中**に画面が来るよう筐体を合わせる。近すぎる側は急に読めなくなり、遠い側はゆっくり悪くなるため、
  迷ったら少し遠めに寄せる。
- 「見つけたが読めない」は、QRは映っているがぼやけている状態。「-」の多くは、動かしている最中のぶれか、QRが画面の外に出たとき。

### pipがOpenCVやnumpyを入れ直してしまった

`--no-deps` を付け忘れた場合。1-4の、apt版のOpenCV・numpyへ切り替える手順を行う。

### ネットワーク（ポケットWi‑Fi）

| 症状 | 確認すること |
| --- | --- |
| SSIDが一覧に出ない | ポケットWi‑Fiの2.4GHzが無効になっていないか。`nmcli -f SSID,CHAN,SIGNAL device wifi list` の `CHAN` が1〜13なら2.4GHz |
| 接続できない | パスワードの誤り。`journalctl -u NetworkManager -n 50` に理由が出る |
| PCからPiへSSHできない | ポケットWi‑Fiの「プライバシーセパレーター（端末間通信の遮断）」が有効だと、同じWi‑Fiでも端末同士は通信できない。Piの動作には影響しない（サーバーへの通信だけを使うため）。SSHが必要なら、一時的に無効にするか、既存の接続設定へ戻して作業する |
| `/api/health` が返らない | ポケットWi‑Fiのデータ容量切れ、または圏外。スマホを同じWi‑Fiにつないでサイトが開けるか確認する |
| 時刻が同期しない | `sudo systemctl restart systemd-timesyncd` の後に `timedatectl` を再確認する |
| 隣のスポットのWi‑Fiにつながる | 3-6「接続先の確認」の手順で、そのスポットのSSIDへ切り替える。3-3の優先度20の設定が漏れていないかも確認する |
