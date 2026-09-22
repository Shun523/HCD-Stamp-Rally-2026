import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("server config", () => {
  it("resolves the default web build independently of the process cwd", () => {
    const config = loadConfig({});
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    expect(config.webDistDir).toBe(resolve(repositoryRoot, "web/dist"));
  });

  it("allows WEB_DIST_DIR to override the default", () => {
    expect(loadConfig({ WEB_DIST_DIR: "/tmp/custom-web" }).webDistDir).toBe("/tmp/custom-web");
  });
});
