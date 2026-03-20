/**
 * Provider-agnostic email types.
 * Swap Resend for any provider by implementing EmailProvider.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  id: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
}
