import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadConfig } from "../config.js";
import { createDb } from "./client.js";

const main = async () => {
  const config = loadConfig();
  const { db, client } = createDb(config.databaseUrl, { ca: config.databaseSslCa });
  try {
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  } finally {
    await client.end();
  }
};

await main();
