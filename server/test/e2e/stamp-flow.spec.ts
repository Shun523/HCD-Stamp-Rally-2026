import { execFile as execFileCallback } from "node:child_process";
import { once } from "node:events";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { expect, test } from "@playwright/test";
import { createApp } from "../../src/app.js";
import { SESSION_COOKIE } from "../../src/security.js";
import { SseHub } from "../../src/sse.js";
import { MemoryRepository } from "../support/memory-repository.js";

const execFile = promisify(execFileCallback);
const deviceDirectory = fileURLToPath(new URL("../../../device/", import.meta.url));
const devicePython = fileURLToPath(new URL("../../../device/.venv/bin/python", import.meta.url));

type RunningServer = {
  server: ServerType;
  port: number;
};

async function startServer(
  fetch: (request: Request, env: unknown) => Response | Promise<Response>,
  port = 0,
): Promise<RunningServer> {
  const server = serve({ fetch, hostname: "127.0.0.1", port });
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("E2E server has no TCP port");
  return { server, port: address.port };
}

async function stopServer(server: ServerType): Promise<void> {
  (server as ServerType & { closeAllConnections?: () => void }).closeAllConnections?.();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function configToml(baseUrl: string, deviceId: string, apiKey: string, queueFile: string, spotId: string): string {
  return `[server]
base_url = "${baseUrl}"
api_key = "${apiKey}"

[device]
id = "${deviceId}"
spot_id = "${spotId}"

[storage]
queue_file = "${queueFile}"

[hardware]
backend = "dummy"
`;
}

async function simulateDevice(configPath: string, ...mode: string[]): Promise<void> {
  await execFile(devicePython, ["-m", "hcd_stamp_device.main", "--config", configPath, ...mode], {
    cwd: deviceDirectory,
  });
}

test("模擬端末の押印と再送が同一オリジンのスタンプ帳へ反映され、5個目で完走する", async ({ page, context }) => {
  const repository = new MemoryRepository();
  const sessionId = "e2e-session";
  const token = "e2e-stamp-token";
  const issuedAt = new Date("2026-10-31T01:00:00.000Z");
  await repository.createSession({
    id: sessionId,
    token,
    userAgent: "playwright",
    createdAt: issuedAt,
    issuedAt,
  });
  for (let index = 1; index <= 5; index += 1) {
    repository.addDevice(
      `e2e-dev-${index}`,
      `e2e-key-${index}`,
      `spot-${String(index).padStart(2, "0")}`,
    );
  }

  const hub = new SseHub();
  const app = createApp({
    repository,
    hub,
    // 仕様4-8: 実際の時計で動かすため、一般開放後の流れを試すよう開放時刻を過去にする。
    config: { ackTimeoutMs: 1_000, participantOpenAt: new Date("2026-10-01T00:00:00+09:00") },
    webRoot: "../web/dist",
    secureCookies: false,
  });
  let running = await startServer(app.fetch);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "hcd-stamp-e2e-"));
  const configPaths: string[] = [];
  try {
    for (let index = 1; index <= 5; index += 1) {
      const configPath = join(temporaryDirectory, `device-${index}.toml`);
      configPaths.push(configPath);
      await writeFile(
        configPath,
        configToml(
          `http://127.0.0.1:${running.port}`,
          `e2e-dev-${index}`,
          `e2e-key-${index}`,
          join(temporaryDirectory, `pending-${index}.json`),
          `spot-${String(index).padStart(2, "0")}`,
        ),
      );
    }

    await context.addCookies([{
      name: SESSION_COOKIE,
      value: sessionId,
      url: `http://127.0.0.1:${running.port}`,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    }]);
    await page.goto(`http://127.0.0.1:${running.port}/`);
    await expect(page.getByRole("heading", { name: "スタンプラリー" })).toBeVisible();
    await page.getByRole("button", { name: "はじめる" }).click();
    await expect(page.locator("[data-stamp-card]")).toBeVisible();
    await page.waitForTimeout(250);

    const closeAnimation = async (completed = false) => {
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
      await page.getByRole("dialog").getByRole("button", { name: completed ? "ゴールへ" : "とじる" }).click();
    };

    await simulateDevice(configPaths[0]!, "--simulate-token", token);
    await closeAnimation();
    await expect(page.locator('[data-card-stamp-slot][data-stamped="true"]')).toHaveCount(1);

    // 仕様6-7: サーバー停止中の押印は端末側ファイルキューへ保存し、復旧後に再送する。
    const port = running.port;
    await stopServer(running.server);
    await expect.poll(() => hub.connectionCount(sessionId), { timeout: 10_000 }).toBe(0);
    await simulateDevice(configPaths[1]!, "--simulate-token", token);
    const queued = JSON.parse(await readFile(join(temporaryDirectory, "pending-2.json"), "utf8")) as unknown[];
    expect(queued).toHaveLength(1);

    running = await startServer(app.fetch, port);
    // 仕様4-4: 再接続はバックオフ付きのため、SSEが張り直されたことを確かめてから再送する。
    await expect.poll(() => hub.connectionCount(sessionId), { timeout: 15_000 }).toBeGreaterThan(0);
    await simulateDevice(configPaths[1]!, "--simulate-resend");
    await closeAnimation();
    await expect(page.locator('[data-card-stamp-slot][data-stamped="true"]')).toHaveCount(2);

    for (let index = 3; index <= 4; index += 1) {
      await simulateDevice(configPaths[index - 1]!, "--simulate-token", token);
      await closeAnimation();
    }
    await simulateDevice(configPaths[4]!, "--simulate-token", token);
    await closeAnimation(true);
    await expect(page.getByRole("heading", { name: "おめでとう!" })).toBeVisible();
  } finally {
    await stopServer(running.server).catch(() => undefined);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

// 仕様4-8・7章: 一般開放前は待機画面だけを出し、管理画面で解除した端末だけが通常の流れへ進める。
test("一般開放前は待機画面を出し、管理画面で解除した端末だけ初回説明へ進める", async ({ page, context }) => {
  const repository = new MemoryRepository();
  const app = createApp({
    repository,
    config: { ackTimeoutMs: 1_000, adminPassword: "e2e-staff-password", participantOpenAt: new Date(Date.now() + 60 * 60_000) },
    webRoot: "../web/dist",
    secureCookies: false,
  });
  const running = await startServer(app.fetch);
  const origin = `http://127.0.0.1:${running.port}`;
  try {
    await page.goto(`${origin}/`);
    await expect(page.getByText("スタンプラリーは当日から参加できます", { exact: false })).toBeVisible();
    await expect(page.locator("[data-stamp-card]")).toHaveCount(0);
    expect((await context.cookies(origin)).map((cookie) => cookie.name)).not.toContain(SESSION_COOKIE);
    expect(repository.sessions.size).toBe(0);

    const unlock = await page.request.post(`${origin}/api/admin/preview`, { headers: { "x-admin-password": "e2e-staff-password" } });
    expect(unlock.status()).toBe(200);
    await page.goto(`${origin}/`);
    await expect(page.getByRole("button", { name: "はじめる" })).toBeVisible();
    expect((await context.cookies(origin)).map((cookie) => cookie.name)).toContain(SESSION_COOKIE);
    expect(repository.sessions.size).toBe(1);
  } finally {
    await stopServer(running.server).catch(() => undefined);
  }
});
