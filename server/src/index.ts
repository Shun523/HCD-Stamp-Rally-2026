import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { PostgresRepository } from "./db/repository.js";

const config = loadConfig();
const database = createDb(config.databaseUrl);
const repository = new PostgresRepository(database.db);
const app = createApp({ repository, config });

serve({ fetch: app.fetch, port: config.port });
console.log(`server listening on :${config.port}`);

const shutdown = async () => {
  await database.client.end();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
