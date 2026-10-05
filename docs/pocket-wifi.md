# ポケットWi‑Fiのセットアップ手順

スタンプ機（Raspberry Pi Zero 2 W）を、レンタルのポケットWi‑Fi経由で本番サーバーへ接続する手順です。
Raspberry Pi OS（Trixie）はNetworkManagerでWi‑Fiを管理するため、`nmcli` を使います。
SSID・パスワードはこのリポジトリに書かないでください。

## 0. 方針

- **全部のPiに、全部のポケットWi‑Fiを登録します。** レンタル品はSSIDを変更できないため、
  1台ずつ別のSSIDになります。全部を登録しておけば、Piはその場で見えているSSIDへ自動で接続します。
  予備機をどのスポットへ持って行っても、ポケットWi‑Fiが1台故障して隣の電波が届く場合も、
  そのままつながります。
- 登録名は全部のPiで共通にし、`pocket-wifi-1`、`pocket-wifi-2` … とします。番号と本体の対応は、
  本体にテープなどで番号を貼って管理します。**番号はスポット番号と揃え**、`pocket-wifi-1` は
  spot-01 に置く、のようにします。
- **各機体は、自分のスポットのポケットWi‑Fiを最優先にします**（優先度20、ほかは10）。本番の日は、
  ポケットWi‑Fiの電源を入れてからPiを起動するだけで、そのスポットのWi‑Fiにつながります。
  そのWi‑Fiが止まった場合は、届くほかのポケットWi‑Fiへ自動で逃げます。
- **1台のポケットWi‑Fiが届くのは、見通しで十数メートル程度です。** スポットが離れているなら、
  スポットごとに1台置きます。
- **Pi Zero 2 Wは2.4GHz帯にしか接続できません。** 5GHz専用の設定になっていると、SSIDが見えません。
- **通信量に上限があります。** 電源を入れるのは試験中だけにし、終わったらすぐ切ります（6章・7章）。

## 1. ポケットWi‑Fi本体の設定

本体の画面、または管理画面（説明書に記載のアドレス）で設定します。

| 項目 | 設定 | 理由 |
| --- | --- | --- |
| 周波数帯 | 2.4GHzを有効（2.4GHz専用、または2.4GHz/5GHz同時） | Pi Zero 2 Wは2.4GHzのみ |
| 同時接続台数 | その場所で使う台数（Pi＋スタッフのPC・スマホ）以上 | 上限を超えると後から来た機器がつながらない |
| 無通信時のスリープ・自動電源オフ | 当日は無効。試験期間中は有効のままでもよい | 当日にスリープすると断になる。試験中は切り忘れ対策になる |
| データ容量 | 上限と、残量の確認方法を確かめる | 6章の見込みと比べる |

電源は、イベントの時間（準備を含めて8時間以上）を電池だけで持つか確認します。足りない場合は、
モバイルバッテリーかACアダプターを用意します。

## 2. 全部のPiに、全部のポケットWi‑Fiを登録する

今つながっているネットワーク（自宅Wi‑Fi、テザリングなど）でPiへSSHし、ポケットWi‑Fiの設定を
**追加**します。登録は設定を保存するだけなので、ポケットWi‑Fiの電源が入っていなくても行えます。
SSHも切れません。既存の接続設定は消さずに予備として残します。

1. 今の接続設定の名前を確認します。Raspberry Pi Imagerで設定したWi‑Fiは、OSの版により
   `preconfigured` や `netplan-wlan0-<SSID>` などの名前になります。以降は `<既存の接続名>` と書きます。

   ```sh
   nmcli connection show
   ```

2. ポケットWi‑Fiの台数分、次を繰り返します。`<番号>` と `<SSID>` を書き換え、パスワードは
   プロンプトに入力します（画面と履歴に残りません）。

   ```sh
   read -rsp 'Pocket Wi-Fi password: ' PSK; echo
   sudo nmcli connection add type wifi con-name pocket-wifi-<番号> ifname wlan0 ssid '<SSID>' \
     wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PSK" \
     connection.autoconnect yes connection.autoconnect-priority 10 \
     802-11-wireless.powersave 2
   unset PSK
   ```

   - `autoconnect-priority 10`: 既存の設定（優先度0）より優先します。ポケットWi‑Fi同士は同じ優先度にします。
   - `powersave 2`: Wi‑Fiの省電力を切ります。省電力が効いていると、押印の応答が遅れることがあります。
   - 設定は `/etc/NetworkManager/system-connections/` にroot専用の権限で保存されます。

3. **自分のスポットのポケットWi‑Fiを最優先にします。** 予備機は、どこへ持って行くか決まって
   いないため、この手順を行いません（全部10のまま）。

   | 機体 | 実行するコマンド |
   | --- | --- |
   | dev-01（spot-01） | `sudo nmcli connection modify pocket-wifi-1 connection.autoconnect-priority 20` |
   | dev-02（spot-02） | `sudo nmcli connection modify pocket-wifi-2 connection.autoconnect-priority 20` |
   | dev-03（spot-03） | `sudo nmcli connection modify pocket-wifi-3 connection.autoconnect-priority 20` |
   | dev-04（spot-04） | `sudo nmcli connection modify pocket-wifi-4 connection.autoconnect-priority 20` |
   | dev-05（spot-05） | `sudo nmcli connection modify pocket-wifi-5 connection.autoconnect-priority 20` |
   | dev-spare-01 | 行わない |

   この変更は、次に接続先を選ぶとき（起動時、接続が切れたとき）から効きます。今つながっている
   接続は切り替わりません。

4. 登録できたことを確認します。全部の `pocket-wifi-<番号>` が並び、自分のスポットの番号だけが
   `20`、ほかが `10` になっていれば完了です。

   ```sh
   nmcli -f NAME,TYPE,AUTOCONNECT,AUTOCONNECT-PRIORITY connection show
   ```

これを全部のPi（予備機を含む）で行います。

## 3. 全部のSSIDにつながるか一括で確かめる

パスワードの打ち間違いは、登録の時点では分かりません。全部のポケットWi‑Fiの電源を入れて同じ場所に
置き、各Piで次を実行します。Piが順番に全部のSSIDへ接続し、本番サーバーへの疎通を記録します。

```sh
sudo systemd-run --unit wifi-check bash -c '
for c in $(nmcli -g NAME connection show | grep ^pocket-wifi); do
  echo "== $c"
  nmcli connection up "$c" && sleep 5 && curl -s -m 10 https://hcd-stamp-rally-th6cagb4vq-an.a.run.app/api/health
  echo
done'
```

1. 実行するとWi‑Fiが切り替わるため、**SSHは途中で切れます。** `systemd-run` で動かしているので、
   確認は最後まで続きます。
2. 1分ほど待ち、**最後に確認したSSID**にPCをつないで、Piへ入り直します（`ssh <ホスト名>.local`）。
3. 結果を見ます。全部のSSIDで `{"ok":true,"db":"ok"}` が出ていれば合格です。

   ```sh
   journalctl -u wifi-check --no-pager
   ```

   `Error: Connection activation failed` が出たSSIDは、パスワードの誤りです。
   `sudo nmcli connection delete pocket-wifi-<番号>` で消して、2章の手順で登録し直します。

同じPiでもう一度実行する場合は、先に `sudo systemctl reset-failed wifi-check` を実行します。

## 4. 接続の確認

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
- [ ] `timedatectl` で `System clock synchronized: yes`（オフライン押印の時刻判定に必要、6-7）
- [ ] 1分ほど待つと、`/admin` でその機体が「正常」になる
- [ ] 実スマホで押印し、液晶とスマホに反映される

## 5. 本番の日の起動と、設置場所での確認

### 起動の順番

1. **先にポケットWi‑Fiの電源を入れ**、スポットに置きます。
2. 1分ほど待ってから、Piの電源を入れます。Piは起動時に、見えている登録済みのWi‑Fiのうち優先度の
   高いもの（そのスポットのポケットWi‑Fi）へ自動でつながります。
3. 1分ほど待ち、`/admin` でその機体が「正常」になったことを確認します。

Piを先に起動した場合、その時点で見えているほかのポケットWi‑Fiにつながることがあります。
**接続中のWi‑Fiから、優先度の高いWi‑Fiへ自分から乗り換えることはありません。** 何も見えて
いなければ、Piは探し続け、ポケットWi‑Fiの電源が入った時点でつながります。

### 接続先の確認

SSHできる場合は、各機体で接続先を確かめます。

```sh
nmcli -f NAME,DEVICE connection show --active
iw dev wlan0 link
```

`wlan0` の接続がそのスポットの `pocket-wifi-<番号>` でなければ、切り替えます（SSHはここで切れます）。

```sh
sudo nmcli connection up pocket-wifi-<そのスポットの番号>
```

SSHできない場合は、Piを再起動するか、つながっているほうのポケットWi‑Fiの電源を一時的に切ります。
Piはそのスポットのポケットへ移ります。

### 設置場所での確認項目

ポケットWi‑Fiは、実際に置く場所と同じ位置・同じ距離で確認します。建物の壁や人混みで電波は弱くなります。

- [ ] 各機体が、そのスポットのポケットWi‑Fiにつながっている
- [ ] 設置位置で `signal` が -70 dBm より大きい（弱い場合は近づける）
- [ ] そのスポットのポケットWi‑Fiの電源を切ると、ほかのポケットWi‑Fiが届く場所ではそちらへ移り、
  届かない場所では、押印で液晶に「あとで反映されます」が出る
- [ ] 電源を入れ直したあと、届かない場所だった機体は自動で再接続し、5秒間隔の再送でスマホに反映される。
  ほかへ移った機体は自動では戻らないため、上の「接続先の確認」で戻す
- [ ] 当日の設定（スリープ無効）で数時間置いて、ポケットWi‑Fiが勝手に電源オフしない

### 予備機を差し替えるとき

予備機は全部のポケットWi‑Fiが優先度10のため、行き先で見えているどれかにつながります。そのスポットの
ポケットWi‑Fiを優先させる場合は、差し替え先で次を実行します。

```sh
sudo nmcli connection modify pocket-wifi-<行き先の番号> connection.autoconnect-priority 20
sudo nmcli connection up pocket-wifi-<行き先の番号>
```

予備機のスポット割当（サーバー側）の変更は別の手順です（docs/remaining-tasks.md C章）。

## 6. 通信量を抑える

**Piの通信量の見込み。** Piが使うのは、30秒ごとのハートビートと押印だけです。1回あたり暗号化の
やり取りを含めて10KB未満のため、1台あたり1時間で1MB程度、6台で8時間動かしても100MB未満の見込みです。
実際の量は、ポケットWi‑Fi本体の画面で、試験の前後に確認してください。

通信量を大きく消費するのは、Piよりも次の2つです。

- **PCやスマホ。** OSの更新、クラウドの同期、アプリの更新で、数GB使うことがあります。
  - ポケットWi‑FiにつなぐのはSSHが必要なときだけにし、終わったら切断します。
  - Windowsでは、そのWi‑Fiの「プロパティ」で「従量制課金接続として設定する」をオンにします。
    Windows Updateなどの大きなダウンロードが止まります。
  - スマホは、Piの押印確認用ならモバイル通信のままでよく、ポケットWi‑Fiにつなぐ必要はありません。
- **Piの自動更新。** 次で、パッケージ一覧の自動ダウンロードが有効かを確認します。

  ```sh
  apt-config dump APT::Periodic
  ```

  `APT::Periodic::Update-Package-Lists "1";` が出たら有効です。イベントが終わるまで止めます。

  ```sh
  sudo systemctl disable --now apt-daily.timer apt-daily-upgrade.timer
  ```

  何も出ない、または `"0"` なら、何もしなくて構いません。イベント後に戻す場合は、
  `disable` を `enable` に変えて実行します。

## 7. 試験が終わったら、すぐ切る

次の順に行います。ポケットWi‑Fiの電源を切れば、Piからの通信は確実に止まります。

1. `/admin` で、全機体の**未送信キューが0件**であることを確認します。
   残っていても失われることはなく、次にネットワークへつながったときに再送されます。
2. Piをもう使わない場合は、SSHで入り、電源を切ります。SDカードの破損を避けるため、
   電源ケーブルを抜く前にこちらを行います。

   ```sh
   sudo poweroff
   ```

   SSHが切れてから10秒ほど待ち、基板の緑のランプが消えたことを確かめてから電源ケーブルを抜きます。
   液晶は、電源が入っている間は最後の画面を表示したままです。
3. **ポケットWi‑Fiの電源を切ります。** Piの電源を入れたままの場合、Piは自宅などの既存のWi‑Fiが
   届けばそちらへ自動で切り替わり、届かなければ通信しません。ダッシュボードではその機体が
   「断」になりますが、異常ではありません。
4. PCをポケットWi‑Fiから切断します。
5. 本番環境を試験期間用の設定にしていた場合は、通常設定に戻します（docs/remaining-tasks.md
   「Cloud Run設定」）。

Piを動かしたまま、ポケットWi‑Fiだけを使わせたくない場合は、Wi‑Fiを既存の接続へ戻します。
SSHは、既存の接続側のIPアドレスへ入り直します。

```sh
sudo nmcli connection up '<既存の接続名>'
```

## 8. うまくいかないとき

| 症状 | 確認すること |
| --- | --- |
| SSIDが一覧に出ない | ポケットWi‑Fiの2.4GHzが無効になっていないか。`nmcli -f SSID,CHAN,SIGNAL device wifi list` の `CHAN` が1〜13なら2.4GHz |
| 接続できない | パスワードの誤り。`journalctl -u NetworkManager -n 50` に理由が出る |
| PCからPiへSSHできない | ポケットWi‑Fiの「プライバシーセパレーター（端末間通信の遮断）」が有効だと、同じWi‑Fiでも端末同士は通信できない。Piの動作には影響しない（サーバーへの通信だけを使うため）。SSHが必要なら、一時的に無効にするか、既存の接続設定へ戻して作業する |
| `/api/health` が返らない | ポケットWi‑Fiのデータ容量切れ、または圏外。スマホを同じWi‑Fiにつないでサイトが開けるか確認する |
| 時刻が同期しない | `sudo systemctl restart systemd-timesyncd` の後に `timedatectl` を再確認する |
| 隣のスポットのWi‑Fiにつながる | 5章「接続先の確認」の手順で、そのスポットのSSIDへ切り替える。2章の優先度20の設定が漏れていないかも確認する |

ポケットWi‑Fiの設定を消す場合:

```sh
sudo nmcli connection delete pocket-wifi-<番号>
```
