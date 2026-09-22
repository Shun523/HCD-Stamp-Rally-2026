import { defineConfig } from "@playwright/test";

export default defineConfig({
  fullyParallel: false,
  testDir: "./test/screenshots",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "light",
    deviceScaleFactor: 1,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  workers: 1,
});
