import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Language = "ja" | "en";

type MockSource = { emit: (event: unknown) => void };

const outputDirectory = fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));
mkdirSync(outputDirectory, { recursive: true });

const labels = {
  ja: { back: "スタンプ台紙にもどる", book: "スタンプ帳", close: "とじる", goal: "ゴールページを開く", how: "遊び方", map: "マップ", prizes: "景品交換所の案内", recovery: "スタンプが消えた方へ", sponsors: "協賛企業" },
  en: { back: "Back to stamp card", book: "Stamps", close: "Close", goal: "Open goal page", how: "How to play", map: "Map", prizes: "Prizes", recovery: "Lost stamps?", sponsors: "Sponsors" },
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

async function waitForQrOpen(page: Page): Promise<void> {
  await expect(page.locator('[data-qr-phase="open"]')).toBeVisible();
  await page.waitForTimeout(180);
}

async function waitForBook(page: Page): Promise<void> {
  await expect(page.locator("[data-stamp-card]")).toBeVisible();
  await expect(page.locator("[data-qr-phase]")).toHaveCount(0);
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
  await waitForQrOpen(page);
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

test("keeps the stamp card inside every supported narrow viewport", async ({ context }) => {
  for (const language of ["ja", "en"] as const) {
    for (const width of [320, 360, 390, 430]) {
      const page = await mockedPage(context, language, 2);
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator("[data-stamp-card]")).toBeVisible();
      const metrics = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>("[data-stamp-card]")?.getBoundingClientRect();
        const slots = [...document.querySelectorAll<HTMLElement>("[data-card-stamp-circle]")].map((slot) => {
          const bounds = slot.getBoundingClientRect();
          return { bottom: bounds.bottom, height: bounds.height, left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width };
        });
        return {
          card: card ? { left: card.left, right: card.right } : undefined,
          scrollWidth: document.documentElement.scrollWidth,
          slots,
          viewportWidth: window.innerWidth,
        };
      });
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.card?.left).toBeGreaterThanOrEqual(12);
      expect((metrics.card?.right ?? width) + 8).toBeLessThanOrEqual(width - 12);
      expect(metrics.slots).toHaveLength(5);
      expect(Math.min(...metrics.slots.map((slot) => slot.width))).toBeGreaterThanOrEqual(72);
      expect(Math.max(...metrics.slots.map((slot) => slot.width)) - Math.min(...metrics.slots.map((slot) => slot.width))).toBeLessThanOrEqual(1);
      expect(metrics.slots.slice(0, 3).every((slot, index, row) => index === 0 || row[index - 1]!.right <= slot.left)).toBe(true);
      expect(metrics.slots.slice(3).every((slot, index, row) => index === 0 || row[index - 1]!.right <= slot.left)).toBe(true);
      expect(Math.max(...metrics.slots.slice(0, 3).map((slot) => slot.bottom))).toBeLessThanOrEqual(Math.min(...metrics.slots.slice(3).map((slot) => slot.top)));
      await page.close();
    }
  }
});

test("uses one QR from every empty slot and restores focus after closing", async ({ context }) => {
  const page = await mockedPage(context, "ja", 0);
  let qrPath: string | null | undefined;
  for (const spot of spots) {
    await page.locator(`#card-slot-${spot.id}`).click();
    await waitForQrOpen(page);
    const qr = page.getByLabel("Stamp QR code");
    const dimensions = await qr.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { height: bounds.height, width: bounds.width };
    });
    const geometry = await page.evaluate(() => {
      const circle = document.querySelector<HTMLElement>("[data-qr-stamp-circle]")?.getBoundingClientRect();
      const qrCode = document.querySelector<HTMLElement>("[data-qr-code-container]")?.getBoundingClientRect();
      const qr = document.querySelector<SVGElement>('[aria-label="Stamp QR code"]')?.getBoundingClientRect();
      const back = document.querySelector<HTMLButtonElement>('[aria-label="スタンプ台紙にもどる"]')?.getBoundingClientRect();
      const ring = document.querySelector<SVGCircleElement>("[data-qr-stamp-circle] circle");
      return { back, circle, qr, qrCode, ring: ring ? { dash: ring.getAttribute("stroke-dasharray"), stroke: ring.getAttribute("stroke-width") } : undefined };
    });
    const path = await qr.locator("path").first().getAttribute("d");
    expect(dimensions).toEqual({ height: 64, width: 64 });
    expect(geometry.qrCode?.width).toBe(88);
    expect(geometry.qrCode?.height).toBe(88);
    expect(Math.abs(((geometry.qr?.left ?? 0) + (geometry.qr?.width ?? 0) / 2) - ((geometry.circle?.left ?? 0) + (geometry.circle?.width ?? 0) / 2))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(((geometry.qr?.top ?? 0) + (geometry.qr?.height ?? 0) / 2) - ((geometry.circle?.top ?? 0) + (geometry.circle?.height ?? 0) / 2))).toBeLessThanOrEqual(0.5);
    expect(geometry.ring).toEqual({ dash: "3 5", stroke: "2.5" });
    const backDistance = Math.hypot(
      ((geometry.back?.left ?? 0) + (geometry.back?.width ?? 0) / 2) - ((geometry.qrCode?.left ?? 0) + (geometry.qrCode?.width ?? 0) / 2),
      ((geometry.back?.top ?? 0) + (geometry.back?.height ?? 0) / 2) - ((geometry.qrCode?.top ?? 0) + (geometry.qrCode?.height ?? 0) / 2),
    );
    expect(backDistance).toBeGreaterThanOrEqual(96);
    expect(path).toBe(qrPath ?? path);
    qrPath = path;
    await expect(page.locator('[data-qr-background="open"]')).toHaveCSS("opacity", "0");
    await expect(page.locator("[data-qr-paper]")).toHaveCSS("opacity", "1");
    await expect(page.getByRole("link", { name: labels.ja.map })).toBeVisible();
    await expect(page.locator('[data-qr-phase="open"]')).not.toContainText(spot.name_ja);
    await expect(page.locator('[data-qr-phase="open"]')).not.toContainText(String(spot.display_order));
    await expect(page.locator("[data-qr-active]")).toHaveAttribute("inert", "");
    await expect(page.getByRole("button", { name: labels.ja.back })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("link", { name: labels.ja.sponsors })).toBeFocused();
    await page.getByRole("button", { name: labels.ja.back }).click();
    await waitForBook(page);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(`card-slot-${spot.id}`);
  }

  await page.locator("#card-slot-spot-01").click();
  await waitForQrOpen(page);
  await page.goBack();
  await waitForBook(page);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("card-slot-spot-01");
  await page.close();
});

test("keeps the header controls usable while QR is shown", async ({ context }) => {
  const page = await mockedPage(context, "ja", 0);
  await page.locator("#card-slot-spot-01").click();
  await waitForQrOpen(page);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("link", { name: labels.en.map })).toBeVisible();
  await page.getByRole("link", { name: labels.en.map }).click();
  await expect(page.getByRole("heading", { name: "Map" })).toBeVisible();
  await expect(page.locator("[data-qr-phase]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: labels.en.map })).toHaveAttribute("aria-current", "page");
  await page.close();
});

test("moves focus to the book heading when the QR origin is stamped", async ({ context }) => {
  const page = await mockedPage(context, "ja", 0);
  await page.locator("#card-slot-spot-01").click();
  await waitForQrOpen(page);
  await page.evaluate(() => (window as typeof window & { __stampSources?: MockSource[] }).__stampSources?.[0]?.emit({ completed: false, event_id: "event-for-focus", spot_id: "spot-01", stamp_count: 1, stamped_at: "2026-10-31T04:25:05.000Z", total_spots: 5 }));
  await waitForBook(page);
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-stamp-card-heading"))).toBe("true");
  await page.close();
});

test("uses the spot reported by the stamp event instead of the QR origin", async ({ context }) => {
  const page = await mockedPage(context, "ja", 0);
  let includeReportedSpot = false;
  await page.unroute("**/api/me");
  await page.route("**/api/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ completed: false, stamps: includeReportedSpot ? [{ spot_id: "spot-03", stamped_at: "2026-10-31T04:25:05.000Z" }] : [], token: "stamp-token-for-screenshot", token_expires_at: "2026-10-31T07:00:00.000Z" }) }));
  await page.locator("#card-slot-spot-01").click();
  await waitForQrOpen(page);
  includeReportedSpot = true;
  await page.evaluate(() => (window as typeof window & { __stampSources?: MockSource[] }).__stampSources?.[0]?.emit({ completed: false, event_id: "event-for-other-spot", spot_id: "spot-03", stamp_count: 1, stamped_at: "2026-10-31T04:25:05.000Z", total_spots: 5 }));
  await waitForBook(page);
  await expect(page.locator("#card-slot-spot-03")).toHaveAttribute("data-stamped", "true");
  await expect(page.locator("#card-slot-spot-01")).toHaveAttribute("data-stamped", "false");
  await page.close();
});

test("returns to the normal stamp card after reloading the QR state", async ({ context }) => {
  const page = await mockedPage(context, "ja", 0);
  await page.locator("#card-slot-spot-01").click();
  await waitForQrOpen(page);
  await page.reload();
  await expect(page.locator("[data-stamp-card]")).toBeVisible();
  await expect(page.locator("[data-qr-phase]")).toHaveCount(0);
  await page.close();
});

test("keeps QR operation available with reduced motion", async ({ context }) => {
  const page = await mockedPage(context, "en", 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#card-slot-spot-01").click();
  await expect(page.getByLabel("Stamp QR code")).toBeVisible();
  await expect(page.locator('[data-qr-phase="open"]')).toBeVisible();
  await page.getByRole("button", { name: labels.en.back }).click();
  await waitForBook(page);
  await page.close();
});

test("supports Escape and keeps the enlarged QR circle in view in every supported orientation", async ({ context }) => {
  for (const viewport of [{ width: 320, height: 844 }, { width: 360, height: 844 }, { width: 390, height: 844 }, { width: 430, height: 844 }, { width: 844, height: 320 }]) {
    const page = await mockedPage(context, "ja", 0);
    await page.setViewportSize(viewport);
    await page.locator("#card-slot-spot-05").click();
    await waitForQrOpen(page);
    const metrics = await page.evaluate(() => {
      const circle = document.querySelector<HTMLElement>("[data-qr-stamp-circle]")?.getBoundingClientRect();
      const qr = document.querySelector<SVGElement>('[aria-label="Stamp QR code"]')?.getBoundingClientRect();
      const back = document.querySelector<HTMLButtonElement>('[aria-label="スタンプ台紙にもどる"]')?.getBoundingClientRect();
      const header = document.querySelector<HTMLElement>("[data-participant-header]")?.getBoundingClientRect();
      window.scrollTo(100, 100);
      return { back, circle, header, qr, scrollX: window.scrollX, scrollY: window.scrollY, scrollWidth: document.documentElement.scrollWidth, viewportHeight: window.innerHeight, viewportWidth: window.innerWidth };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.scrollX).toBe(0);
    expect(metrics.scrollY).toBe(0);
    expect(metrics.circle?.left).toBeGreaterThanOrEqual(16);
    expect(metrics.circle?.right).toBeLessThanOrEqual(metrics.viewportWidth - 16);
    expect(metrics.circle?.top).toBeGreaterThanOrEqual(0);
    expect(metrics.circle?.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.circle?.top).toBeGreaterThanOrEqual(metrics.header?.bottom ?? 0);
    expect(metrics.back?.top).toBeGreaterThanOrEqual((metrics.header?.bottom ?? 0) + 8);
    expect(metrics.qr?.width).toBe(64);
    expect(metrics.qr?.height).toBe(64);
    expect(metrics.back?.width).toBeGreaterThanOrEqual(48);
    expect(metrics.back?.height).toBeGreaterThanOrEqual(48);
    await page.keyboard.press("Escape");
    await waitForBook(page);
    await page.close();
  }
});
