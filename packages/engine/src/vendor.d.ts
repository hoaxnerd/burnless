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

// stripe: types provided by the `stripe` npm package (devDependency)
