export type Sponsor = {
  descriptionEn?: string;
  descriptionJa?: string;
  displayOrder: number;
  logoPath: string;
  nameEn: string;
  nameJa: string;
  url?: string;
};

// 仕様4-6: 確定データが届くまで、協賛企業はデータファイルだけで差し替えられるサンプルを使う。
export const sponsors: Sponsor[] = [
  { displayOrder: 1, nameJa: "岡山サンプル商会（サンプル）", nameEn: "Okayama Sample Co. (Sample)", descriptionJa: "地域の学びと交流を応援しています。", descriptionEn: "Supporting learning and connection in the community.", logoPath: "/images/sponsors/sponsor-01.svg", url: "https://www.okayama-u.ac.jp/" },
  { displayOrder: 2, nameJa: "桃太郎テクノロジー（サンプル）", nameEn: "Momotaro Technology (Sample)", descriptionJa: "未来のキャンパスを支える企業です。", descriptionEn: "A company supporting the campus of tomorrow.", logoPath: "/images/sponsors/sponsor-02.svg" },
  { displayOrder: 3, nameJa: "岡山まちづくり会（サンプル）", nameEn: "Okayama Community Group (Sample)", descriptionJa: "人が集まる場づくりに取り組んでいます。", descriptionEn: "Creating welcoming places for people to gather.", logoPath: "/images/sponsors/sponsor-03.svg" },
  { displayOrder: 4, nameJa: "キャンパスパートナーズ（サンプル）", nameEn: "Campus Partners (Sample)", descriptionJa: "ホームカミングデイを応援しています。", descriptionEn: "Proud supporters of Homecoming Day.", logoPath: "/images/sponsors/sponsor-04.svg" },
];
