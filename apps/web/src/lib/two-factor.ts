/**
 * TOTP-based Two-Factor Authentication utilities.
 * Pure implementation using Node.js crypto — no external dependencies.
 */
import { createHmac, randomBytes } from "crypto";

const APP_NAME = "burnless";
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;

/* ── Base32 ──────────────────────────────────────────────────────────────── */

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return result;
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/* ── TOTP Core ───────────────────────────────────────────────────────────── */

function generateHotp(secret: Buffer, counter: bigint): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(counter);

  const hmac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function getCurrentCounter(): bigint {
  return BigInt(Math.floor(Date.now() / 1000 / TOTP_PERIOD));
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/** Generate a new TOTP secret (base32-encoded). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Build an otpauth:// URI for QR code rendering. */
export function buildTotpUri(secret: string, userEmail: string): string {
  const issuer = encodeURIComponent(APP_NAME);
  const label = encodeURIComponent(`${APP_NAME}:${userEmail}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/** Verify a 6-digit TOTP code against a secret (allows ±1 period drift). */
export function verifyTotpCode(code: string, secret: string): boolean {
  const secretBuf = base32Decode(secret);
  const counter = getCurrentCounter();

  // Check current period and ±1 for clock drift
  for (let i = -1; i <= 1; i++) {
    if (generateHotp(secretBuf, counter + BigInt(i)) === code) {
      return true;
    }
  }
  return false;
}

/* ── Backup Codes ────────────────────────────────────────────────────────── */

/** Generate a set of one-time-use backup codes (plain hex strings). */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    codes.push(randomBytes(BACKUP_CODE_LENGTH / 2).toString("hex"));
  }
  return codes;
}

/**
 * Hash backup codes for storage. Each code is SHA-256 hashed so the
 * plaintext codes are never stored after initial display.
 */
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const encoder = new TextEncoder();
  const hashed: string[] = [];
  for (const code of codes) {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(code));
    hashed.push(Buffer.from(digest).toString("hex"));
  }
  return hashed;
}

/**
 * Verify a backup code against stored hashes. Returns the index of the
 * matching hash (so the caller can remove it), or -1 if no match.
 */
export async function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): Promise<number> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(code));
  const codeHash = Buffer.from(digest).toString("hex");
  for (let i = 0; i < hashedCodes.length; i++) {
    if (hashedCodes[i] === codeHash) return i;
  }
  return -1;
}
