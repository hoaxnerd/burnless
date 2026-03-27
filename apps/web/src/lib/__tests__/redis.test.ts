import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock ioredis before importing redis module
vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn(),
  }));
  return { default: MockRedis };
});

describe("redis", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...savedEnv };
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("returns null when REDIS_URL is not set", async () => {
    const { getRedis } = await import("../redis");
    const client = getRedis();
    expect(client).toBeNull();
  });

  it("creates client when REDIS_URL is set", async () => {
    process.env.REDIS_URL = "redis://localhost:6380";
    const { getRedis } = await import("../redis");
    const client = getRedis();
    expect(client).not.toBeNull();
  });

  it("returns same instance on multiple calls", async () => {
    process.env.REDIS_URL = "redis://localhost:6380";
    const { getRedis } = await import("../redis");
    const client1 = getRedis();
    const client2 = getRedis();
    expect(client1).toBe(client2);
  });

  it("resetRedis clears the client", async () => {
    process.env.REDIS_URL = "redis://localhost:6380";
    const { getRedis, resetRedis } = await import("../redis");
    const client1 = getRedis();
    expect(client1).not.toBeNull();

    resetRedis();
    // After reset, a new client should be created
    const client2 = getRedis();
    expect(client2).not.toBe(client1);
  });
});
