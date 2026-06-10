/**
 * Secrets-at-rest helper — AES-256-GCM (spec §3.2).
 * Key: SECRETS_ENCRYPTION_KEY env (base64, exactly 32 bytes).
 * Blob format: "v1:<iv b64>:<authTag b64>:<ciphertext b64>".
 * Generic by design: MCP credentials first; aiApiKey/NextAuth tokens can
 * migrate later (spec §7 follow-up). Single active key in v1; rotation is a
 * documented follow-up.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

let cachedKey: Buffer | null | undefined;

function getKey(): Buffer {
  if (cachedKey === undefined) {
    const raw = process.env.SECRETS_ENCRYPTION_KEY;
    if (!raw) {
      cachedKey = null;
    } else {
      const buf = Buffer.from(raw, "base64");
      if (buf.length !== 32) {
        cachedKey = undefined;
        throw new Error("SECRETS_ENCRYPTION_KEY must be exactly 32 bytes, base64-encoded");
      }
      cachedKey = buf;
    }
  }
  if (!cachedKey) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is not set — required to store/read encrypted credentials. Generate one with: openssl rand -base64 32"
    );
  }
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM standard 96-bit nonce
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const key = getKey();
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION || !parts[1] || !parts[2] || !parts[3]) {
    throw new Error("Malformed secret blob");
  }
  const tag = Buffer.from(parts[2], "base64");
  // Pin the full 128-bit tag: setAuthTag otherwise accepts any Node-permitted GCM
  // tag length (4-16 bytes), letting an attacker with DB write access weaken
  // forgery resistance by truncating the tag (review finding, Task 1 MINOR).
  if (tag.length !== 16) {
    throw new Error("Malformed secret blob");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(blob: string): T {
  return JSON.parse(decryptSecret(blob)) as T;
}

/** Test-only: clear the cached key so env changes take effect. */
export function __resetSecretsKeyCache(): void {
  cachedKey = undefined;
}
