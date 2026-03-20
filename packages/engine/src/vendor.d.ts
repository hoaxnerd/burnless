// Ambient declarations for optional runtime-only SDKs.
// These packages are loaded via dynamic import() only when configured.

declare module "plaid" {
  export class PlaidApi {
    constructor(config: Configuration);
    linkTokenCreate(params: Record<string, unknown>): Promise<{ data: { link_token: string } }>;
    itemPublicTokenExchange(params: Record<string, unknown>): Promise<{ data: { access_token: string; item_id: string } }>;
    accountsGet(params: Record<string, unknown>): Promise<{ data: { accounts: any[]; item: { institution_id: string } } }>;
    transactionsSync(params: Record<string, unknown>): Promise<{ data: { added: any[]; next_cursor: string; has_more: boolean } }>;
    transactionsGet(params: Record<string, unknown>): Promise<{ data: { transactions: any[]; total_transactions: number } }>;
    itemRemove(params: Record<string, unknown>): Promise<void>;
  }
  export class Configuration {
    constructor(options: { basePath: string; baseOptions: { headers: Record<string, string> } });
  }
  export const PlaidEnvironments: { sandbox: string; development: string; production: string };
}

declare module "razorpay" {
  interface RazorpayInstance {
    customers: { create: (data: any) => Promise<any> };
    plans: { create: (data: any) => Promise<any> };
    subscriptions: { create: (data: any) => Promise<any>; cancel: (id: string) => Promise<any> };
  }
  class Razorpay {
    constructor(options: { key_id: string; key_secret: string });
    customers: RazorpayInstance["customers"];
    plans: RazorpayInstance["plans"];
    subscriptions: RazorpayInstance["subscriptions"];
  }
  export default Razorpay;
}

declare module "razorpay/dist/utils/razorpay-utils.js" {
  export function validateWebhookSignature(body: string, signature: string, secret: string): boolean;
}

declare module "stripe" {
  interface WebhookEvent {
    type: string;
    data: { object: unknown };
  }
  interface Subscription {
    id: string;
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: number;
  }
  interface Customer {
    id: string;
    email: string | null;
  }
  interface CheckoutSession {
    url: string | null;
  }
  class Stripe {
    constructor(key: string);
    customers: {
      create: (data: Record<string, unknown>) => Promise<Customer>;
    };
    subscriptions: {
      create: (data: Record<string, unknown>) => Promise<Subscription>;
      retrieve: (id: string) => Promise<Subscription>;
      cancel: (id: string) => Promise<Subscription>;
    };
    checkout: {
      sessions: {
        create: (data: Record<string, unknown>) => Promise<CheckoutSession>;
      };
    };
    webhooks: {
      constructEvent: (body: string, sig: string, secret: string) => WebhookEvent;
    };
  }
  export default Stripe;
}
