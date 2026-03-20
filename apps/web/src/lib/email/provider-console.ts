import type { EmailProvider, EmailMessage, SendResult } from "./types";

/**
 * Console email provider for development.
 * Logs emails to stdout instead of sending.
 */
export class ConsoleProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<SendResult> {
    const id = `dev-${Date.now()}`;
    console.warn(
      `[email:console] To: ${message.to} | Subject: ${message.subject} | ID: ${id}`
    );
    return { id };
  }
}
