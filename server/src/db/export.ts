import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { EVENT_END_AT, PARTICIPANT_OPEN_AT, loadConfig } from "../config.js";
import { createDb } from "./client.js";
import { buildEventExport, fetchExportRows, parseServerLogs } from "./event-report.js";

// 仕様11章: イベント後の集計・CSVの書き出し。DBは読むだけで変更しない。
const main = async () => {
  const { values } = parseArgs({ options: { out: { type: "string" }, logs: { type: "string" } } });
  if (!values.out) throw new Error("書き出し先を --out <ディレクトリ> で指定してください");
  const outDir = path.resolve(values.out);
  const logs = values.logs ? parseServerLogs(await readFile(path.resolve(values.logs), "utf8")) : undefined;

  const config = loadConfig();
  const { db, client } = createDb(config.databaseUrl, { ca: config.databaseSslCa });
  try {
    const rows = await fetchExportRows(db);
    const files = buildEventExport(rows, { openAt: PARTICIPANT_OPEN_AT, endAt: EVENT_END_AT, exportedAt: new Date(), logs });
    for (const [name, content] of files) {
      const target = path.join(outDir, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    console.log(`exported ${rows.sessions.length} sessions and ${rows.stamps.length} stamps to ${outDir}`);
  } finally {
    await client.end();
  }
};

await main();
