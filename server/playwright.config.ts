import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    browserName: "chromium",
    headless: true,
    locale: "ja-JP",
  },
});
