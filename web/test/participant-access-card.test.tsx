import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParticipantAccessCard } from "../src/components/ParticipantAccessCard.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const beforeOpening = { opens_at: "2026-10-31T01:00:00.000Z", server_time: "2026-10-30T09:00:00.000Z" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const unlockLabel = "この端末で開始前の参加者画面を使う";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const unlockButton = () => [...container.querySelectorAll("button")].find((button) => button.textContent === unlockLabel);

describe("ParticipantAccessCard (仕様7章・4-8)", () => {
  it("shows the opening time and unlocks this device before opening", async () => {
    let unlocked = false;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/api/admin/preview")) {
        unlocked = true;
        return json({ ok: true });
      }
      return json({ ...beforeOpening, open: unlocked });
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<ParticipantAccessCard onUnauthorized={vi.fn()} password="staff-password" />));
    expect(container.textContent).toContain("10月31日（土）10:00");
    expect(container.textContent).toContain("開始前");
    await act(async () => { unlockButton()!.click(); });
    const previewCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/admin/preview"));
    expect(previewCall?.[1]).toMatchObject({ method: "POST", headers: { "x-admin-password": "staff-password" } });
    expect(container.textContent).toContain("この端末は開始前の参加者画面を使えます");
    expect(container.querySelector<HTMLAnchorElement>('a[href="/"]')?.textContent).toBe("参加者画面を開く");
    expect(unlockButton()).toBeUndefined();
  });

  it("shows the public state without the unlock button after opening", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => json({ open: true, opens_at: "2026-10-31T01:00:00.000Z", server_time: "2026-10-31T01:00:00.000Z" })));
    await act(async () => root.render(<ParticipantAccessCard onUnauthorized={vi.fn()} password="staff-password" />));
    expect(container.textContent).toContain("公開中");
    expect(container.querySelector("button")).toBeNull();
  });

  it("asks for the password again when unlocking is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => String(input).endsWith("/api/admin/preview")
      ? json({ error: "unauthorized" }, 401)
      : json({ ...beforeOpening, open: false })));
    const onUnauthorized = vi.fn();
    await act(async () => root.render(<ParticipantAccessCard onUnauthorized={onUnauthorized} password="staff-password" />));
    await act(async () => { unlockButton()!.click(); });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
