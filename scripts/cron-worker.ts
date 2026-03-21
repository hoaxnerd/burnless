#!/usr/bin/env tsx
/**
 * Local cron worker — replaces Vercel Cron for Docker/local dev.
 *
 * Reads schedules from apps/web/vercel.json and calls endpoints on the
 * running Next.js app. Add new cron jobs to vercel.json and they'll
 * automatically be picked up here.
 *
 * Usage:
 *   npx tsx scripts/cron-worker.ts
 *   # or in Docker: node --import=tsx scripts/cron-worker.ts
 *
 * Environment:
 *   APP_URL      — base URL of the Next.js app (default: http://localhost:3000)
 *   CRON_SECRET  — bearer token for auth (must match app's CRON_SECRET)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

interface CronJob {
  path: string;
  schedule: string;
}

interface VercelConfig {
  crons?: CronJob[];
}

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

// ── Load cron definitions from vercel.json ───────────────────────────────────

function loadCronJobs(): CronJob[] {
  try {
    const configPath = resolve(__dirname, "../apps/web/vercel.json");
    const raw = readFileSync(configPath, "utf8");
    const config: VercelConfig = JSON.parse(raw);
    return config.crons ?? [];
  } catch (err) {
    console.error("[cron-worker] Failed to load vercel.json:", err);
    return [];
  }
}

// ── Simple cron parser (5-field: min hour dom month dow) ─────────────────────

function fieldMatches(field: string, value: number, max: number): boolean {
  if (field === "*") return true;

  // Handle step values: */5
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }

  // Handle ranges: 1-5
  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    return value >= start && value <= end;
  }

  // Handle lists: 1,3,5
  if (field.includes(",")) {
    return field.split(",").map(Number).includes(value);
  }

  return parseInt(field, 10) === value;
}

function shouldRun(schedule: string, now: Date): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [min, hour, dom, month, dow] = parts;
  return (
    fieldMatches(min, now.getUTCMinutes(), 59) &&
    fieldMatches(hour, now.getUTCHours(), 23) &&
    fieldMatches(dom, now.getUTCDate(), 31) &&
    fieldMatches(month, now.getUTCMonth() + 1, 12) &&
    fieldMatches(dow, now.getUTCDay(), 7)
  );
}

// ── Execute a cron endpoint ──────────────────────────────────────────────────

async function executeCron(job: CronJob): Promise<void> {
  const url = `${APP_URL}${job.path}`;
  console.log(`[cron-worker] Running ${job.path} ...`);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: CRON_SECRET
        ? { Authorization: `Bearer ${CRON_SECRET}` }
        : {},
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    });

    const body = await res.text().catch(() => "");
    if (res.ok) {
      console.log(`[cron-worker] ${job.path} → ${res.status} OK`);
    } else {
      console.error(`[cron-worker] ${job.path} → ${res.status} ${body}`);
    }
  } catch (err) {
    console.error(`[cron-worker] ${job.path} failed:`, err);
  }
}

// ── Main loop ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const jobs = loadCronJobs();

  if (jobs.length === 0) {
    console.log("[cron-worker] No cron jobs found in vercel.json. Sleeping...");
  } else {
    console.log(`[cron-worker] Loaded ${jobs.length} cron job(s):`);
    for (const job of jobs) {
      console.log(`  ${job.schedule}  →  ${job.path}`);
    }
  }

  console.log(`[cron-worker] Checking every 60s. APP_URL=${APP_URL}`);

  // Check every minute
  const tick = async () => {
    const now = new Date();
    for (const job of jobs) {
      if (shouldRun(job.schedule, now)) {
        // Fire and forget — don't block the next tick
        executeCron(job).catch(() => {});
      }
    }
  };

  // Run immediately on startup (useful for testing)
  if (process.env.CRON_RUN_NOW === "true") {
    console.log("[cron-worker] CRON_RUN_NOW=true — running all jobs immediately");
    await Promise.all(jobs.map(executeCron));
  }

  // Then check every minute
  setInterval(tick, 60_000);
  // Also tick on the next minute boundary
  tick();
}

main().catch((err) => {
  console.error("[cron-worker] Fatal:", err);
  process.exit(1);
});
