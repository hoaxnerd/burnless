import { Resend } from "resend";
import type { EmailProvider, EmailMessage, SendResult } from "./types";

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "burnless <noreply@burnless.app>";

export class ResendProvider implements EmailProvider {
  private client: Resend;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY is required");
    }
    this.client = new Resend(key);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const { data, error } = await this.client.emails.send({
      from: FROM_ADDRESS,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }

    return { id: data?.id ?? "unknown" };
  }
}
