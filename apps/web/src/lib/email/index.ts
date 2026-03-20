import type { EmailProvider } from "./types";
import { ResendProvider } from "./provider-resend";
import { ConsoleProvider } from "./provider-console";

export type { EmailProvider, EmailMessage, SendResult } from "./types";

let _provider: EmailProvider | null = null;

function getProvider(): EmailProvider {
  if (_provider) return _provider;

  if (process.env.RESEND_API_KEY) {
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
