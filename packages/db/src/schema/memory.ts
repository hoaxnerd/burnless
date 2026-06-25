import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  vector,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { companies } from "./tenant";

/**
 * Unified cross-domain memory. ONE table for all domains/use-cases (founder
 * decision): `tier` is Letta's blocks-vs-archival split as a COLUMN — "block" =
 * always-injected/pinned, "recall" = vector-searched. `kind` is free-form text
 * (validated in app code, not a pg enum — precedent: notifications.category).
 * Born-complete with the nullable `embedding vector(1536)` column; A5 (Part 2)
 * adds search/blocks/consolidation LOGIC only — no schema change. Block-tier
 * rows (company facts) leave `embedding` null.
 *
 * pgvector: PGlite auto-creates the extension at client init (client/create.ts);
 * cloud/Postgres requires `CREATE EXTENSION IF NOT EXISTS vector` once before
 * this migration applies (done manually on Neon — NOT in the migration).
 */
export const memory = pgTable(
  "memory",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    domain: text("domain").notNull(),
    kind: text("kind").notNull(),
    tier: text("tier").notNull(),
    label: text("label"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    metadata: jsonb("metadata"),
    readOnly: boolean("read_only").notNull().default(false),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("memory_company_idx").on(table.companyId),
    index("memory_company_domain_kind_idx").on(table.companyId, table.domain, table.kind),
    index("memory_company_tier_idx").on(table.companyId, table.tier),
    // Recall-tier cosine search (searchMemoryByEmbedding). Partial: only rows
    // with a non-null embedding (block-tier rows leave embedding null). HNSW was
    // VERIFY-THEN-DECIDE for self-host safety: probed against PGlite's bundled
    // pgvector (CREATE INDEX ... USING hnsw (... vector_cosine_ops) WHERE ... IS
    // NOT NULL) and it builds + is queryable, so the additive migration applies
    // cleanly on both PGlite and Postgres. (vector_cosine_ops because the search
    // orders by cosine distance.)
    index("memory_embedding_hnsw")
      .using("hnsw", table.embedding.op("vector_cosine_ops"))
      .where(sql`${table.embedding} IS NOT NULL`),
  ]
);
