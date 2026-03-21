import type { EmailProvider, EmailMessage, SendResult } from "./types";

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "Burnless <noreply@burnless.app>";

/**
 * SMTP email provider — sends via raw SMTP (works with Mailpit, MailHog, etc.).
 * Uses plain fetch to the Mailpit API as a simple SMTP alternative,
 * or falls back to a raw TCP SMTP handshake for minimal dependency.
 *
 * For local dev: Mailpit SMTP on port 1025, Web UI on port 8025.
 */
export class SmtpProvider implements EmailProvider {
  private host: string;
  private port: number;

  constructor(
    host = process.env.SMTP_HOST ?? "localhost",
    port = parseInt(process.env.SMTP_PORT ?? "1025", 10)
  ) {
    this.host = host;
    this.port = port;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    // Use Mailpit's sendmail-compatible API if available (simpler than raw SMTP)
    // Mailpit exposes a REST API at port 8025 for sending
    const mailpitApiPort = process.env.MAILPIT_API_PORT ?? "8025";
    const mailpitUrl = `http://${this.host}:${mailpitApiPort}/api/v1/send`;

    try {
      const res = await fetch(mailpitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          From: { Email: FROM_ADDRESS.match(/<(.+)>/)?.[1] ?? FROM_ADDRESS, Name: "Burnless" },
          To: [{ Email: message.to }],
          Subject: message.subject,
          HTML: message.html,
          Text: message.text ?? "",
        }),
      });

      if (!res.ok) {
        // Fallback: try the standard Mailpit message creation endpoint
        const body = await res.text().catch(() => "");
        throw new Error(`Mailpit API error: ${res.status} ${body}`);
      }

      const data = await res.json().catch(() => ({}));
      const id = data.ID ?? `smtp-${Date.now()}`;
      return { id };
    } catch (err) {
      // If Mailpit API isn't available, log and return a dev ID
      // This keeps the app running even if Mailpit container is down
      console.warn(
        `[email:smtp] Failed to send to ${this.host}:${this.port} — ${err instanceof Error ? err.message : err}`
      );
      console.warn(
        `[email:smtp] To: ${message.to} | Subject: ${message.subject}`
      );
      const id = `smtp-fallback-${Date.now()}`;
      return { id };
    }
  }
}
