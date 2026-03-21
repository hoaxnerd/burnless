import type { EmailProvider } from "./types";
import { ResendProvider } from "./provider-resend";
import { ConsoleProvider } from "./provider-console";
import { SmtpProvider } from "./provider-smtp";

export type { EmailProvider, EmailMessage, SendResult } from "./types";

let _provider: EmailProvider | null = null;

/**
 * Email provider resolution:
 *   1. EMAIL_PROVIDER env var (explicit: "resend" | "smtp" | "console")
 *   2. RESEND_API_KEY → Resend
 *   3. SMTP_HOST → SMTP (Mailpit in local dev)
 *   4. Fallback → Console (logs only)
 */
function getProvider(): EmailProvider {
  if (_provider) return _provider;

  const explicit = process.env.EMAIL_PROVIDER;

  if (explicit === "smtp" || (!explicit && process.env.SMTP_HOST)) {
    _provider = new SmtpProvider();
  } else if (explicit === "resend" || (!explicit && process.env.RESEND_API_KEY)) {
    _provider = new ResendProvider();
  } else {
    _provider = new ConsoleProvider();
  }

  return _provider;
}

export const email = {
  get provider() {
    return getProvider();
  },
};
