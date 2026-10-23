import type { spots } from "./schema.js";

// 仕様4-6: スポット情報（5件）。差し替えはこのファイルの書き換えと db:seed の実行だけで済む。
// id は機体の設定とスタンプ画像のファイル名に結び付くため変えない。
// 座標は2026-10-21に利用者から受け取った設置予定地点。
// 確定した内容を入れたスポットは isSample を false にする（サンプルが残ると /admin に警告が出る）。
// 全項目を必須にするため、行の型（$inferSelect）で書く。補足が無いときは null にする。
export const spotData: (typeof spots.$inferSelect)[] = [
  {
    id: "spot-01",
    nameJa: "ホームカミングデイ総合案内",
    nameEn: "Homecoming Day Information Desk",
    displayOrder: 1,
    lat: 34.6865463,
    lng: 133.9217822,
    descriptionJa: "ホームカミングデイ会場では様々なイベントが行われています。限定ガクチョウガチャもここに設置されています。",
    descriptionEn: "A variety of events are taking place across the Homecoming Day venue. The limited-edition \"Gakucho Gacha\" capsule toy machine is also located here.",
    locationNoteJa: null,
    locationNoteEn: null,
    isSample: false,
  },
  {
    id: "spot-02",
    nameJa: "DS部店舗",
    nameEn: "Data Science Club Booth",
    displayOrder: 2,
    lat: 34.6859605,
    lng: 133.9216712,
    descriptionJa: "DS部の店舗は、和紙で淹れるコーヒー屋さんをやっています。",
    descriptionEn: "The Data Science Club is running a coffee stand that brews coffee through washi (Japanese paper) filters.",
    locationNoteJa: null,
    locationNoteEn: null,
    isSample: false,
  },
  {
    id: "spot-03",
    nameJa: "C棟入口",
    nameEn: "Building C Entrance",
    displayOrder: 3,
    lat: 34.6867095,
    lng: 133.9188354,
    descriptionJa: "C棟入口近くのステージでは様々なパフォーマンスが行われます。",
    descriptionEn: "A variety of performances take place on the stage near the Building C entrance.",
    locationNoteJa: null,
    locationNoteEn: null,
    isSample: false,
  },
  {
    id: "spot-04",
    nameJa: "保健管理センター入口",
    nameEn: "Health Service Center Entrance",
    displayOrder: 4,
    lat: 34.6872645,
    lng: 133.9208125,
    descriptionJa: "保健管理センター近くのステージでは様々なパフォーマンスが行われます。",
    descriptionEn: "A variety of performances take place on the stage near the Health Service Center.",
    locationNoteJa: null,
    locationNoteEn: null,
    isSample: false,
  },
  {
    id: "spot-05",
    nameJa: "50周年記念館",
    nameEn: "50th Anniversary Hall",
    displayOrder: 5,
    lat: 34.6870875,
    lng: 133.9188562,
    descriptionJa: "50周年記念館では、様々な式典が行われています。",
    descriptionEn: "Various ceremonies are being held at the 50th Anniversary Hall.",
    locationNoteJa: null,
    locationNoteEn: null,
    isSample: false,
  },
];
