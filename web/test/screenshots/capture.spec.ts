import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

type Language = "ja" | "en";

type MockSource = { emit: (event: unknown) => void };

const outputDirectory = fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));
mkdirSync(outputDirectory, { recursive: true });

const labels = {
  ja: { back: "スタンプ帳にもどる", book: "スタンプ帳", close: "とじる", how: "遊び方", map: "マップ", recovery: "スタンプが消えた方へ", about: "紹介" },
  en: { back: "Back to stamp book", book: "Stamps", close: "Close", how: "How to play", map: "Map", recovery: "Lost stamps?", about: "About" },
} as const;

// 仕様4-6: スクリーンショットは server/src/db/spot-data.ts の確定したスポット情報で撮る。
const spotContent = [
  { name_ja: "ホームカミングデイ総合案内", name_en: "Homecoming Day Information Desk", description_ja: "ホームカミングデイ会場では様々なイベントが行われています。限定ガクチョウガチャもここに設置されています。", description_en: "A variety of events are taking place across the Homecoming Day venue. The limited-edition \"Gakucho Gacha\" capsule toy machine is also located here." },
  { name_ja: "DS部店舗", name_en: "Data Science Club Booth", description_ja: "DS部の店舗は、和紙で淹れるコーヒー屋さんをやっています。", description_en: "The Data Science Club is running a coffee stand that brews coffee through washi (Japanese paper) filters." },
  { name_ja: "C棟入口", name_en: "Building C Entrance", description_ja: "C棟入口近くのステージでは様々なパフォーマンスが行われます。", description_en: "A variety of performances take place on the stage near the Building C entrance." },
  { name_ja: "保健管理センター入口", name_en: "Health Service Center Entrance", description_ja: "保健管理センター近くのステージでは様々なパフォーマンスが行われます。", description_en: "A variety of performances take place on the stage near the Health Service Center." },
  { name_ja: "50周年記念館", name_en: "50th Anniversary Hall", description_ja: "50周年記念館では、様々な式典が行われています。", description_en: "Various ceremonies are being held at the 50th Anniversary Hall." },
];

const spots = spotContent.map((content, index) => ({
  ...content,
  display_order: index + 1,
  id: `spot-${String(index + 1).padStart(2, "0")}`,
  is_sample: false,
  lat: 34.685 + (index + 1) / 10_000,
  lng: 133.92 + (index + 1) / 10_000,
  location_note_en: null,
  location_note_ja: null,
}));

async function mockedPage(context: BrowserContext, language: Language, stampCount: number): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(({ initialLanguage }) => {
    Object.defineProperty(navigator, "languages", { configurable: true, value: initialLanguage === "ja" ? ["ja-JP"] : ["en-US"] });
    localStorage.clear();
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
  }, { initialLanguage: language });
  const stamps = spots.slice(0, stampCount).map((spot, index) => ({ spot_id: spot.id, stamped_at: `2026-10-31T04:2${index}:05.000Z` }));
  await page.route("**/api/status", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ open: true, ended: false, opens_at: "2026-10-31T01:00:00.000Z", server_time: "2026-10-31T03:00:00.000Z" }) }));
  await page.route("**/api/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ completed: stampCount === 5, stamps, token: "stamp-token-for-screenshot", token_expires_at: "2026-10-31T07:00:00.000Z" }) }));
  await page.route("**/api/spots", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ spots }) }));
  await page.route("**/api/ack", (route) => route.fulfill({ status: 204 }));
  await page.goto("/");
  await expect(page.getByRole("link", { name: labels[language].book })).toBeVisible();
  return page;
}

// 仕様4-8: 一般開放前の状態だけを返す。/api/me などは用意せず、呼ばれないことを確かめる。
async function waitingPage(context: BrowserContext, language: Language): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript((initialLanguage) => {
    Object.defineProperty(navigator, "languages", { configurable: true, value: initialLanguage === "ja" ? ["ja-JP"] : ["en-US"] });
  }, language);
  await page.route("**/api/status", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ open: false, ended: false, opens_at: "2026-10-31T01:00:00.000Z", server_time: "2026-10-30T09:00:00.000Z" }) }));
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

async function emitStamp(page: Page, eventId: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __stampSources?: MockSource[] }).__stampSources?.length ?? 0)).toBeGreaterThan(0);
  await page.evaluate((id) => (window as typeof window & { __stampSources?: MockSource[] }).__stampSources?.[0]?.emit({ completed: false, event_id: id, spot_id: "spot-03", stamp_count: 3, stamped_at: "2026-10-31T04:25:05.000Z", total_spots: 5 }), eventId);
}

// デザイン4-4: 押印演出は約1.6秒で終わり、最後の状態のまま残る。
async function waitForStampMotion(overlay: Locator): Promise<void> {
  await expect.poll(() => overlay.evaluate((element) => element.getAnimations({ subtree: true }).every((animation) => animation.playState === "finished"))).toBe(true);
}

async function captureAll(context: BrowserContext, language: Language): Promise<void> {
  const label = labels[language];
  let page = await waitingPage(context, language);
  await page.goto("/");
  await expect(page.getByText(language === "ja" ? "10月31日（土）10:00" : "Sat, Oct 31, 10:00 (JST)")).toBeVisible();
  await capture(page, `${language}-waiting.png`);
  await page.close();

  page = await mockedPage(context, language, 0);
  await capture(page, `${language}-book-0.png`);
  await page.close();

  page = await mockedPage(context, language, 2);
  await capture(page, `${language}-book-2.png`);
  await page.close();

  page = await mockedPage(context, language, 5);
  await expect(page.getByText(language === "ja" ? "ガクチョウガチャコイン引換券GET!" : "Gakucho Gacha Coin Ticket GET!")).toBeVisible();
  await capture(page, `${language}-book-5.png`);
  await page.close();

  page = await mockedPage(context, language, 0);
  await page.getByRole("button", { name: new RegExp(language === "ja" ? "QRを表示" : "Show QR code") }).first().click();
  await expect(page.getByLabel("Stamp QR code")).toBeVisible();
  await waitForQrOpen(page);
  await capture(page, `${language}-qr.png`);
  await page.close();

  page = await mockedPage(context, language, 0);
  for (const [kind, buttonName] of [["how", label.how], ["recovery", label.recovery]] as const) {
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
  await page.getByRole("link", { name: label.about }).click();
  await expect(page.getByRole("heading", { name: language === "ja" ? "紹介" : "About" })).toBeVisible();
  await capture(page, `${language}-about.png`);
  await page.close();

  page = await mockedPage(context, language, 2);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __stampSources?: MockSource[] }).__stampSources?.length ?? 0)).toBeGreaterThan(0);
  await page.evaluate(() => (window as typeof window & { __stampSources?: MockSource[] }).__stampSources?.[0]?.emit({ completed: false, event_id: "event-for-screenshot", spot_id: "spot-03", stamp_count: 3, stamped_at: "2026-10-31T04:25:05.000Z", total_spots: 5 }));
  await expect(page.getByText(language === "ja" ? "スタンプGET!" : "STAMP GET!")).toBeVisible();
  await waitForStampMotion(page.getByRole("dialog"));
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
      const back = document.querySelector<HTMLButtonElement>('[aria-label="スタンプ帳にもどる"]')?.getBoundingClientRect();
      const ring = document.querySelector<SVGCircleElement>("[data-qr-stamp-circle] circle");
      return { back, circle, qr, qrCode, ring: ring ? { dash: ring.getAttribute("stroke-dasharray"), stroke: ring.getAttribute("stroke-width") } : undefined };
    });
    const path = await qr.locator("path").first().getAttribute("d");
    // 仕様4-2: QR本体は75×75 CSSピクセル（1マス3px）、白い余白は12px。
    expect(dimensions).toEqual({ height: 75, width: 75 });
    expect(geometry.qrCode?.width).toBe(99);
    expect(geometry.qrCode?.height).toBe(99);
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
    await expect(page.getByRole("link", { name: labels.ja.about })).toBeFocused();
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

// デザイン4-4: カードではなくスタンプ自体が落ちて着地し、円の線ときらきらが出る。全体は約1.6秒。
test("drops the stamp itself and bursts sparkles around it in about 1.6 seconds", async ({ context }) => {
  const page = await mockedPage(context, "ja", 2);
  await emitStamp(page, "event-for-motion");
  const overlay = page.getByRole("dialog", { name: "スタンプGET!" });
  await expect(overlay).toBeVisible();
  const motion = await overlay.evaluate((element) => {
    const animations = element.getAnimations({ subtree: true });
    const stamp = element.querySelector("img");
    return {
      end: Math.max(...animations.map((animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0))),
      stampDrops: animations.some((animation) => animation instanceof CSSAnimation && animation.animationName.includes("stamp-drop") && animation.effect instanceof KeyframeEffect && animation.effect.target?.contains(stamp) === true),
    };
  });
  expect(motion.stampDrops).toBe(true);
  expect(motion.end).toBeGreaterThan(1500);
  expect(motion.end).toBeLessThan(1700);
  const sparkles = overlay.locator("svg");
  await expect(sparkles).toHaveCount(3);
  await waitForStampMotion(overlay);
  for (const sparkle of await sparkles.all()) await expect(sparkle.locator("..")).toHaveCSS("opacity", "1");
  await expect(overlay.getByRole("heading", { name: "スタンプGET!" })).toHaveCSS("opacity", "1");
  await page.close();
});

test("lets participants close the stamp overlay before the motion ends", async ({ context }) => {
  const page = await mockedPage(context, "ja", 2);
  await emitStamp(page, "event-for-early-close");
  const overlay = page.getByRole("dialog", { name: "スタンプGET!" });
  await expect(overlay).toBeVisible();
  await overlay.getByRole("button", { name: labels.ja.close }).click();
  await expect(overlay).toBeHidden();
  await page.close();
});

// デザイン3・4-4: 動きを減らす設定では、最後の状態（きらきらあり）をすぐに出す。
test("shows the finished stamp overlay at once with reduced motion", async ({ context }) => {
  const page = await mockedPage(context, "en", 2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await emitStamp(page, "event-for-reduced-motion");
  const overlay = page.getByRole("dialog", { name: "STAMP GET!" });
  await expect(overlay).toBeVisible();
  expect(await overlay.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(overlay.getByRole("heading", { name: "STAMP GET!" })).toHaveCSS("opacity", "1");
  await expect(overlay.locator("svg")).toHaveCount(3);
  for (const sparkle of await overlay.locator("svg").all()) await expect(sparkle.locator("..")).toHaveCSS("opacity", "1");
  await page.close();
});

test("supports Escape and keeps the enlarged QR circle in view in every supported orientation", async ({ context }) => {
  for (const viewport of [{ width: 320, height: 844 }, { width: 360, height: 844 }, { width: 390, height: 844 }, { width: 430, height: 844 }, { width: 844, height: 320 }]) {
    const page = await mockedPage(context, "ja", 0);
    await page.setViewportSize(viewport);
    await page.locator("#card-slot-spot-05").click();
    await waitForQrOpen(page);
    // 拡大の途中ではなく、拡大し終えた円で測る。
    await expect.poll(() => page.locator("[data-qr-stamp-circle]").evaluate((element) => element.getAnimations().length)).toBe(0);
    const metrics = await page.evaluate(() => {
      const circle = document.querySelector<HTMLElement>("[data-qr-stamp-circle]")?.getBoundingClientRect();
      const qr = document.querySelector<SVGElement>('[aria-label="Stamp QR code"]')?.getBoundingClientRect();
      const back = document.querySelector<HTMLButtonElement>('[aria-label="スタンプ帳にもどる"]')?.getBoundingClientRect();
      const header = document.querySelector<HTMLElement>("[data-participant-header]")?.getBoundingClientRect();
      const qrCode = document.querySelector<HTMLElement>("[data-qr-code-container]")?.getBoundingClientRect();
      // 斜めの矢印は外接矩形が実際の線より広いため、線上の点で測る。点は線幅の半分だけ太らせて判定する。
      const guides = [...document.querySelectorAll<SVGPathElement>("[data-qr-guide] path")].map((path) => {
        const matrix = path.getScreenCTM() ?? undefined;
        const length = path.getTotalLength();
        const radius = Number.parseFloat(getComputedStyle(path).strokeWidth) / 2;
        return Array.from({ length: 41 }, (_, index) => path.getPointAtLength((length * index) / 40).matrixTransform(matrix)).map(({ x, y }) => ({ radius, x, y }));
      });
      window.scrollTo(100, 100);
      return { back, circle, guides, header, qr, qrCode, scrollX: window.scrollX, scrollY: window.scrollY, scrollWidth: document.documentElement.scrollWidth, viewportHeight: window.innerHeight, viewportWidth: window.innerWidth };
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
    // 仕様4-2: どの向き・画面サイズでもQR本体は75×75 CSSピクセルのまま。
    expect(metrics.qr?.width).toBe(75);
    expect(metrics.qr?.height).toBe(75);
    expect(metrics.back?.width).toBeGreaterThanOrEqual(48);
    expect(metrics.back?.height).toBeGreaterThanOrEqual(48);
    // デザイン4-2: QRの方向を示す矢印は8本で、QRの白い余白に入らない。
    const qrCode = metrics.qrCode;
    expect(metrics.guides).toHaveLength(8);
    expect(metrics.guides.flat().every(({ radius, x, y }) => qrCode !== undefined && (x + radius <= qrCode.left || x - radius >= qrCode.right || y + radius <= qrCode.top || y - radius >= qrCode.bottom))).toBe(true);
    await page.keyboard.press("Escape");
    await waitForBook(page);
    await page.close();
  }
});

test("shows only the waiting screen before opening without loading the stamp book", async ({ context }) => {
  const page = await waitingPage(context, "ja");
  const participantRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (["/api/me", "/api/events", "/api/spots"].includes(path)) participantRequests.push(path);
  });
  await page.goto("/");
  await expect(page.getByText("スタンプラリーは当日から参加できます", { exact: false })).toBeVisible();
  await expect(page.locator("[data-stamp-card]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "スタンプ帳" })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(participantRequests).toEqual([]);
  await page.close();
});
