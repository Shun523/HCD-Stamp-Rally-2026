import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = resolve(process.cwd(), "src");
const directColor = /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)\s*\(/i;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("design tokens", () => {
  it("keeps color literals in tokens.css only", () => {
    const offenders = sourceFiles(sourceDirectory)
      .filter((path) => path.endsWith(".css") || path.endsWith(".ts") || path.endsWith(".tsx"))
      .filter((path) => !path.endsWith("styles/tokens.css"))
      .filter((path) => directColor.test(readFileSync(path, "utf8")))
      .map((path) => relative(sourceDirectory, path));
    expect(offenders).toEqual([]);
  });
});
