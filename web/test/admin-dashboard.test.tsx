import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceStatus } from "@hcd-stamp-rally/shared";
import { AdminDashboard, sortDevicesForOperations } from "../src/components/AdminDashboard.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const normalDevice: DeviceStatus = {
  id: "dev-normal",
  spot_id: "spot-01",
  last_heartbeat_at: "2026-10-31T03:00:00.000Z",
  status: "正常",
  last_stamp_count: 4,
  pending_queue_count: 0,
  battery_level: 88,
  ack_timeout_count: 0,
  last_ack_timeout_at: null,
};

const warningDevice: DeviceStatus = {
  ...normalDevice,
  id: "dev-warning",
  spot_id: "spot-02",
  status: "警告",
  pending_queue_count: 2,
  ack_timeout_count: 1,
  last_ack_timeout_at: "2026-10-31T03:01:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

function enterPassword(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("AdminDashboard", () => {
  it("puts warning and queued devices before healthy devices", () => {
    expect(sortDevicesForOperations([normalDevice, warningDevice]).map((device) => device.id))
      .toEqual(["dev-warning", "dev-normal"]);
  });

  it("authenticates before showing operational status and ACK timeouts", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/api/admin/devices")) {
        return new Response(JSON.stringify({ devices: [normalDevice, warningDevice] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        participant_count: 10,
        stamp_count_by_spot: [{ spot_id: "spot-01", count: 7 }],
        completed_count: 6,
        sample_spots_active: true,
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => root.render(<AdminDashboard />));
    const input = container.querySelector<HTMLInputElement>("#admin-password");
    expect(input).not.toBeNull();
    await act(async () => {
      enterPassword(input!, "staff-password");
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("要対応のスタンプ機");
    expect(container.textContent).toContain("未送信キュー 2件");
    expect(container.textContent).toContain("本日のACK未到達1件");
    expect(container.textContent).toContain("完走率 60%（現在 60%）");
    expect(container.textContent).toContain("サンプルデータで稼働中");
  });

  it("keeps the login form visible when the shared password is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401 },
    )));
    await act(async () => root.render(<AdminDashboard />));
    const input = container.querySelector<HTMLInputElement>("#admin-password")!;
    await act(async () => {
      enterPassword(input, "wrong");
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("パスワードが正しくありません。");
    expect(container.querySelector("#admin-password")).not.toBeNull();
  });
});
