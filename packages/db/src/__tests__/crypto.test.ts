import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  encryptJson,
  decryptJson,
  __resetSecretsKeyCache,
} from "../crypto";

// 32 bytes, base64 — test-only key.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const ORIGINAL = process.env.SECRETS_ENCRYPTION_KEY;

describe("secrets crypto (AES-256-GCM)", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = TEST_KEY;
    __resetSecretsKeyCache();
  });
  afterAll(() => {
    process.env.SECRETS_ENCRYPTION_KEY = ORIGINAL;
    __resetSecretsKeyCache();
  });

  it("round-trips a string", () => {
    const blob = encryptSecret("sk-super-secret");
    expect(blob).toMatch(/^v1:/);
    expect(blob).not.toContain("sk-super-secret");
    expect(decryptSecret(blob)).toBe("sk-super-secret");
  });

  it("produces a different blob each call (random IV)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("round-trips JSON", () => {
    const secret = { accessToken: "at", refreshToken: "rt", expiresAt: "2026-07-01T00:00:00Z" };
    expect(decryptJson(encryptJson(secret))).toEqual(secret);
  });

  it("rejects tampered ciphertext (auth tag)", () => {
    const blob = encryptSecret("payload");
    const parts = blob.split(":");
    // flip a char in the ciphertext segment
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects malformed blobs", () => {
    expect(() => decryptSecret("not-a-blob")).toThrow(/Malformed/);
    expect(() => decryptSecret("v2:a:b:c")).toThrow(/Malformed/);
  });

  it("throws a clear error when the key is missing", () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    __resetSecretsKeyCache();
    expect(() => encryptSecret("x")).toThrow(/SECRETS_ENCRYPTION_KEY/);
  });

  it("throws when the key is not 32 bytes", () => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    __resetSecretsKeyCache();
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});
