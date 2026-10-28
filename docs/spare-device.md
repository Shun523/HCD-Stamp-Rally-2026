# 予備機への差し替え手順

故障したスタンプ機を、予備機（`dev-spare-01`）と入れ替える手順です。予備機は**故障機の機体IDとAPIキーを名乗って**動きます。サーバーは機体IDから押印のスポットを決めるので（spec 6-8）、本番DBの変更やデプロイは要りません。液晶のスタンプ画像は設定ファイルの `spot_id` で選ばれ、5スポット分の画像は全機体に入っています（spec 6-2）。

## 0. 方針

- 予備機は**普段は電源を切って**保管し、差し替えるときだけ電源を入れます。
- 当日その場でキーを打ち込まなくて済むよう、**5スポット分の設定ファイルを予備機へ前もって入れておきます**（2章）。当日は、ファイルをコピーしてサービスを再起動するだけです（3章）。
- 予備機には全機体のAPIキーが入るので、運営担当者が保管します（deploy.md 6章）。
- `/admin` では、電源を切っている予備機（`dev-spare-01`）が「断」として要対応アラートに出続けます。想定どおりの表示です。当日のスタッフに伝えておきます。

守ること:

1. **故障機の電源を先に切る。** 同じ機体IDが2台同時に動くと、ハートビートが混ざって `/admin` で故障に気づけず、両方から押印が届きます。
2. **予備機の未送信キューが空のときだけ切り替える。** キューには押印トークンと時刻しか入っておらず、再送のときは今の機体IDで送ります。残ったまま名乗りを変えると、前のスポットで読んだ押印が別のスポットとして記録されます（spec 6-7）。
3. **使い終えたら予備機の設定を `dev-spare-01` に戻してから電源を切る**（4章）。戻さずに切ると、次に電源を入れたときに故障機の名前で動き出し、直った元の機体と重なります。

## 1. 用意するもの

- 開発PC（`gcloud` を使えること）と、予備機へSSHできるネットワーク。会場ではポケットWi‑Fiに開発PCもつなぐ（pocket-wifi.md）
- 充電済みの予備機。機体ソフトは本番の5台と同じ版にしておく（device-update.md）
- `/admin` を開けるスマホ

## 2. 設定ファイルを予備機へ入れる（10月30日のリハーサルまでに1回）

予備機の今の `config.toml`（本番サーバーへつながる設定）をひな形にして、APIキー・機体ID・スポットIDの3項目だけを差し替えたファイルを5つ作ります。APIキーは Secret Manager の `hcd-device-keys` から読みます。

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
gcloud secrets versions access latest --secret=hcd-device-keys --project="$PROJECT_ID" > "$work/keys.json"
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

   予備機のSSHユーザーが、パスワードなしで `sudo` できる前提です（Raspberry Pi OSの初期ユーザーの既定）。`sudo: a password is required` で止まった場合、予備機には何も書き込まれていません。その場合はSSHでログインした中で同じ処理をする手順に直す必要があるので、この章は当日より前に試しておきます。

3. 最後の一覧に `dev-01.toml`〜`dev-05.toml` と `dev-spare-01.toml` の6つが、所有者 `stamp`、権限 `-rw-------` で出ればよい。`dev-spare-01.toml` は予備機自身の設定の控えで、4章で戻すときに使う。
4. リハーサルで3章の切り替えを一度通す（どれか1台の電源を切り、予備機をその機体として起動して押印する）。終わったら4章で戻し、予備機の電源を切る。

APIキーを作り直したときは、この章をやり直します。

## 3. 当日に差し替える

`dev-03` が故障した場合の例です。機体IDは故障機のものに読み替えます。

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
6. 切り替えた時刻と機体IDを記録しておく。データ上は予備機の押印も `dev-03` として残るため、あとで予備機を使った時間帯を知るにはこの記録が要る（data.md）。

## 4. 予備機を戻す

元の機体が直ったとき、またはイベントが終わったときに行います。

1. 予備機の未送信キューが空であることを3章の3と同じ方法で確かめる。空でなければ、再送が終わるまで待つ。
2. 予備機の設定を自分のものに戻し、電源を切る。

```sh
sudo install -m 600 -o stamp -g stamp /etc/hcd-stamp-device/spots/dev-spare-01.toml /etc/hcd-stamp-device/config.toml
sudo sync -f /etc/hcd-stamp-device/config.toml
sudo poweroff
```

3. 元の機体を使うなら、予備機の電源が切れてから電源を入れる。元の機体に残っていた未送信キューは、ネットワークにつながれば同じ機体IDで再送される（11月1日0:00に自動で消えるので、それまでに）。
