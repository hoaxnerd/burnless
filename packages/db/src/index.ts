import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };
export * from "./queries";
export { encryptSecret, decryptSecret, encryptJson, decryptJson } from "./crypto";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/burnless";

// Prevent connection pool leak in Next.js dev mode (hot reloads spawn new pools)
const globalForDb = globalThis as unknown as { __burnless_db: ReturnType<typeof drizzle> };

if (!globalForDb.__burnless_db) {
  const client = postgres(connectionString, { max: 10 });
  globalForDb.__burnless_db = drizzle(client, { schema });
}

export const db = globalForDb.__burnless_db;

export type Database = typeof db;
