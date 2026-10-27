export type AboutItem = {
  descriptionEn: string;
  descriptionJa: string;
  displayOrder: number;
  nameEn: string;
  nameJa: string;
  photoPath: string;
  url?: string;
};

// 仕様4-6: 紹介はデータファイルと写真だけで差し替えられる。写真は各サイトのトップ画面（10月27日撮影）。
export const aboutItems: AboutItem[] = [
  { displayOrder: 1, nameJa: "ホームカミングデイ公式サイト", nameEn: "Homecoming Day Website", descriptionJa: "出店ブース・イベント内容をご覧いただけます。", descriptionEn: "See the booths and events of Homecoming Day.", photoPath: "/images/about/about-01.jpg", url: "https://alumni.soumukikakusoumu.okayama-u.ac.jp/hcd/" },
  { displayOrder: 2, nameJa: "学祭公式サイト", nameEn: "Campus Festival Website", descriptionJa: "学祭の企画や出店の情報がまとめられています。", descriptionEn: "Find the events and stalls of the campus festival.", photoPath: "/images/about/about-02.jpg", url: "https://tengyuanyoushen277.wixsite.com/okayama-university-f" },
  { displayOrder: 3, nameJa: "DS部紹介", nameEn: "About DS Club", descriptionJa: "ホームカミングデイの運営に携わっているサークルです。", descriptionEn: "A student club that helps run Homecoming Day.", photoPath: "/images/about/about-03.jpg", url: "https://okadai-dsc.studio.site/" },
];
