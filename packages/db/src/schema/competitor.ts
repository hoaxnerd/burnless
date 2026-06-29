import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { companies } from "./tenant";

// ── Competitors ───────────────────────────────────────────────────────────────

export const competitors = pgTable(
  "competitors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    status: text("status").notNull().default("active"), // "active" | "paused"
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("competitors_company_idx").on(table.companyId),
  ]
);

// ── Competitor Sources ────────────────────────────────────────────────────────

export const competitorSources = pgTable(
  "competitor_sources",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    competitorId: text("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "pricing" | "social"
    url: text("url").notNull(),
    config: jsonb("config"),
    enabled: boolean("enabled").notNull().default(true),
    intervalHours: integer("interval_hours").notNull().default(168),
    lastRunAt: timestamp("last_run_at", { mode: "date" }),
    lastStatus: text("last_status"),
    healthState: text("health_state").notNull().default("ok"), // "ok" | "broken"
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("competitor_sources_company_idx").on(table.companyId),
    index("competitor_sources_competitor_idx").on(table.competitorId),
  ]
);

// ── Competitor Snapshots ──────────────────────────────────────────────────────

export const competitorSnapshots = pgTable(
  "competitor_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    competitorId: text("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => competitorSources.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { mode: "date" }).defaultNow().notNull(),
    raw: text("raw").notNull(),
    rawHash: text("raw_hash").notNull(),
    structured: jsonb("structured").notNull(),
    structuredHash: text("structured_hash").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("competitor_snapshots_source_idx").on(table.sourceId, table.capturedAt),
  ]
);

// ── Competitor Changes ────────────────────────────────────────────────────────

export const competitorChanges = pgTable(
  "competitor_changes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    competitorId: text("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => competitorSources.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => competitorSnapshots.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    detectedAt: timestamp("detected_at", { mode: "date" }).defaultNow().notNull(),
    changeType: text("change_type").notNull(),
    summary: text("summary").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    severity: text("severity").notNull().default("info"),
    acknowledgedAt: timestamp("acknowledged_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("competitor_changes_company_idx").on(table.companyId, table.detectedAt),
    index("competitor_changes_competitor_idx").on(table.competitorId),
  ]
);

// ── Inferred Row Types ────────────────────────────────────────────────────────

export type Competitor = typeof competitors.$inferSelect;
export type CompetitorSource = typeof competitorSources.$inferSelect;
export type CompetitorSnapshot = typeof competitorSnapshots.$inferSelect;
export type CompetitorChange = typeof competitorChanges.$inferSelect;
