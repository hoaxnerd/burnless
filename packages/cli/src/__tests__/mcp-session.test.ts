import { describe, expect, it } from "vitest";
import { mcpUrlOf, openSession } from "../mcp-session";
import { startMockServer } from "./helpers/mock-server";

describe("mcpUrlOf", () => {
  it("appends /mcp and strips trailing slashes", () => {
    expect(mcpUrlOf("http://localhost:3000")).toBe("http://localhost:3000/mcp");
    expect(mcpUrlOf("https://finance.acme.dev/")).toBe("https://finance.acme.dev/mcp");
  });
});

describe("openSession", () => {
  it("lists tools, calls tools, reads resources, reports server version", async () => {
    const { clientTransport, calls } = await startMockServer();
    const session = await openSession(
      { baseUrl: "http://unused.example", token: "bl_pat_test" },
      () => clientTransport
    );

    const tools = await session.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["activate_scenario", "delete_headcount", "get_metrics"]);

    const result = await session.callTool("get_metrics", { startDate: "2026-01" });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({ mrr: 1200, runwayMonths: 14 });
    expect(calls[0]).toEqual({ name: "get_metrics", args: { startDate: "2026-01" } });

    const text = await session.readResource("burnless://reports/cap-table");
    expect(JSON.parse(text)).toEqual({ pool: 0.1 });

    expect(session.serverVersion()?.name).toBe("burnless-mock");
    await session.close();
  });

  it("exposes raw pass-through methods for the serve proxy", async () => {
    const { clientTransport } = await startMockServer();
    const session = await openSession({ baseUrl: "http://unused.example", token: "t" }, () => clientTransport);
    const rawTools = await session.listToolsRaw();
    expect(rawTools.tools.some((t) => t.name === "get_metrics")).toBe(true);
    const rawCall = await session.callToolRaw("get_metrics", {});
    expect(Array.isArray(rawCall.content)).toBe(true);
    const rawResources = await session.listResourcesRaw();
    expect(rawResources.resources[0]?.uri).toBe("burnless://reports/cap-table");
    const rawRead = await session.readResourceRaw("burnless://reports/cap-table");
    expect(rawRead.contents.length).toBe(1);
    await session.close();
  });
});
