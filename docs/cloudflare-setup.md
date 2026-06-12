# Burnless on Cloudflare — Deployment Guide

> Full-stack migration plan: every dependency on Cloudflare's developer platform.

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Cloudflare Product Mapping](#cloudflare-product-mapping)
3. [Critical Architecture Decisions](#critical-architecture-decisions)
4. [Migration Phases](#migration-phases)
5. [Wrangler Configuration](#wrangler-configuration)
6. [Cost Estimate](#cost-estimate)
7. [Risks & Mitigations](#risks--mitigations)

---

## Current Architecture

### Monorepo Structure

```
burnless/
├── apps/web/          # Next.js 15.1.0 (App Router, React 19)
├── packages/db/       # Drizzle ORM + PostgreSQL schema + migrations
├── packages/ai/       # Provider-agnostic LLM orchestration
├── packages/engine/   # Financial calculation engine (decimal.js, mathjs)
├── packages/types/    # Shared TypeScript types
├── packages/ui/       # CVA-based component library (Tailwind 4)
├── turbo.json         # Turborepo pipeline
└── docker-compose.yml # Local dev stack
```

- **Package Manager**: pnpm@10.26.1 with Turborepo
- **Node**: 20+
- **TypeScript**: 5.7.0

### Current Dependencies & Services

| Category | Current Stack | Details |
|---|---|---|
| **Framework** | Next.js 15.1.0 | App Router, Server Components, standalone output |
| **Database** | PostgreSQL 16 + pgvector | Drizzle ORM 0.38.0, postgres.js driver, 2000+ line schema |
| **Auth** | NextAuth 5.0.0-beta.25 | GitHub/Google OAuth + credentials + 2FA (TOTP) |
| **AI/LLM** | Anthropic, OpenAI, OpenRouter, Ollama | Provider factory pattern, streaming SSE, tool use |
| **Embeddings** | pgvector | OpenAI text-embedding-3-small (1536d) / Ollama nomic-embed-text (768d) |
| **Cache** | Redis 7 (ioredis) | Caching, rate limiting, job queues |
| **Email** | Resend / SMTP (Mailpit local) | Transactional email |
| **Payments** | Stripe + Razorpay | Provider-agnostic, currency-based selection |
| **Web Search** | DuckDuckGo (keyless, default) / Tavily (prod) | AI chat web search tool |
| **Web Crawling** | direct-fetch (native, default) / Firecrawl (prod) | Content extraction |
| **Monitoring** | Sentry + PostHog | Error tracking + product analytics |
| **Deployment** | Vercel | GitHub Actions CI, Vercel crons |

### Key Environment Variables

```
# Database
DATABASE_URL=postgresql://localhost:5432/burnless

# Auth
AUTH_SECRET, AUTH_GITHUB_ID/SECRET, AUTH_GOOGLE_ID/SECRET

# AI
AI_PROVIDER=anthropic|openai|openrouter|ollama
AI_API_KEY, AI_MODEL, AI_BASE_URL
ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY

# Embeddings
EMBEDDING_PROVIDER=ollama|openai|openrouter|none
EMBEDDING_MODEL, EMBEDDING_DIMENSIONS

# Redis
REDIS_URL=redis://localhost:6380

# Email
EMAIL_PROVIDER=resend|smtp|console
RESEND_API_KEY

# Payments
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, STRIPE_TEAM_PRICE_ID
RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET

# Search & Crawl
WEB_SEARCH_PROVIDER=duckduckgo|tavily   # default: duckduckgo (keyless)
CRAWL_PROVIDER=direct-fetch|firecrawl|scrapingbee   # default: direct-fetch (no env)

# Monitoring
NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST

# Crons
CRON_SECRET
```

### Database Schema Highlights

- **Auth tables**: users, accounts, sessions, verificationTokens (Auth.js compatible)
- **Business core**: companies, companyMembers, departments
- **Financial**: financialAccounts (chart of accounts), transactions, importBatches
- **Forecasting**: scenarios, scenarioOverrides, forecastLines, forecastValues
- **Operations**: headcountPlans, revenueStreams, fundingRounds, integrations
- **AI**: aiConversations, aiMessages, aiInsightCache, aiFeatureFlags, insightInvalidations
- **Dashboard**: dashboardPreferences (per-user layout, metric pins, card modes)
- **25+ PostgreSQL enums** for business logic

---

## Cloudflare Product Mapping

### Direct Mapping: Current Stack → Cloudflare

| Current | Cloudflare Replacement | Migration Effort |
|---|---|---|
| Vercel (hosting) | **Workers** via `@opennextjs/cloudflare` | Medium |
| PostgreSQL 16 | **Hyperdrive** + Neon Postgres (external) | Medium |
| pgvector (embeddings) | **Vectorize** (or keep pgvector in Neon) | Low–High |
| Redis (cache) | **KV** | Medium |
| Redis (rate limiting) | **Durable Objects** | Medium |
| Redis (job queues) | **Queues** | Medium |
| Vercel Crons | **Cron Triggers** | Low |
| Anthropic/OpenAI SDKs | **Workers AI** + **AI Gateway** | Medium |
| No file storage | **R2** (PDF exports, CSV imports) | Low |
| No CAPTCHA | **Turnstile** (login/signup protection) | Low |
| PostHog (analytics) | **Analytics Engine** (supplement) | Low |
| Sentry (errors) | Keep Sentry | None |
| Resend (email) | Keep Resend (CF Email sending still beta) | None |
| Stripe/Razorpay | Keep external | None |
| DuckDuckGo/Tavily | Keep external | None |

### Cloudflare Products Used

| Product | Purpose | Free Tier | Paid |
|---|---|---|---|
| **Workers** | Next.js compute | 100K req/day, 10ms CPU | $5/mo base, 10M req |
| **Hyperdrive** | Postgres connection pooling | Free | Free |
| **KV** | Caching (AI insights, API) | 100K reads/day | 10M reads/mo |
| **Durable Objects** | Rate limiting, sessions | 100K req/day | 1M req/mo |
| **Queues** | Background jobs | 10K ops/day | 1M ops/mo |
| **R2** | Object storage (files, exports) | 10 GB, zero egress | $0.015/GB-mo |
| **Vectorize** | Vector search (embeddings) | 30M queried dims/mo | 50M dims/mo |
| **Workers AI** | LLM inference (edge) | 10K neurons/day | $0.011/1K neurons |
| **AI Gateway** | AI proxy (cache/rate-limit/logs) | Free core features | Free |
| **Cron Triggers** | Scheduled tasks | Included | Included |
| **Turnstile** | Bot protection | 1M req/mo | Free |
| **Analytics Engine** | Custom event tracking | 100K points/day | 10M points/mo |

---

## Critical Architecture Decisions

### 1. Database: Why NOT D1, Why Neon + Hyperdrive

**D1 (Cloudflare's SQLite database) is not suitable for Burnless:**

- D1 is SQLite — the schema uses **25+ PostgreSQL enums**, which SQLite doesn't support
- **pgvector extension** requires PostgreSQL — no SQLite equivalent
- **10 GB hard cap** per D1 database — a multi-tenant SaaS with financial transactions will outgrow this
- Migrating 2000+ lines of PostgreSQL-specific schema to SQLite is a massive rewrite with zero business value
- Complex financial queries, JOINs, and aggregations benefit from PostgreSQL's query planner

**Recommendation: Neon Postgres (serverless) + Hyperdrive**

- Neon is serverless PostgreSQL with scale-to-zero — pay only for compute used
- Neon supports pgvector natively — no changes to embeddings
- Hyperdrive pools connections from Workers → reduces per-query latency from ~30ms to ~3ms
- Drizzle ORM + postgres.js driver work unchanged
- Zero schema migration — the entire `packages/db` package stays as-is

**Neon pricing:**
- Free: 0.5 GB storage, 1 project, 190 compute hours/mo
- Launch ($19/mo): 10 GB, unlimited projects, 300 compute hours
- Scale ($69/mo): 50 GB, autoscaling, 750 compute hours

### 2. Vector Search: pgvector vs Vectorize

| | pgvector (in Neon) | Vectorize |
|---|---|---|
| **Migration effort** | Zero | High — new API, separate storage |
| **Max dimensions** | Unlimited | 1,536 |
| **Query latency** | ~5ms (via Hyperdrive) | ~30ms |
| **Scaling** | Tied to Postgres | Independent scaling |
| **Cost** | Included in Neon | Separate billing |

**Recommendation**: Keep pgvector in Neon for launch. Migrate to Vectorize later only if vector query volume warrants independent scaling.

### 3. AI/LLM Strategy: Workers AI + AI Gateway

The existing provider factory (`packages/ai/src/providers/`) already supports multiple backends. The migration adds two new capabilities:

**AI Gateway (do first — minimal effort, big win):**
- Proxy layer in front of Anthropic/OpenAI — change `baseURL` only
- Free caching of identical requests (90% latency reduction for repeated queries)
- Free rate limiting, analytics dashboard, cost tracking
- Fallback routing: if Anthropic fails, auto-route to OpenAI
- One gateway URL per provider, configured in Cloudflare dashboard

```typescript
// Before
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// After — just change baseURL
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: "https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic",
});
```

**Workers AI (add as 5th provider):**
- Run open-source LLMs on Cloudflare's GPU fleet
- Available models: Llama 4 Scout 17B, Qwen 3 30B, DeepSeek R1, Gemma 4 26B
- Embedding models: BGE Large, Qwen3 Embedding 0.6B
- No API key needed — bound directly to Worker via `env.AI`
- Good for: cost-sensitive tiers, fallback provider, fast/small model tasks

**Tier mapping for Workers AI:**

| Tier | Model |
|---|---|
| fast | Llama 3.2 3B or Gemma 3 4B |
| standard | Llama 4 Scout 17B or Qwen 3 30B |
| deep | DeepSeek R1 Distill Qwen 32B |

### 4. Redis Replacement: Three Separate Cloudflare Primitives

Redis currently serves three distinct purposes. Each maps to a different Cloudflare primitive:

**Caching → KV**
- AI insight cache, API response cache, session data
- KV is eventually consistent (up to 60s propagation) — fine for cache
- Read-heavy, write-light pattern — matches KV's strengths
- API: `await env.CACHE.put(key, value, { expirationTtl })` / `await env.CACHE.get(key)`

**Rate Limiting → Durable Objects**
- `/api/chat` rate limiting needs strong consistency (no eventual consistency)
- Durable Objects provide single-instance, globally unique counters
- Each user/IP gets their own Durable Object with precise request tracking
- Built-in SQLite for persistence across invocations

**Background Jobs → Queues**
- Weekly digest emails, data retention cleanup, AI insight regeneration
- At-least-once delivery, configurable retries, dead letter queues
- Batch processing: consume up to 100 messages at once
- API: `await env.JOBS.send({ type: "digest", companyId })` 

### 5. bcrypt Must Be Replaced

`bcrypt` uses native C bindings that don't work in the Workers runtime.

**Replace with `@noble/hashes`** (pure JS, audited, works everywhere):

```typescript
// Before (bcrypt)
import bcrypt from "bcrypt";
const hash = await bcrypt.hash(password, 12);
const valid = await bcrypt.compare(password, hash);

// After (@noble/hashes with scrypt)
import { scrypt } from "@noble/hashes/scrypt";
import { randomBytes } from "@noble/hashes/utils";

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scrypt(password, salt, { N: 2 ** 14, r: 8, p: 1, dkLen: 32 });
  return `${Buffer.from(salt).toString("hex")}:${Buffer.from(hash).toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const hash = scrypt(password, salt, { N: 2 ** 14, r: 8, p: 1, dkLen: 32 });
  return Buffer.from(hash).toString("hex") === hashHex;
}
```

**Migration note**: Existing bcrypt hashes in the database remain valid. Add a compatibility layer that detects hash format (`$2b$` prefix = bcrypt, hex:hex = scrypt) and rehashes on next login.

---

## Migration Phases

### Phase 1: Foundation — Deploy Next.js on Workers

**Goal**: Get the app running on Cloudflare Workers with the existing database.

1. **Install OpenNext for Cloudflare**
   ```bash
   pnpm add -D @opennextjs/cloudflare
   ```

2. **Create `wrangler.jsonc`** in `apps/web/` (see configuration section below)

3. **Update `next.config.ts`**
   - Remove `output: "standalone"` (OpenNext handles bundling)
   - Keep all other config (security headers, CSP, etc.)

4. **Replace `bcrypt` with `@noble/hashes`**
   - Update `apps/web/src/lib/auth.config.ts` (credentials provider)
   - Add hash-format detection for backward compatibility

5. **Set up Neon Postgres**
   - Create Neon project at neon.tech
   - Enable pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Run Drizzle migrations: `pnpm drizzle-kit push`
   - Note the connection string

6. **Create Hyperdrive configuration**
   ```bash
   npx wrangler hyperdrive create burnless-db \
     --connection-string="postgresql://user:pass@ep-xxx.neon.tech/burnless?sslmode=require"
   ```

7. **Update database connection** in `packages/db/` to use Hyperdrive binding in production:
   ```typescript
   // In Workers environment, use Hyperdrive connection string
   const connectionString = env.HYPERDRIVE?.connectionString ?? process.env.DATABASE_URL;
   ```

8. **Set Worker secrets**
   ```bash
   npx wrangler secret put AUTH_SECRET
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put STRIPE_SECRET_KEY
   # ... etc for all env vars
   ```

9. **Build and test**
   ```bash
   cd apps/web
   npx @opennextjs/cloudflare build
   npx wrangler dev  # local testing against Cloudflare runtime
   ```

10. **Deploy**
    ```bash
    npx wrangler deploy
    ```

### Phase 2: Replace Redis with Cloudflare Primitives

**Goal**: Remove Redis dependency entirely.

8. **Create KV namespace**
   ```bash
   npx wrangler kv namespace create CACHE
   # Add returned ID to wrangler.jsonc
   ```

9. **Write cache adapter** — abstract over KV API matching current Redis usage:
   ```typescript
   // packages/db/src/cache.ts or apps/web/src/lib/cache.ts
   export class CloudflareCache {
     constructor(private kv: KVNamespace) {}

     async get<T>(key: string): Promise<T | null> {
       return this.kv.get(key, "json");
     }

     async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
       await this.kv.put(key, JSON.stringify(value), {
         expirationTtl: ttlSeconds,
       });
     }

     async delete(key: string): Promise<void> {
       await this.kv.delete(key);
     }
   }
   ```

10. **Create Rate Limiter Durable Object**
    ```typescript
    export class RateLimiter implements DurableObject {
      private state: DurableObjectState;
      
      constructor(state: DurableObjectState) {
        this.state = state;
      }
      
      async fetch(request: Request): Promise<Response> {
        const { limit, window } = await request.json();
        const now = Date.now();
        const windowStart = now - window * 1000;
        
        // Clean old entries and count recent requests
        const db = this.state.storage.sql;
        db.exec("DELETE FROM requests WHERE ts < ?", windowStart);
        db.exec("INSERT INTO requests (ts) VALUES (?)", now);
        const count = db.exec("SELECT COUNT(*) as c FROM requests").one().c;
        
        return Response.json({ allowed: count <= limit, remaining: Math.max(0, limit - count) });
      }
    }
    ```

11. **Set up Queues** for background jobs
    ```bash
    npx wrangler queues create burnless-jobs
    ```
    - Migrate cron job handlers to Queue consumers
    - Weekly digest: producer sends on cron trigger, consumer processes

12. **Replace Vercel Crons** with Cron Triggers (configured in `wrangler.jsonc`)

### Phase 3: AI Gateway Integration

**Goal**: Route all AI traffic through Cloudflare AI Gateway.

13. **Create AI Gateway** in Cloudflare dashboard (AI > AI Gateway > Create)

14. **Update Anthropic provider** (`packages/ai/src/providers/anthropic.ts`):
    ```typescript
    baseURL: process.env.CF_AI_GATEWAY_URL
      ? `${process.env.CF_AI_GATEWAY_URL}/anthropic`
      : undefined,
    ```

15. **Update OpenAI provider** (`packages/ai/src/providers/openai.ts`):
    ```typescript
    baseURL: process.env.CF_AI_GATEWAY_URL
      ? `${process.env.CF_AI_GATEWAY_URL}/openai`
      : undefined,
    ```

16. **Add Workers AI provider** (`packages/ai/src/providers/cloudflare.ts`):
    ```typescript
    import { Ai } from "@cloudflare/ai";
    
    export function createCloudflareProvider(env: { AI: Ai }) {
      return {
        chat: async (messages, options) => {
          const response = await env.AI.run(options.model, { messages, stream: options.stream });
          return response;
        },
      };
    }
    ```
    Register in provider factory as `provider: "cloudflare"`.

17. **Configure fallback routing** in AI Gateway dashboard:
    - Primary: Anthropic Claude Sonnet
    - Fallback 1: OpenAI GPT-4o
    - Fallback 2: Workers AI Llama 4 Scout

### Phase 4: Storage & Assets

**Goal**: Add file storage and optimize asset delivery.

18. **Create R2 bucket**
    ```bash
    npx wrangler r2 bucket create burnless-files
    ```

19. **Add R2 upload/download utilities**:
    ```typescript
    export async function uploadFile(env: { STORAGE: R2Bucket }, key: string, body: ReadableStream) {
      return env.STORAGE.put(key, body);
    }
    
    export async function getFileUrl(env: { STORAGE: R2Bucket }, key: string) {
      const object = await env.STORAGE.get(key);
      return object ? new Response(object.body) : null;
    }
    ```

20. **Move PDF exports** to generate → store in R2 → return signed URL

21. **Move CSV imports** to upload to R2 → process via Queue consumer

### Phase 5: Security & Observability

**Goal**: Add Cloudflare-native security and analytics.

22. **Add Turnstile** to login/signup pages:
    ```bash
    pnpm add @marsidev/react-turnstile  # React component
    ```
    - Add site key to client, verify token server-side via Cloudflare API

23. **Set up Analytics Engine** for custom events (AI usage, feature adoption)

24. **Configure Zaraz** for third-party scripts (PostHog client-side via Zaraz instead of direct embed)

25. **Set up custom domain** in Cloudflare DNS → Workers route

### Phase 6: Post-Launch Optimization

26. **Migrate embeddings to Vectorize** if vector query volume > 1000/day
27. **Move PDF generation** to a dedicated Worker or Queue consumer to reduce main bundle size
28. **Enable AI Gateway caching** for frequently repeated AI insight queries
29. **Add edge caching** via KV for static dashboard data (company metrics that change daily)
30. **Consider Cloudflare Containers** for heavy compute (financial engine batch calculations)

---

## Wrangler Configuration

```jsonc
// apps/web/wrangler.jsonc
{
  "name": "burnless",
  "compatibility_date": "2026-04-15",
  "compatibility_flags": ["nodejs_compat_v2"],
  "main": ".open-next/worker.js",
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },

  // --- Database ---
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<hyperdrive-config-id>"
    }
  ],

  // --- Caching ---
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "<kv-namespace-id>"
    }
  ],

  // --- Object Storage ---
  "r2_buckets": [
    {
      "binding": "STORAGE",
      "bucket_name": "burnless-files"
    }
  ],

  // --- Vector Search (Phase 6) ---
  "vectorize": [
    {
      "binding": "VECTORIZE",
      "index_name": "burnless-embeddings"
    }
  ],

  // --- AI ---
  "ai": {
    "binding": "AI"
  },

  // --- Rate Limiting ---
  "durable_objects": {
    "bindings": [
      {
        "name": "RATE_LIMITER",
        "class_name": "RateLimiter"
      }
    ]
  },

  // --- Background Jobs ---
  "queues": {
    "producers": [
      {
        "binding": "JOBS",
        "queue": "burnless-jobs"
      }
    ],
    "consumers": [
      {
        "queue": "burnless-jobs",
        "max_batch_size": 10,
        "max_retries": 3,
        "dead_letter_queue": "burnless-jobs-dlq"
      }
    ]
  },

  // --- Scheduled Tasks (replaces Vercel Crons) ---
  "triggers": {
    "crons": [
      "0 8 * * 1",
      "0 3 * * *"
    ]
  },

  // --- Build settings ---
  "build": {
    "command": "npx @opennextjs/cloudflare build"
  },

  // --- Limits ---
  "limits": {
    "cpu_ms": 30000
  }
}
```

---

## Cost Estimate

### At Launch (low traffic)

| Service | Monthly Cost | Notes |
|---|---|---|
| Workers Paid | $5 | Base plan, includes 10M requests |
| Neon Postgres (Free) | $0 | 0.5 GB storage, 190 compute hours |
| Hyperdrive | $0 | Free forever |
| KV | $0 | Included with Workers paid |
| R2 | $0 | 10 GB free, zero egress |
| Durable Objects | $0 | Included with Workers paid |
| Queues | $0 | 1M ops/mo included |
| Workers AI | $0 | 10K neurons/day free |
| AI Gateway | $0 | Core features free |
| Vectorize | $0 | 50M dims/mo included |
| Turnstile | $0 | 1M requests/mo free |
| Resend | $0 | 3K emails/mo free |
| **Total** | **$5/mo** | |

### At Scale (~10K users)

| Service | Monthly Cost | Notes |
|---|---|---|
| Workers Paid | $5 + ~$10 | ~40M requests |
| Neon Postgres (Launch) | $19 | 10 GB, 300 compute hours |
| R2 | ~$2 | ~100 GB storage |
| KV | ~$2 | ~50M reads |
| Workers AI | ~$20 | Depends on model usage |
| Resend | $20 | ~50K emails |
| **Total** | **~$78/mo** | |

### Comparison: Current Vercel Stack

| Service | Current Cost | Cloudflare Cost | Savings |
|---|---|---|---|
| Compute (Vercel Pro) | $20/mo | $5/mo | 75% |
| Database (managed PG) | $25–50/mo | $0–19/mo (Neon) | 50–100% |
| Redis (Upstash/managed) | $10–25/mo | $0 (KV included) | 100% |
| Blob storage | $5–15/mo | $0 (R2 free tier) | 100% |
| AI proxy/cache | N/A | $0 (AI Gateway) | New capability |
| CAPTCHA | N/A | $0 (Turnstile) | New capability |

---

## Risks & Mitigations

### 1. Worker Bundle Size (MEDIUM RISK — measured)

**Measured build output (2026-04-15):**

| Component | Uncompressed | Compressed (gzip) |
|---|---|---|
| Server chunks | 5.8 MB | **1.59 MB** |
| Full server directory | 24 MB | **4.36 MB** |
| Static assets | 5.6 MB | **1.64 MB** |
| Full standalone (incl. node_modules) | 117 MB | 27.54 MB |

**Key files in standalone node_modules:**
- `next` runtime: 28 MB (largest, expected)
- `sharp-libvips` (darwin-arm64): 15 MB (platform-specific, excluded by OpenNext)
- `esbuild` (darwin-arm64): 10 MB (dev tool, excluded by OpenNext)
- `typescript`: 8.7 MB (dev tool, excluded by OpenNext)
- `drizzle-orm`: 1.4 MB
- `@sentry/core`: 1.3 MB
- `@anthropic-ai/sdk`: 484 KB

**Assessment**: The server chunks at **1.59 MB compressed** are well under the 10 MB limit. OpenNext for Cloudflare bundles only the server-side code (not the full standalone directory with platform-specific binaries). **Bundle size is NOT a blocker.**

**However**, the following should be monitored:
- The 1.3 MB WASM file in edge-chunks (`wasm_77d9faeb...wasm`) — likely bcrypt or auth-related
- The largest server chunk (`5096.js` at 1.1 MB) — likely contains Drizzle schema + AI tools

**Mitigations if it grows**:
- Dynamic imports for optional SDKs (Stripe, Razorpay — already implemented)
- Move heavy operations to separate Workers or Queue consumers:
  - PDF generation (`jspdf` + `jspdf-autotable`) → dedicated Worker
  - Financial calculations (`mathjs`, `decimal.js`) → Queue consumer
- Monitor with: `npx @opennextjs/cloudflare build && ls -la .open-next/worker.js`
- If edge cases arise: Cloudflare Containers can run full Node.js

### 2. PostgreSQL Compatibility via Hyperdrive (LOW RISK)

**Risk**: Hyperdrive connection pooling may have edge cases with postgres.js driver or Drizzle ORM.

**Mitigations**:
- Hyperdrive is production-stable and explicitly supports postgres.js
- Drizzle has documented Cloudflare Workers + Hyperdrive support
- Test thoroughly with `wrangler dev` before deploying

### 3. bcrypt → scrypt Migration (MEDIUM RISK)

**Risk**: Existing users have bcrypt-hashed passwords. Switching hash algorithm requires a migration path.

**Mitigations**:
- Detect hash format at login: `$2b$` prefix = bcrypt, otherwise = scrypt
- On successful bcrypt login, rehash with scrypt and update database
- After sufficient time (e.g., 90 days), force password reset for remaining bcrypt users
- Or: bundle a WASM bcrypt implementation as temporary bridge

### 4. KV Eventual Consistency (LOW RISK)

**Risk**: KV writes take up to 60 seconds to propagate globally. Stale cache reads possible.

**Mitigations**:
- Cache is already tolerant of staleness (AI insights have TTL-based expiry)
- Rate limiting uses Durable Objects (strongly consistent), not KV
- For critical freshness: add cache-busting keys or use Durable Objects

### 5. Workers AI Model Quality (MEDIUM RISK)

**Risk**: Open-source models on Workers AI may not match Anthropic Claude quality for financial analysis.

**Mitigations**:
- Workers AI is an additional provider, not a replacement
- Keep Anthropic as the default for `standard` and `deep` tiers
- Use Workers AI for `fast` tier tasks (categorization, simple queries)
- AI Gateway provides seamless fallback between providers

### 6. Cold Starts (LOW RISK)

**Risk**: Workers have near-zero cold starts (~0ms), but Neon Postgres has cold starts on the free tier (scale-to-zero).

**Mitigations**:
- Neon cold start is ~500ms (first query only, then warm for 5 minutes)
- Hyperdrive connection pooling keeps connections warm
- On paid Neon plans, configure minimum compute to avoid cold starts

### 7. Next.js Feature Compatibility (MEDIUM RISK)

**Risk**: Not all Next.js features work perfectly on Workers via OpenNext.

**Known working**: SSR, SSG, ISR, App Router, middleware, route handlers, API routes, image optimization.

**Known limitations**:
- Node Middleware (Next.js 15.2+) not yet supported by OpenNext
- Some Node.js APIs may not be available (check `nodejs_compat_v2` flag coverage)

**Mitigations**:
- Test all critical paths in `wrangler dev` before deploying
- OpenNext has active community + Cloudflare backing
- Fallback: Cloudflare Containers can run full Node.js if Workers hit a wall
