/**
 * Password hashing using Web Crypto API (no native deps).
 * Uses PBKDF2 with SHA-256, 100k iterations, 32-byte salt.
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(password, salt);
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const saltHex = Buffer.from(salt).toString("hex");
  const hashHex = Buffer.from(keyBytes).toString("hex");
  return `pbkdf2:${ITERATIONS}:${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;

  const iterations = parseInt(parts[1]!, 10);
  const salt = Buffer.from(parts[2]!, "hex");
  const expectedHash = parts[3]!;

  const key = await deriveKey(password, new Uint8Array(salt), iterations);
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const actualHash = Buffer.from(keyBytes).toString("hex");

  // Constant-time comparison
  if (actualHash.length !== expectedHash.length) return false;
  let result = 0;
  for (let i = 0; i < actualHash.length; i++) {
    result |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return result === 0;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations = ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH * 8 },
    true,
    ["encrypt"]
  );
}
