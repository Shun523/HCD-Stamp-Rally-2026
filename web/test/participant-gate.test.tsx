import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusResponse } from "@hcd-stamp-rally/shared";
import { ParticipantGate } from "../src/components/ParticipantGate.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const opensAt = "2026-10-31T01:00:00.000Z";
const waiting: StatusResponse = { open: false, opens_at: opensAt, server_time: "2026-10-31T00:55:00.000Z" };
const opened: StatusResponse = { open: true, opens_at: opensAt, server_time: "2026-10-31T01:00:05.000Z" };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["ja-JP"] });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function renderGate(getStatus: () => Promise<StatusResponse>) {
  const reload = vi.fn();
  await act(async () => root.render(<ParticipantGate getStatus={getStatus} reload={reload}><p>stamp book</p></ParticipantGate>));
  return reload;
}

describe("ParticipantGate (仕様4-8)", () => {
  it("shows the participant app when the event is already open", async () => {
    const reload = await renderGate(vi.fn<() => Promise<StatusResponse>>().mockResolvedValue(opened));
    expect(container.textContent).toContain("stamp book");
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows only the waiting screen before opening", async () => {
    await renderGate(vi.fn<() => Promise<StatusResponse>>().mockResolvedValue(waiting));
    expect(container.textContent).toContain("10月31日（土）10:00");
    expect(container.textContent).toContain("当日から参加できます");
    expect(container.textContent).not.toContain("stamp book");
  });

  it("waits by the server-time difference and reloads once open", async () => {
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const getStatus = vi.fn<() => Promise<StatusResponse>>().mockResolvedValueOnce(waiting).mockResolvedValue(opened);
    const reload = await renderGate(getStatus);
    await act(async () => { await vi.advanceTimersByTimeAsync(299_999); });
    expect(getStatus).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("checks again when the page becomes visible", async () => {
    const getStatus = vi.fn<() => Promise<StatusResponse>>().mockResolvedValueOnce(waiting).mockResolvedValue(opened);
    const reload = await renderGate(getStatus);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows a connection error and retries when the page becomes visible", async () => {
    const getStatus = vi.fn<() => Promise<StatusResponse>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(waiting);
    await renderGate(getStatus);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("確認できませんでした");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(container.textContent).toContain("10月31日（土）10:00");
  });

  it("switches the waiting screen to English", async () => {
    await renderGate(vi.fn<() => Promise<StatusResponse>>().mockResolvedValue(waiting));
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="English"]')!.click(); });
    expect(container.textContent).toContain("Sat, Oct 31, 10:00 (JST)");
    expect(document.documentElement.lang).toBe("en");
  });
});
