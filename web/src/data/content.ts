export type Language = "ja" | "en";

export const content = {
  isSample: true,
  prizeExchange: {
    ja: "景品交換所（サンプル）",
    en: "Prize exchange desk (Sample)",
  },
  copy: {
    ja: {
      eventName: "岡山大学ホームカミングデー スタンプラリー",
      language: "English",
      start: "はじめる",
      howToPlay: "遊び方（サンプル）",
      steps: ["スタンプ帳を開く", "5か所のスタンプ機を探す", "QRを押し当ててスタンプを集める"],
      browserNotice: "スタンプはこのブラウザに保存されます。別のアプリやブラウザで開くと最初からになります",
      stampMachinePhoto: "スタンプ機（仮画像）",
      stampBook: "電子スタンプ帳",
      progress: "{count} / 5 個獲得",
      map: "スポット地図・一覧",
      mapUnavailable: "Google Mapsを表示できません。スポット一覧をご確認ください。",
      recovery: "スタンプが消えた方へ",
      showQr: "QRを表示",
      qrInstruction: "このQRを機械に押し当ててください",
      brightness: "画面の明るさを上げてください",
      close: "閉じる",
      earned: "スタンプ獲得！",
      earnedCount: "{count} 個集めました",
      goalTitle: "完走おめでとうございます！",
      goalMessage: "5つのスタンプを集めました。景品交換所でこの画面をスタッフに見せてください。",
      prize: "景品交換所",
      backToBook: "スタンプ帳へ戻る",
      spots: "スポット（サンプル）",
      stamped: "押印済み",
      notStamped: "未押印",
      recoveryTitle: "スタンプが消えた方へ",
      recoveryBody: "ブラウザのCookieやサイトデータが消えると、スタンプを復旧できません。お近くのスタッフへご相談ください。",
      back: "戻る",
    },
    en: {
      eventName: "Okayama University Homecoming Day Stamp Rally",
      language: "日本語",
      start: "Start",
      howToPlay: "How to play (Sample)",
      steps: ["Open your stamp book", "Find the five stamp stations", "Hold up your QR code to collect stamps"],
      browserNotice: "Your stamps are saved in this browser. If you open this in another app or browser, you will start over.",
      stampMachinePhoto: "Stamp station (placeholder)",
      stampBook: "Digital stamp book",
      progress: "{count} / 5 collected",
      map: "Spot map & list",
      mapUnavailable: "Google Maps is unavailable. The spot list is still available.",
      recovery: "Lost your stamps?",
      showQr: "Show QR code",
      qrInstruction: "Hold this QR code up to the stamp station.",
      brightness: "Please turn up your screen brightness.",
      close: "Close",
      earned: "Stamp collected!",
      earnedCount: "You have collected {count} stamps",
      goalTitle: "Congratulations!",
      goalMessage: "You collected all five stamps. Show this screen to a staff member at the prize exchange desk.",
      prize: "Prize exchange",
      backToBook: "Back to stamp book",
      spots: "Spots (Sample)",
      stamped: "Collected",
      notStamped: "Not collected",
      recoveryTitle: "Lost your stamps?",
      recoveryBody: "Stamps cannot be restored if your browser cookies or site data were deleted. Please ask a nearby staff member for help.",
      back: "Back",
    },
  },
} as const;

export type Copy = {
  eventName: string;
  language: string;
  start: string;
  howToPlay: string;
  steps: readonly string[];
  browserNotice: string;
  stampMachinePhoto: string;
  stampBook: string;
  progress: string;
  map: string;
  mapUnavailable: string;
  recovery: string;
  showQr: string;
  qrInstruction: string;
  brightness: string;
  close: string;
  earned: string;
  earnedCount: string;
  goalTitle: string;
  goalMessage: string;
  prize: string;
  backToBook: string;
  spots: string;
  stamped: string;
  notStamped: string;
  recoveryTitle: string;
  recoveryBody: string;
  back: string;
};

export function detectInitialLanguage(languages: readonly string[] = navigator.languages): Language {
  return languages.some((language) => language.toLowerCase().startsWith("ja")) ? "ja" : "en";
}

export function translate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}
