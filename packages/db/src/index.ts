import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/burnless";

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export type Database = typeof db;
