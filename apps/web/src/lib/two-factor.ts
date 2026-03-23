/**
 * TOTP-based Two-Factor Authentication utilities.
 * Uses otplib v13 functional API for TOTP and Web Crypto for backup codes.
 */
import { generateSecret, generateURI, verifySync } from "otplib";

const APP_NAME = "Burnless";
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;

export function generateTotpSecret(): string {
  return generateSecret();
}

export function buildTotpUri(secret: string, userEmail: string): string {
  return generateURI({
    issuer: APP_NAME,
    label: userEmail,
    secret,
  });
}

export function verifyTotpCode(code: string, secret: string): boolean {
  const result = verifySync({ token: code, secret });
  return result.valid;
}

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(BACKUP_CODE_LENGTH / 2));
    codes.push(Buffer.from(bytes).toString("hex"));
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const encoder = new TextEncoder();
  const hashed: string[] = [];
  for (const code of codes) {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(code));
    hashed.push(Buffer.from(digest).toString("hex"));
  }
  return hashed;
}

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
