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

  const app = createApp({
    repository,
    config: { ackTimeoutMs: 1_000 },
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
    await expect(page.getByRole("heading", { name: "遊び方（サンプル）" })).toBeVisible();
    await page.getByRole("button", { name: "はじめる" }).click();
    await expect(page.getByRole("heading", { name: "電子スタンプ帳" })).toBeVisible();
    await page.waitForTimeout(250);

    const closeAnimation = async () => {
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
      await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
    };

    await simulateDevice(configPaths[0]!, "--simulate-token", token);
    await closeAnimation();
    await expect(page.locator(".stamp-slot.is-stamped")).toHaveCount(1);

    // 仕様6-7: サーバー停止中の押印は端末側ファイルキューへ保存し、復旧後に再送する。
    const port = running.port;
    await stopServer(running.server);
    await simulateDevice(configPaths[1]!, "--simulate-token", token);
    const queued = JSON.parse(await readFile(join(temporaryDirectory, "pending-2.json"), "utf8")) as unknown[];
    expect(queued).toHaveLength(1);

    running = await startServer(app.fetch, port);
    await simulateDevice(configPaths[1]!, "--simulate-resend");
    await closeAnimation();
    await expect(page.locator(".stamp-slot.is-stamped")).toHaveCount(2);

    for (let index = 3; index <= 5; index += 1) {
      await simulateDevice(configPaths[index - 1]!, "--simulate-token", token);
      await closeAnimation();
    }
    await expect(page.getByRole("heading", { name: "完走おめでとうございます！" })).toBeVisible();
    await expect(page.locator(".goal")).toBeVisible();
  } finally {
    await stopServer(running.server).catch(() => undefined);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
