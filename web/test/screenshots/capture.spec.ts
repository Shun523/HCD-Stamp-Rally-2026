import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Language = "ja" | "en";

type MockSource = { emit: (event: unknown) => void };

const outputDirectory = fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));
mkdirSync(outputDirectory, { recursive: true });

const labels = {
  ja: { book: "スタンプ帳", close: "とじる", goal: "ゴールページを開く", how: "遊び方", map: "マップ", prizes: "景品交換所の案内", recovery: "スタンプが消えた方へ", sponsors: "協賛企業" },
  en: { book: "Stamps", close: "Close", goal: "Open goal page", how: "How to play", map: "Map", prizes: "Prizes", recovery: "Lost stamps?", sponsors: "Sponsors" },
} as const;

const spots = [1, 2, 3, 4, 5].map((number) => ({
  description_en: `Sample guidance for spot ${number}.`,
  description_ja: `スポット${number}の案内文です（サンプル）。`,
  display_order: number,
  id: `spot-${String(number).padStart(2, "0")}`,
  is_sample: true,
  lat: 34.685 + number / 10_000,
  lng: 133.92 + number / 10_000,
  location_note_en: null,
  location_note_ja: null,
  name_en: `Spot ${number} (Sample)`,
  name_ja: `スポット${number}（サンプル）`,
}));

async function mockedPage(context: BrowserContext, language: Language, stampCount: number, introductionSeen = true): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(({ initialLanguage, seen }) => {
    Object.defineProperty(navigator, "languages", { configurable: true, value: initialLanguage === "ja" ? ["ja-JP"] : ["en-US"] });
    localStorage.clear();
    if (seen) localStorage.setItem("hcd-stamp-rally-introduction-seen", "true");
    const sources: MockSource[] = [];
    class MockEventSource {
      public onerror: ((event: Event) => void) | null = null;
      public onopen: ((event: Event) => void) | null = null;
      private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
      public constructor() { sources.push(this); }
      public addEventListener(type: string, listener: (event: MessageEvent<string>) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
      public close() { return undefined; }
      public emit(event: unknown) { this.listeners.get("stamped")?.forEach((listener) => listener(new MessageEvent("stamped", { data: JSON.stringify(event) }))); }
    }
    Object.defineProperty(window, "EventSource", { configurable: true, value: MockEventSource });
    Object.assign(window, { __stampSources: sources });
  }, { initialLanguage: language, seen: introductionSeen });
  const stamps = spots.slice(0, stampCount).map((spot, index) => ({ spot_id: spot.id, stamped_at: `2026-10-31T04:2${index}:05.000Z` }));
  await page.route("**/api/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ completed: stampCount === 5, stamps, token: "stamp-token-for-screenshot", token_expires_at: "2026-10-31T07:00:00.000Z" }) }));
  await page.route("**/api/spots", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ spots }) }));
  await page.route("**/api/ack", (route) => route.fulfill({ status: 204 }));
  await page.goto("/");
  if (introductionSeen) await expect(page.getByRole("link", { name: labels[language].book })).toBeVisible();
  return page;
}

async function capture(page: Page, filename: string): Promise<void> {
  await page.screenshot({ path: join(outputDirectory, filename) });
}

async function captureAll(context: BrowserContext, language: Language): Promise<void> {
  const label = labels[language];
  let page = await mockedPage(context, language, 0, false);
  await expect(page.getByRole("button", { name: language === "ja" ? "はじめる" : "Start" })).toBeVisible();
  await capture(page, `${language}-intro.png`);
  await page.close();

  page = await mockedPage(context, language, 0);
  await capture(page, `${language}-book-0.png`);
  await page.close();

  page = await mockedPage(context, language, 2);
  await capture(page, `${language}-book-2.png`);
  await page.close();

  page = await mockedPage(context, language, 5);
  await capture(page, `${language}-book-5.png`);
  await page.getByRole("button", { name: label.goal }).click();
  await expect(page.getByRole("heading", { name: language === "ja" ? "おめでとう!" : "Congratulations!" })).toBeVisible();
  await capture(page, `${language}-goal.png`);
  await page.close();

  page = await mockedPage(context, language, 0);
  await page.getByRole("button", { name: new RegExp(language === "ja" ? "QRを表示" : "Show QR code") }).first().click();
  await expect(page.getByLabel("Stamp QR code")).toBeVisible();
  await capture(page, `${language}-qr.png`);
  await page.close();

  page = await mockedPage(context, language, 0);
  for (const [kind, buttonName] of [["how", label.how], ["prizes", label.prizes], ["recovery", label.recovery]] as const) {
    await page.getByRole("button", { name: buttonName }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture(page, `${language}-popup-${kind}.png`);
    await page.getByRole("button", { name: label.close }).last().click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  await page.close();

  page = await mockedPage(context, language, 2);
  await page.getByRole("link", { name: label.map }).click();
  await expect(page.getByRole("heading", { name: language === "ja" ? "マップ" : "Map" })).toBeVisible();
  await capture(page, `${language}-map.png`);
  await page.getByRole("link", { name: label.sponsors }).click();
  await expect(page.getByRole("heading", { name: language === "ja" ? "協賛企業" : "Sponsors" })).toBeVisible();
  await capture(page, `${language}-sponsors.png`);
  await page.close();

  page = await mockedPage(context, language, 2);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __stampSources?: MockSource[] }).__stampSources?.length ?? 0)).toBeGreaterThan(0);
  await page.evaluate(() => (window as typeof window & { __stampSources?: MockSource[] }).__stampSources?.[0]?.emit({ completed: false, event_id: "event-for-screenshot", spot_id: "spot-03", stamp_count: 3, stamped_at: "2026-10-31T04:25:05.000Z", total_spots: 5 }));
  await expect(page.getByText(language === "ja" ? "スタンプGET!" : "STAMP GET!")).toBeVisible();
  await capture(page, `${language}-stamp-animation.png`);
  await page.close();
}

test("captures every participant screen in Japanese at 390×844", async ({ context }) => { await captureAll(context, "ja"); });
test("captures every participant screen in English at 390×844", async ({ context }) => { await captureAll(context, "en"); });
