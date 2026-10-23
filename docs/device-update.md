# 機体ソフトの配り直し手順

一度セットアップを済ませたスタンプ機（Raspberry Pi Zero 2 W）に、新しい版の機体ソフトを入れ直す手順です。
初回のセットアップは [`device-test.md`](device-test.md) の Step 2〜3 を参照してください。

## 0. 方針

- **予備機を含む6台すべて**（`dev-01`〜`dev-05`、`dev-spare-01`）に、同じ版を入れます。
- **配るのはコミット済みの版です。** 開発PCの作業ツリーには未コミットの変更が混ざることがあるため、
  `git archive` でコミットの中身だけを取り出して送ります。
- **入れ替えるのはアプリだけです。** 実行ユーザー、venv、aptのパッケージ、systemdの登録、
  `/etc/hcd-stamp-device/config.toml`、未送信キューのファイルはそのまま残ります。
- **前日確認（[`deploy.md`](deploy.md) 5章）より前に終えます。** 前日確認で、配り直した版の動作を確かめます。
- **一般開放（10月31日10:00）より前の確認では、使うスマホを `/admin` で解除しておきます**（spec 4-8、7章）。
  解除しないと待機画面になり、QRを出せません。

## 1. 配る版を用意する（開発PC）

WSLのターミナルで、リポジトリ直下で実行します。

```sh
git switch main
git pull
git log -1 --format='%h %ad %s' --date=short -- device   # device/ を最後に変えたコミット
REV=$(git rev-parse --short HEAD)
rm -rf /tmp/hcd-release && mkdir -p /tmp/hcd-release
git archive "$REV" device | tar -x -C /tmp/hcd-release
echo "$REV"   # 配った版として「5. 記録」に控える
```

2026年10月22日時点では、`ed62dde` 以降を配ります。この版には次の2つが入っています。

- スタンプ画像の確定版（`99a529b`。spec 4-6、6-2）
- Camera Module 3のピントを位置20に固定する変更（`ed62dde`。spec 6-2）

## 2. Piへ転送する（開発PC・機体ごと）

```sh
rsync -a --delete /tmp/hcd-release/device/ <SSHユーザー>@<Piホスト名>.local:/tmp/hcd-device/
```

- `--delete` を付けると、以前の転送で残った古いファイルが `/tmp/hcd-device` から消え、配る版とまったく同じ中身になります。
- ホスト名で接続できない場合は、[`device-test.md`](device-test.md) 2-2で確認したIPアドレスを使います。

## 3. 入れ直す（Pi・機体ごと）

```sh
# Camera Module 3の機体で、ピント制御のライブラリを読み込めるか先に確かめる（"libcamera OK" が出ればよい）
sudo -u stamp /opt/hcd-stamp-device/.venv/bin/python -c 'from libcamera import controls; print("libcamera OK")'

sudo /opt/hcd-stamp-device/.venv/bin/pip install --no-deps --force-reinstall /tmp/hcd-device
sudo systemctl restart hcd-stamp-device
sudo systemctl status hcd-stamp-device --no-pager
journalctl -u hcd-stamp-device -n 30 --no-pager
```

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
