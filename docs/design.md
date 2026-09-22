# デザインガイド（Webアプリ）

対象は web/ の参加者向け画面。スタッフ用ダッシュボードはトークンだけ共通にし、装飾は最小限にする。

## 0. 方向性

昨年のポスターの配色（クリーム地、コーラル、焦げ茶、黄、紫）を、**ネオブルータリズム**で組み直す。太い枠線、ぼかしのない影、フラットな色面、太い丸ゴシック。

- **レイアウト**はUI案Bのスタンプカード。5つの枠を、中央のGOALを囲む輪に並べる
- **部品と色づかい**はUI案Cのすごろくマップ。紫の番号マーカー、緑の地面と黄土色の道、コーラルの縁取り見出し
- 輪を道でつなぐので、始点も終点もない。順番を問わないこと（spec Q-13）が見た目から伝わるようにする

### 画面の構成

- 画面の切り替えは**ヘッダーのタブ**で行う。タブは「スタンプ帳」「マップ」「協賛企業」の3つ
- スタンプ帳の枠をタップすると、**QR表示が全画面で開く**。このときヘッダーとタブは隠す
- 「遊び方」「景品交換所の案内」「スタンプが消えた方へ」は、スタンプ帳のボタンから**ポップアップ**で開く
- **ゴールページ**はスタンプ帳の中央のGOALから開く（完走後）。5個目の押印時は自動で遷移する
- 画面の下端に固定したナビゲーションは置かない

```mermaid
flowchart TD
  first[初回説明] --> book
  subgraph tabs[ヘッダーのタブ]
    book[スタンプ帳]
    map[マップ]
    sponsor[協賛企業]
  end
  book -- 未押印の枠 --> qr[QR表示（全画面）]
  qr -- もどる --> book
  book -- ボタン --> pop[ポップアップ：遊び方／景品交換所の案内／スタンプが消えた方へ]
  book -- 完走後のGOAL --> goal[ゴールページ]
  overlay[押印演出（どの画面にいても出る）] -- 5個目 --> goal
```

## 1. 原則

1. **押す体験を画面でも。** タップできる要素はすべて影をつけて浮かせ、押すと影のぶん沈む。タップできないものには影をつけない
2. **屋外と幅広い年齢層。** 本文は16px、文字のコントラストはWCAG AA（4.5:1、24px以上の太字は3:1）以上、タップ領域は48×48px以上
3. **色は面で塗る。** グラデーション、ぼかした影、半透明の重ね（すりガラス風など）は使わない。例外はポップアップの背景を暗くする1か所だけ
4. **装飾は控えめに。** きらめき（4点星）は1画面3つまで。情報の上に重ねない
5. **英語でも崩れない。** 文字を含む要素に固定幅を与えない。英語は日本語より1.5倍ほど長くなる前提で折り返しを許す

## 2. デザイントークン

`web/src/styles/tokens.css` に CSS 変数として定義する。色・枠線・影・角丸・フォントは**この変数だけを使い**、コンポーネントやページに色コードを直書きしない。

```css
:root {
  color-scheme: light;

  /* 色 */
  --color-bg: #FFF7EA;          /* 画面の地 */
  --color-surface: #FFFFFF;     /* カード */
  --color-ink: #231815;         /* 枠線・文字・影 */
  --color-muted: #6B5147;       /* 補足文字（地の上で7:1） */
  --color-coral: #F0555C;       /* 大見出し専用。必ずインクの縁取りと組み合わせる */
  --color-coral-strong: #D6333F;/* 白文字を載せる面（選択中のタブ、ボタン、タグ） */
  --color-purple: #6A3FA0;      /* 未押印の番号マーカー、手順2 */
  --color-purple-soft: #F4EEFB; /* QR目印の円の内側 */
  --color-yellow: #FFD84D;      /* チップ、強調、完走 */
  --color-pink: #FDE3E8;        /* 案内の帯 */
  --color-board: #CFE8B8;       /* スタンプ帳の地面 */
  --color-road: #F3D29B;        /* 道 */
  --color-tree: #7DBB5E;        /* 木の飾り */
  --color-stamp: #E4414B;       /* 仮スタンプの色 */
  --color-backdrop: rgb(35 24 21 / 0.55); /* ポップアップの背景（唯一の半透明） */

  /* 枠線と影（影はぼかさない） */
  --border: 3px solid var(--color-ink);
  --border-thin: 2px solid var(--color-ink);
  --shadow-sm: 3px 3px 0 var(--color-ink);
  --shadow-md: 5px 5px 0 var(--color-ink);
  --shadow-lg: 8px 8px 0 var(--color-ink);

  /* 角丸 */
  --radius-card: 18px;
  --radius-button: 14px;
  --radius-pill: 999px;

  /* 余白（4の倍数） */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;

  /* 文字 */
  --font-display: 'Mochiy Pop One', 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', sans-serif;
  --font-body: 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif;

  /* 動き */
  --duration-press: 80ms;
  --duration-popup: 160ms;
  --duration-stamp: 280ms;
  --ease-stamp: cubic-bezier(0.2, 1.4, 0.4, 1);
}
```

フォントは Google Fonts から読み込む。M PLUS Rounded 1c は 500・700・800・900、Mochiy Pop One は 400。

### 文字の大きさ

| 用途 | フォント | 大きさ / 行間 / 太さ |
| --- | --- | --- |
| 画面タイトル | display | 34px / 1.15 |
| 大見出し（ゴールなど） | display | 44〜64px / 1.1 |
| ポップアップの見出し | display | 22px / 1.3 |
| 小見出し | body | 20px / 1.4 / 900 |
| 本文 | body | 16px / 1.7 / 700 |
| 補足 | body | 14px / 1.6 / 700 |
| タブ・ボタン | body | 14〜16px / 1 / 900 |
| 最小（ラベル） | body | 12px / 1.4 / 800。これより小さくしない |

### 縁取り見出し

コーラルの大見出しは、インクで縁取りし、下に影を落とす。`paint-order` に対応しないブラウザがあるため、`text-shadow` の8方向と下方向で表現する。

```css
.outlined {
  font-family: var(--font-display);
  color: var(--color-coral);
  text-shadow:
    3px 0 0 var(--color-ink), -3px 0 0 var(--color-ink),
    0 3px 0 var(--color-ink), 0 -3px 0 var(--color-ink),
    2px 2px 0 var(--color-ink), -2px 2px 0 var(--color-ink),
    2px -2px 0 var(--color-ink), -2px -2px 0 var(--color-ink),
    0 5px 0 var(--color-ink);
}
```

## 3. コンポーネント

`web/src/components/ui/` に置く。スタイルは CSS Modules とトークンで書き、UIライブラリは使わない。アイコンは lucide-react（線幅 2.25、18〜28px）。絵文字は使わない。

| コンポーネント | 見た目と振る舞い |
| --- | --- |
| HeaderTabs | 3つのタブを横に等分した一体のバー。外枠 `--border`、`--shadow-sm`、角丸 button。タブの間はインクの3px の仕切り。選択中は背景 coral-strong・白文字、それ以外は surface・インク文字。各タブはアイコン（18px）と文字（14px / 900）、高さ48px以上。`<nav>` の中のリンクとして作り、選択中に `aria-current="page"` |
| Button（primary） | 背景 coral-strong、白文字、`--border`、`--shadow-md`、角丸 button、高さ52px以上。押すと `translate(5px, 5px)` で影が0になる |
| Button（secondary） | 背景 surface、インク文字。そのほかは primary と同じ |
| IconButton | 48×48px、surface、`--border-thin`、`--shadow-sm`。アイコンのみのときは `aria-label` 必須 |
| InfoTile | スタンプ帳の3つの案内ボタン。surface、`--border`、`--shadow-sm`、角丸 button、高さ84px。上にアイコン（24px）、下に文字（13px / 800、最大2行）。押すと沈み、ポップアップを開く |
| Popup | `<dialog>` を `showModal()` で開く。背景は `--color-backdrop`（ぼかさない）。本体は surface、`--border`、`--shadow-lg`、角丸 card、幅は画面から左右16px を引いた値（最大400px）、高さは最大で画面の80%、本文だけスクロール。上に見出しと閉じるの IconButton、下に Button（secondary）「とじる」。Esc と背景のタップでも閉じ、閉じたら開いたボタンにフォーカスを戻す。開くときは `scale(0.96) → 1` を `--duration-popup` で |
| Chip | 背景 yellow（または surface）、`--border-thin`、`--shadow-sm`、角丸 pill、12〜13px / 900 |
| Tag | 背景 coral-strong、白文字、`--border-thin`、少し傾ける（-4°）。「ここでやること」などの見出し札 |
| Card | 背景 surface、`--border`、`--shadow-lg`、角丸 card |
| BoardCard | Card の地面版。背景 board。スタンプ帳の輪を載せる |
| Band | 背景 pink、`--border`、`--shadow-md`、角丸 card。案内の帯 |
| NumberBadge | 30px の円、白文字、`--border-thin`。手順の番号。1と3は coral-strong、2は purple |
| SpotMarker | 未押印の枠。purple の円に白い番号（display 24px）。白の4px の内枠、インクの3px の外枠、`--shadow-sm`。タップでQR表示へ。押すと沈む |
| StampSlot | 押印済みの枠。surface の円に `--border`、中に StampImage を85%の大きさで。影なし、タップしない |
| StampImage | `/stamps/{spotId}.svg` を表示。無いときは仮画像（二重円＋星＋「SPOT 0n」、色は stamp）。傾きはスポットごとに固定（spot-01から順に -8°, 6°, -4°, 8°, -6°） |
| ProgressBadge | 64px の円、背景 purple、`--border`。「2/5」を白で。タップしないので影なし |
| GoalMedallion | 輪の中央。未完走は背景 ink に白文字（旗アイコン、「GOAL」、「5こで完走」）で、影なし・タップしない。完走後は背景 yellow にインク文字「COMPLETE」になり、`--shadow-md` がついてタップでゴールページへ |
| SponsorCard | 協賛企業1社分。surface、`--border`、`--shadow-sm`、角丸 card、内側12px。上にロゴ枠（背景は白、縦横比3:2、ロゴは縦横比を保って収める、最小の高さ64px）、下に企業名（14px / 800）と紹介文（13px、muted、最大3行）。リンクがあればカード全体を外部リンクにし、右上に外部リンクのアイコン、押すと沈む。リンクが無ければ影なし |
| Sparkle | 4点星のSVG。yellow・coral・purple のいずれか。装飾なので `aria-hidden` |
| SpeechBubble | coral-strong の吹き出し、白文字、`--border-thin`、しっぽ付き。QR表示の「ここ!」 |
| CropMarks | 押印欄の四隅のL字。インク、線幅5px、長さ28px |

共通の振る舞い:

- 押したとき（`:active`）は影のぶん沈み、影が消える。時間は `--duration-press`
- キーボード操作時は `:focus-visible` に `outline: 3px solid var(--color-purple); outline-offset: 3px`
- `prefers-reduced-motion: reduce` のときは、沈む動き、ポップアップの拡大、スタンプの登場の動きを止める

## 4. 画面

幅は 360〜430px を想定し、中央寄せで最大幅 430px。左右の余白は20px。上下はセーフエリアを空ける。背景は bg。

### 4-0. 共通ヘッダー

スタンプ帳・マップ・協賛企業・ゴールページで表示する。上端に固定（`position: sticky`）し、背景は bg。

1. 1段目: 左に Chip「HOMECOMING DAY 2026」、右に言語切り替えの IconButton（「EN」／「日本語」）
2. 2段目: HeaderTabs。文言は日本語「スタンプ帳」「マップ」「協賛企業」、英語「Stamps」「Map」「Sponsors」。アイコンは順に stamp、map、handshake
3. 内容がヘッダーの下に潜るほどスクロールしたら、ヘッダーの下端に `--border` を出す

ゴールページではスタンプ帳のタブを選択中として扱う。

### 4-1. 電子スタンプ帳（UI案Bのレイアウト）

共通ヘッダーの下に、上から順に:

1. **タイトル行。** 左に縁取り見出し「スタンプラリー」（英語は「STAMP RALLY」）、右に ProgressBadge
2. **BoardCard（輪）。** 正方形。幅は `min(100%, 340px)`、内側の余白16px
   - 道: SVGの円。中心は正方形の中心、半径は一辺の36%。インク30px の上に road 22px、その上に白2px の破線（6 8）
   - 枠: 5つ。大きさは一辺の25%。n番目（1〜5）の中心は角度 `-90° + 72° × (n-1)` の円周上。1番が真上、時計回り。未押印は SpotMarker、押印済みは StampSlot
   - 中央: GoalMedallion（一辺の30%）。ゴールページへの入口はここだけ
   - 飾り: 輪の外側の四隅寄りに木を3〜4本（tree の円、インクの1.5px 枠）
3. **補足。** 「紫の番号をタップすると、機械に押し当てるQRが出ます。どこから回ってもOK」（14px、中央揃え）
4. **案内ボタン。** InfoTile を3つ横に等分して並べる（間は12px）。左から:
   - 「遊び方」（アイコン circle-help）
   - 「景品交換所の案内」（アイコン gift）
   - 「スタンプが消えた方へ」（アイコン life-buoy）
   英語は「How to play」「Prizes」「Lost stamps?」

### 4-2. QR表示（全画面）

共通ヘッダーとタブは隠す。スマホを持つ手の指が画面の端に来るため、押し当てている最中に別の画面へ飛ばないようにする。

1. 上段中央に Chip「HOMECOMING DAY 2026」
2. **Band。** 左上に Tag「ここでやること」を少しはみ出させて置く。中に見出し「QRに機械を押し当てる」（display 26px、インク文字に白の縁取り）
3. **押印欄の Card。** 四隅に CropMarks。中央に直径210px の目印の円（purple の4px 破線、内側は purple-soft）。円の中央にQR。円の右上に SpeechBubble「ここ!」
   - QRは **75×75 CSSピクセル**、誤り訂正レベルM、周囲に白の余白12px（4モジュール分）。QRそのものは拡大・縮小しない
   - この画面にはスポット名を出さない。押印トークンは静的で、どの枠から開いても同じQRが出るため、スポットは押し当てた機械の側で決まる
4. **手順。** 3行のリスト。各行は NumberBadge と文言（16px）: 「1 画面の明るさを最大にする」「2 押し当てたまま少し待つ」「3 機械の画面に絵柄が出たら完了」
5. **Button（secondary）「スタンプ帳にもどる」** を最下部に。目印の円から96px以上離す

### 4-3. 説明のポップアップ

スタンプ帳の InfoTile から Popup で開く。文言は確定するまでサンプル（spec 4-6）で、翻訳ファイルに置く。以下は文案。

**遊び方**

- 見出し「遊び方」
- NumberBadge 付きの3手順: 「1 スタンプ帳の紫の番号をタップしてQRを出す」「2 スポットにあるスタンプ機を、QRに押し当てる」「3 機械の画面に絵柄が出たらスタンプGET」
- 補足: 「5つのスポットを、どの順番で回ってもかまいません。5つ集めるとゴールです」

**景品交換所の案内**

- 見出し「景品交換所の案内」
- ［景品交換所の名称］、［場所］、［受付時間］を、ラベル（12px、muted）と値（16px）の組で縦に並べる
- 補足: 「5つ集めたら、ゴールページをスタッフに見せてください」

**スタンプが消えた方へ**

- 見出し「スタンプが消えてしまった方へ」
- 本文: 「スタンプは、このスタンプラリーを開いたブラウザに保存されています。LINE などのアプリから開き直したり、別のブラウザで開いたりすると、最初からの表示になります。最初に開いたときと同じ方法で開き直してみてください」
- 補足: 「それでも戻らない場合は、スタッフに声をかけてください」

### 4-4. 押印演出（オーバーレイ）

SSEで押印を受けたら重ねて出す。**どのタブにいても出す**ため、押印の受信（SSEと10秒ポーリング）は各画面ではなくアプリの最上位で持つ。背景は bg を不透明で。

- 中央の Card に StampImage を大きく（160px）。登場は `scale(1.4) → scale(1)` と傾きの付与を `--duration-stamp` / `--ease-stamp` で
- 縁取り見出し「スタンプGET!」、スポット名、ProgressBadge
- Button（primary）「とじる」
- 5個目のときは、とじる代わりに Button（primary）「ゴールへ」でゴールページへ遷移する

### 4-5. ゴールページ

共通ヘッダーの下に:

1. **完走の印。** 220px の円、背景 yellow、`--border`、`--shadow-lg`、-6°傾ける。中に縁取り見出し「完走」（64px）、上に Chip「COMPLETE」を重ねる。周りに Sparkle を3つ
2. 見出し「おめでとう!」（display 28px、インク）と補足「5つのスポットをぜんぶ回りました」
3. **道の帯。** BoardCard を横長に。road の帯の上に StampSlot を5つと、最後に旗
4. **景品の Card。** 背景 ink、白文字、影は `8px 8px 0 var(--color-coral-strong)`。ギフトアイコンと「この画面をスタッフに見せてね」、区切り線、「景品交換所」（yellow、12px）と［景品交換所の名称・場所］
5. 最下部に Button（secondary）「スタンプ帳にもどる」

### 4-6. マップ

共通ヘッダーの下に、Google Maps を Card の枠と影の中に入れる（高さは画面の45%）。マーカーは SpotMarker と同じ見た目で、押印済みは StampSlot。その下にスポットの Card を縦に並べる。各 Card に番号、名前、案内文、押印済みなら Chip「GET!」。APIキーが無いときは一覧だけにする。

### 4-7. 協賛企業

共通ヘッダーの下に:

1. 見出し「協賛企業」（display 28px、インク）と補足「このスタンプラリーは、次の企業・団体のご協賛により開催しています」（14px、文案）
2. SponsorCard を2列のグリッドで並べる（間は12px）。並び順はデータの表示順どおり
3. データは web/ のデータファイル、ロゴは web/ のロゴ画像フォルダから読む（spec 4-6）。確定するまではサンプル（企業名に「（サンプル）」、ロゴ枠に「LOGO」）

ロゴの色を変えたり、切り抜いたり、縦横比を崩したりしない。協賛の区分（大口・一般など）やリンクの有無は未定（spec Q-39）なので、区分による見た目の差はつけず、リンクの有無だけで出し分ける。

### 4-8. 初回説明

全画面で出し、共通ヘッダーとタブは隠す。縁取り見出し、スタンプ機の写真（Card の枠に入れる。写真が届くまでは「写真（サンプル）」と書いた枠）、遊び方と同じ3手順（NumberBadge 付きの Card を縦に並べる）、注意書き「スタンプはこのブラウザに保存されます。別のアプリやブラウザで開くと最初からになります」、Button（primary）「はじめる」。「はじめる」でスタンプ帳へ。

### 4-9. スタッフ用ダッシュボード

共通ヘッダーは使わない。トークンは共通、装飾（Sparkle、縁取り見出し）は使わない。断になった機体と未送信キューがある機体は、画面上部の Band（背景 coral-strong、白文字）に固定表示する。サンプルデータで稼働中の警告も同じ Band で出す。

## 5. やらないこと

- グラデーション、ぼかした影、ポップアップの背景以外の半透明、絵文字、Inter・Roboto・Arial
- 画面下端に固定したナビゲーション
- 昨年のポスターにいた人物のイラスト
- QR表示へのスポット名の表示
- ダークモード（`color-scheme: light` で固定）

## 6. 確認できる形にする

- 開発時だけ表示される `/dev/gallery` に、3章の全コンポーネントを全状態（通常・押下・フォーカス・無効、未押印・押印済み、未完走・完走、リンクあり・なし）で並べる
- 次の画面を、日本語と英語の両方について 390×844 で撮影したスクリーンショットを `docs/screenshots/` に保存する（Playwright。APIはモックでよい）: スタンプ帳（押印0・2・5個）、QR表示、ポップアップ3種、押印演出、ゴールページ、マップ、協賛企業、初回説明
