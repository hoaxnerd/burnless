// apps/web/e2e/mcp-connections.spec.ts
//
// MCP consume e2e (UI plan Task 7): connect an external MCP server through the
// /connections page (paste-config → 401 auto-detect → PAT fallback), then see
// it with a working per-user kill-switch in the AI sidebar's Connections pane.
//
// The test starts its own minimal Streamable-HTTP MCP mock (no external
// network): it answers `initialize` + `tools/list` as JSON-RPC over POST,
// 202s notifications, 405s GET/DELETE (the SDK treats both as "stream /
// session-termination unsupported" — non-fatal), and requires
// `Authorization: Bearer test-pat` (else 401) so the probe path classifies it
// as needs_auth until the PAT is saved.
import { test, expect, request as pwRequest } from "@playwright/test";
import { createServer, type Server } from "node:http";

test.use({ storageState: "e2e/.auth/user.json" });

// Seed cookie consent before any page script runs. The consent banner is
// role="dialog" (localStorage-gated), so without this an unscoped dialog
// locator strict-mode collides with it AND its fixed overlay can intercept
// clicks. Belt-and-suspenders with the name-scoped dialog locators below
// (per the documented pattern in scenario-delete-uniform.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "burnless-cookie-consent",
      JSON.stringify({
        version: "1",
        preferences: { essential: true, analytics: false, marketing: false },
        timestamp: Date.now(),
      }),
    );
  });
});

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const PAT = "test-pat";
/**
 * Unique per run AND per worker — avoids colliding with rows left by
 * earlier/failed runs, and with the parallel worker when both the `chromium`
 * and `authenticated` projects pick this spec up (their processes can load
 * the module in the same millisecond, so Date.now() alone is not enough).
 */
const NAME = `e2emcp${Date.now()}p${process.pid % 100000}`;

let mockServer: Server;
let mockPort: number;
/** Captured from the create POST so afterAll can clean the row up. */
let connectionId: string | null = null;

test.beforeAll(async () => {
  mockServer = createServer((req, res) => {
    // The SDK opens a GET SSE stream after initialize and DELETEs the session
    // on close — 405 tells it both are unsupported (per spec, non-fatal).
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      if (req.headers.authorization !== `Bearer ${PAT}`) {
        res
          .writeHead(401, { "WWW-Authenticate": 'Bearer resource_metadata="unused"' })
          .end();
        return;
      }
      let msg: { id?: number; method?: string; params?: { protocolVersion?: string } } = {};
      try {
        msg = body ? JSON.parse(body) : {};
      } catch {
        /* notifications/batches we don't care about */
      }
      const reply = (result: unknown) =>
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ jsonrpc: "2.0", id: msg.id ?? null, result }));
      if (msg.method === "initialize") {
        reply({
          // Echo the client's requested version so the SDK never rejects it.
          protocolVersion: msg.params?.protocolVersion ?? "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "mock", version: "1" },
        });
      } else if (msg.method === "tools/list") {
        reply({
          tools: [
            {
              name: "ping",
              description: "Ping",
              inputSchema: { type: "object", properties: {} },
              annotations: { readOnlyHint: true },
            },
          ],
        });
      } else {
        // notifications/initialized etc. — accepted, no body.
        res.writeHead(202).end();
      }
    });
  });
  await new Promise<void>((resolve) => mockServer.listen(0, () => resolve()));
  mockPort = (mockServer.address() as { port: number }).port;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  if (!connectionId) return;
  // API cleanup — mutations need an allowlisted Origin (middleware CSRF).
  const api = await pwRequest.newContext({
    baseURL: BASE_URL,
    storageState: "e2e/.auth/user.json",
    extraHTTPHeaders: { origin: BASE_URL },
  });
  await api.delete(`/api/mcp/connections/${connectionId}`).catch(() => {});
  await api.dispose();
});

test.describe.serial("MCP connections", () => {
  test.skip(!process.env.DATABASE_URL, "Requires DATABASE_URL");

  test("connect an MCP via paste-config + PAT and see it on the page", async ({
    page,
  }) => {
    test.setTimeout(60_000); // cold dev-server compiles can exceed the 30s default
    await page.goto("/connections");
    // Wait for the SWR-driven grid body (dashed add-card or the empty state) —
    // it only renders post-hydration, so the buttons are actually wired up.
    await expect(
      page
        .getByRole("button", { name: "Add a connection" })
        .or(page.getByText("Connect your first MCP server"))
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Add connection" }).first().click();
    // Name the dialog explicitly — the Cookie-consent banner also uses
    // role="dialog" (see scenario-delete-uniform.spec.ts for the pattern).
    const addDialog = page.getByRole("dialog", { name: "Add connection" });
    await expect(addDialog).toBeVisible();

    // Paste tab is the default — fill the config textarea.
    await page
      .getByLabel("MCP server config (JSON)")
      .fill(
        JSON.stringify({
          [NAME]: { type: "http", url: `http://127.0.0.1:${mockPort}/mcp` },
        }),
      );
    // Client-side parse preview confirms the config was understood.
    await expect(page.getByText(/Parsed —/)).toBeVisible();

    const createResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/mcp/connections") && r.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: /continue/i }).click();
    const created = await createResponse;
    expect(created.status(), "create must succeed").toBe(201);
    const createdBody = (await created.json()) as { id: string; status: string };
    connectionId = createdBody.id;
    // Mock 401s the unauthenticated probe → OAuth auto-detect (needs_auth).
    expect(createdBody.status).toBe("needs_auth");

    // Authorize step → PAT fallback.
    await expect(page.getByText("This server uses OAuth")).toBeVisible();
    await page.getByRole("button", { name: /use an access token/i }).click();
    await page.getByLabel("Access token").fill(PAT);

    const tokenResponse = page.waitForResponse(
      (r) => r.url().includes("/credentials") && r.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: /save token/i }).click();
    const token = await tokenResponse;
    expect(token.status(), "PAT save must succeed").toBe(200);
    expect(((await token.json()) as { status: string }).status).toBe("connected");

    // Modal closes; the grid revalidates and shows the connected card.
    await expect(addDialog).not.toBeVisible({ timeout: 10_000 });
    const card = page.getByTestId("connection-card").filter({ hasText: NAME });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText("Connected · token")).toBeVisible();
    await expect(card.getByText("1 tool", { exact: true })).toBeVisible(); // ping
  });

  test("AI sidebar shows the connection with a kill-switch", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/ai");
    // The credits line is SWR-fetched — its presence proves React has hydrated.
    // Clicking the pane nav before hydration only focuses the button (no
    // listener attached yet) and the pane never opens.
    await expect(page.getByText(/\/ .* credits/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Connections", exact: true }).click();
    await expect(page.getByText(NAME)).toBeVisible({ timeout: 15_000 });

    const sw = page.getByRole("switch", { name: `Use ${NAME} in chat` });
    await expect(sw).toHaveAttribute("aria-checked", "true");

    // Toggle off — optimistic flip + persisted PATCH (D11 per-user kill-switch).
    const patchOff = page.waitForResponse(
      (r) =>
        r.url().includes("/api/user-preferences") &&
        r.request().method() === "PATCH",
      { timeout: 20_000 },
    );
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    expect((await patchOff).ok(), "kill-switch PATCH must persist").toBe(true);

    // Toggle back on — leaves the account clean and proves the round-trip.
    const patchOn = page.waitForResponse(
      (r) =>
        r.url().includes("/api/user-preferences") &&
        r.request().method() === "PATCH",
      { timeout: 20_000 },
    );
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    expect((await patchOn).ok()).toBe(true);
  });
});
