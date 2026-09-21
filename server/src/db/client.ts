import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 10,
    prepare: false,
  });
  return {
    db: drizzle(client, { schema }),
    client,
  };
}

export type AppDb = ReturnType<typeof createDb>["db"];
