# 機体ソフトの配り直し手順

一度セットアップを済ませたスタンプ機（Raspberry Pi Zero 2 W）に、新しい版の機体ソフトを入れ直す手順です。
初回のセットアップは [`device-test.md`](device-test.md) の Step 2〜3 を参照してください。

## 0. 方針

- **予備機を含む6台すべて**（`dev-01`〜`dev-05`、`dev-spare-01`）に、同じ版を入れます。
- **配るのはコミット済みの版です。** 開発PCの作業ツリーには未コミットの変更が混ざることがあるため、
  `git archive` でコミットの中身だけを取り出して送ります。
- **入れ替えるのはアプリだけです。** 実行ユーザー、venv、aptのパッケージ、systemdの登録、
  `/etc/hcd-stamp-device/config.toml`、未送信キューのファイルはそのまま残ります。
- **転送したソースもSDカード上に残します。** SSHユーザーの `~/hcd-device-source/` に保存し、
  そこから `/opt/hcd-stamp-device/.venv/` にインストールします。起動時はsystemdが
  `/opt` にインストールしたアプリを実行するため、PCへの接続や再転送は不要です。
- **前日確認（[`deploy.md`](deploy.md) 5章）より前に終えます。** 前日確認で、配り直した版の動作を確かめます。
- **一般開放（10月31日10:00）より前の確認では、使うスマホを `/admin` で解除しておきます**（spec 4-8、7章）。
  解除しないと待機画面になり、QRを出せません。

## 1. 配る版を用意する（開発PC）

WSLのターミナルで、リポジトリ直下で実行します。

```sh
(
set -eu
git switch main
git pull
git log -1 --format='%h %ad %s' --date=short -- device   # device/ を最後に変えたコミット
REV=$(git rev-parse --short HEAD)
rm -rf /tmp/hcd-release && mkdir -p /tmp/hcd-release
git archive "$REV" device | tar -x -C /tmp/hcd-release
echo "$REV"   # 配った版として「5. 記録」に控える
)
```

今回の起動修正を配る場合は、次の両方を含むコミットを指定します。
未コミットの修正は `git archive` の配布物に入りません。

- 再送キューの内容と、置換後のディレクトリをディスクへ同期する処理（仕様6-7）
- 0バイトのキューを保全して空のキューで起動を続ける処理。一時ファイルがなく、
  元ファイルの退避と空キューの保存が成功した場合だけ起動を続ける

以前配布した `ed62dde` には次の2つが入っていますが、今回の起動修正は含まれていません。
手順3の確認で `起動修正 OK` が出ることを確かめてから起動します。

- スタンプ画像の確定版（`99a529b`。spec 4-6、6-2）
- Camera Module 3のピントを位置20に固定する変更（`ed62dde`。spec 6-2）

## 2. Piへ転送する（開発PC・機体ごと）

```sh
(
set -eu
rsync -a --delete /tmp/hcd-release/device/ <SSHユーザー>@<Piホスト名>.local:hcd-device-source/
ssh <SSHユーザー>@<Piホスト名>.local 'sync -f "$HOME/hcd-device-source"'
)
```

- 転送先の `hcd-device-source/` は、PiのSSHユーザーのホームディレクトリ内です。
  たとえば `admin` なら `/home/admin/hcd-device-source/` で、通常の再起動では消えません。
- `--delete` が削除する範囲は、このソース用ディレクトリ内だけです。配る版とまったく同じ中身にします。
- ホスト名で接続できない場合は、[`device-test.md`](device-test.md) 2-2で確認したIPアドレスを使います。
- 転送後の `sync -f` で、転送先のファイルシステムの書き込み完了を待ちます。
  押印の再送キューは別の場所（`/var/lib/hcd-stamp-device/`）に保存されます。
- 新しい版に更新するときは転送し直します。同じ版の入れ直しやPiの再起動のための再転送は不要です。

## 3. 入れ直す（Pi・機体ごと）

次のブロック全体を一度に貼り付けます。転送済みのファイルを確認し、アプリを停止して
再送キューをバックアップしてから入れ替えます。途中で失敗した場合は、そこで止まり、
残りのコマンドは実行しません。サービス停止後に失敗した場合は、サービスは停止したままです。
`storage.queue_file` をひな形から変更している機体では、バックアップ元のパスも設定先に合わせます。

```sh
(
set -eu
HCD_SOURCE_DIR="$HOME/hcd-device-source"
HCD_PACKAGE_FILE="$HOME/hcd-stamp-device.tar.gz"

if [ ! -f "$HCD_SOURCE_DIR/pyproject.toml" ]; then
  echo '更新用のソースがありません。開発PCで手順1〜2を行ってから、手順3をやり直してください。' >&2
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

- **エラーが出たら、その内容を確認してからブロック全体をやり直します。** pipが失敗した後に、
  続きの起動コマンドだけを実行しないでください。
- **`起動修正 OK` が出なければ、この修正を含む版がインストールされたとは判断しません。**
  確認用ファイルは終了時に削除されます。実際の押印データを空にして試す操作は不要です。
- ソースから作った `~/hcd-stamp-device.tar.gz` をインストールします。pipのビルドで
  ソース内にroot所有のファイルができ、次の転送を妨げることを避けるためです。
- バックアップには未送信の押印トークンが含まれます。保存先はrootだけがアクセスできる
  ディレクトリです。更新前から壊れていたキューは、バックアップしても修復されません。
- **`--no-deps` は必ず付けます。** 付けないと、pip版のOpenCVとnumpyが入り直します。
  [`device-test.md`](device-test.md) 2-4でapt版に切り替えた機体では、カメラのエラーが再発するおそれがあります。
- **`--force-reinstall` を付けます。** 機体ソフトのバージョン番号（0.1.0）は変わらないため、付けないと入れ直されないことがあります。

10月22日時点の版が入ったかは、次で確かめられます。

```sh
grep -c LensPosition /opt/hcd-stamp-device/.venv/lib/python3*/site-packages/hcd_stamp_device/hardware.py
ls -l /opt/hcd-stamp-device/.venv/lib/python3*/site-packages/hcd_stamp_device/assets/stamps/
```

- [ ] `grep` の結果が `2`（ピントの固定が入っている。`LensPosition` を含む行の数で、固定前の版なら `0`）
- [ ] スタンプ画像の大きさ（`ls -l` のバイト数）が、spot-01から順に `56126`、`60174`、`63003`、`59452`、`60228`
  （確定版と一致。古い仮画像は6〜7千バイト）

## 4. 動作を確かめる（機体ごと）

- [ ] `systemctl is-active hcd-stamp-device` が `active`
- [ ] 60秒以上動かし、ログに例外や再起動の繰り返しが出ず、液晶のカメラ映像が動き続ける
- [ ] ダッシュボード（`/admin`）で、この機体が「正常」、未送信キューが0件
- [ ] 解除したスマホでQR（75×75 CSSピクセル）を出し、普段の明るさのまま筐体に押し当てて押印できる。
  液晶に新しい絵柄が2秒出て、スマホのスタンプ帳にも反映される
- [ ] 同じスポットでもう一度押すと、チェック付きの絵柄が出る
- [ ] 0バイトのキューから復旧した機体は、この起動のログに退避先があり、そのファイルが残っている

ここまで確認したら、Piを再起動します。

```sh
sudo reboot
```

SSHが切れるので、Piの起動を待って同じSSHユーザーで入り直し、Pi上で次を実行します。
ソースの再転送やアプリの再インストールは行いません。

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

起動直後の `active` だけでは完了にしません。再起動後の確認も成功してから「5. 記録」の
「4の確認」を完了にします。

作業後に電源を切る場合は、Piで次を実行し、OSの終了処理が完了してから電源を外します。
SDカード上に保存していても、書き込み途中の電源断ではデータが壊れる可能性があります。

```sh
sudo poweroff
```

## 5. 記録

| 機体ID | 配った版 | 日付 | 4の確認 |
| --- | --- | --- | --- |
| dev-01 | | | |
| dev-02 | | | |
| dev-03 | | | |
| dev-04 | | | |
| dev-05 | | | |
| dev-spare-01 | | | |

## 6. うまくいかないとき

### `更新用のソースがありません` または `File '/tmp/hcd-device' does not exist` で更新できない

旧手順の `/tmp/hcd-device/` は一時置き場のため、再起動などで消えることがあります。
今回からは開発PCで手順1〜2を行って `~/hcd-device-source/` に転送し、Piで手順3を実行します。
同じSSHユーザーで転送・インストールしてください。以降、通常の再起動ではソースは消えません。
ソースが見つからないエラーでは、アプリのインストールは行われていません。

### `JSONDecodeError` と `再送キューを読み込めません` で起動できない

再送キューの内容がJSONとして読めず、カメラを初期化する前に停止しています。
このログだけでは、ファイルが壊れた原因や、以前に未送信の押印が入っていたかは分かりません。
更新手順ではキューを削除・初期化しません。

起動修正を含む版では、キューが0バイトで、書き込み途中の一時ファイルもない場合に限り、
元ファイルを `pending-stamps.json.empty-<ランダム文字列>.bak` へ退避します。
空のキュー（`[]`）を保存し、警告ログへ退避先を出してカメラの起動を続けます。
内容が残る破損ファイル、一時ファイル、退避・保存の失敗がある場合は停止します。
この復旧は、以前の未送信データを復元したことや、データが失われていないことを意味しません。

キューは既にSDカード上にあります。保存先がSDカードであることと、電源断時にも
書き込みが完了していることは別です。保存処理では一時ファイルの内容を `fsync` し、
元のキューと置換した後にディレクトリも同期します（仕様6-7）。
この処理でも、SDカード自体の故障やあらゆるタイミングの電源断による破損は防ぎきれません。

まずPiで停止し、ファイルの大きさと、一時ファイル・バックアップの有無を確認します。
`storage.queue_file` を変更している機体では、その設定先を確認してください。

```sh
sudo systemctl stop hcd-stamp-device
sudo ls -la /var/lib/hcd-stamp-device/
sudo wc -c /var/lib/hcd-stamp-device/pending-stamps.json
sudo ls -la /var/backups/hcd-stamp-device/
```

修正前の版が入ったPiで、`pending-stamps.json` が0バイトで、`pending-stamps.json.tmp` もなく、復元できる
バックアップもない場合は、空ファイルを削除せず別名で退避して起動を試せます。
アプリはキューファイルが存在しなければ空のキューとして起動します。

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

このブロックは0バイト以外や一時ファイルがある場合には停止します。実行後にカメラ映像が
60秒以上動き続けることを確認し、`sudo reboot` 後にも同じ確認を行います。

0バイト以外のファイル、一時ファイル、バックアップがある場合は、未送信の押印が
残っている可能性があります。元のファイルを保全して内容を確認し、復元先を決めるまでは
上書き・初期化しないでください。現在のファイルが0バイトでも、以前の未送信データが
失われていないとは判断できません。起動後は手順4の動作確認を行います。

### `No camera number 0 found` で再起動を繰り返す

カメラがOSに認識されていません。ソフトの版とは関係なく、カメラを開く最初の処理で止まっています。

```sh
sudo systemctl stop hcd-stamp-device        # 再起動の繰り返しを止める
rpicam-hello --list-cameras                 # "No cameras available!" なら未認識
dmesg | grep -i imx                         # センサーのドライバーが読み込まれたか
grep -n camera_auto_detect /boot/firmware/config.txt   # 1 なら自動判別
```

- `dmesg` に何も出ない、または `failed to read chip id` が出る場合は、接続の問題です。
  **電源を切ってから**、Pi側とカメラ基板側の両方でケーブルを差し直します（向き、奥まで差さっているか、ロック）。
  Pi Zero 2 Wには、片側が細い22ピンのZero用ケーブルが必要です。
- 直ったら `sudo systemctl start hcd-stamp-device` で起動し、4の確認を行います。
- カメラのケーブルは、通電中に抜き差ししないでください。

### ピントが合わない、QRが読めない

- **Camera Module 3（標準レンズ）は、約6.7cmより近くにピントを合わせられません。**
  ソフトはピントに20（約5cm）を指定しますが、標準レンズでは最も近い15（約6.7cm）に切り詰められます。
  Camera Module 3 Wideは約5cmから合わせられます。センサーはどちらも `imx708` と表示されます。
- スマホの画面がピントの合う範囲に来るよう、筐体の中のスマホとレンズの距離を調整します。
  次で、実際に読める距離を測れます。0.5秒ごとに、QRが読めたかとQRの映る大きさを90秒間表示します。

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

- スマホを1cmごとに2秒ほど止めながら遠ざけ、「読めた」が続く範囲を定規で測ります。
  その**真ん中**に画面が来るよう筐体を合わせます。近すぎる側は急に読めなくなり、遠い側はゆっくり悪くなるため、
  迷ったら少し遠めに寄せます。
- 「見つけたが読めない」は、QRは映っているがぼやけている状態です。「-」の多くは、動かしている最中のぶれか、QRが画面の外に出たときです。

### pipがOpenCVやnumpyを入れ直してしまった

`--no-deps` を付け忘れた場合です。[`device-test.md`](device-test.md) 2-4の、apt版のOpenCV・numpyへ切り替える手順を行います。

### 前の版に戻したい

`git log --oneline -- device` で戻したい版のコミットを探し、1の `REV` にそのコミットを指定して、1〜4をやり直します。
