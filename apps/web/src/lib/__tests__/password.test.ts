import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("password", () => {
  describe("hashPassword", () => {
    it("produces a pbkdf2 hash string", async () => {
      const hash = await hashPassword("testpassword");
      expect(hash).toMatch(/^pbkdf2:\d+:[a-f0-9]+:[a-f0-9]+$/);
    });

    it("uses 100000 iterations", async () => {
      const hash = await hashPassword("test");
      const parts = hash.split(":");
      expect(parts[1]).toBe("100000");
    });

    it("generates unique salts (no two hashes are the same)", async () => {
      const hash1 = await hashPassword("samepassword");
      const hash2 = await hashPassword("samepassword");
      expect(hash1).not.toBe(hash2);
    });

    it("produces 32-byte salt (64 hex chars)", async () => {
      const hash = await hashPassword("test");
      const salt = hash.split(":")[2]!;
      expect(salt).toHaveLength(64);
    });

    it("produces 32-byte key (64 hex chars)", async () => {
      const hash = await hashPassword("test");
      const key = hash.split(":")[3]!;
      expect(key).toHaveLength(64);
    });
  });

  describe("verifyPassword", () => {
    it("verifies correct password", async () => {
      const hash = await hashPassword("correcthorse");
      const result = await verifyPassword("correcthorse", hash);
      expect(result).toBe(true);
    });

    it("rejects wrong password", async () => {
      const hash = await hashPassword("correcthorse");
      const result = await verifyPassword("wrongpassword", hash);
      expect(result).toBe(false);
    });

    it("rejects invalid stored hash format", async () => {
      expect(await verifyPassword("test", "invalid")).toBe(false);
      expect(await verifyPassword("test", "not:a:valid:format:extra")).toBe(false);
      expect(await verifyPassword("test", "")).toBe(false);
    });

    it("rejects non-pbkdf2 prefix", async () => {
      const result = await verifyPassword("test", "bcrypt:100000:salt:hash");
      expect(result).toBe(false);
    });

    it("handles empty password", async () => {
      const hash = await hashPassword("");
      expect(await verifyPassword("", hash)).toBe(true);
      expect(await verifyPassword("notempty", hash)).toBe(false);
    });

    it("handles unicode passwords", async () => {
      const hash = await hashPassword("p@$$wörd🔑");
      expect(await verifyPassword("p@$$wörd🔑", hash)).toBe(true);
      expect(await verifyPassword("p@$$word", hash)).toBe(false);
    });

    it("handles long passwords", async () => {
      const long = "a".repeat(1000);
      const hash = await hashPassword(long);
      expect(await verifyPassword(long, hash)).toBe(true);
      expect(await verifyPassword(long + "b", hash)).toBe(false);
    });
  });
});
