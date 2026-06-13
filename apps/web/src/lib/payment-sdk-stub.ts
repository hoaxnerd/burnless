/**
 * [S5 single-binary build] Stub for the optional payment SDKs (razorpay/plaid)
 * that are NOT installed in the base repo. The single-binary build is the
 * SELF-HOST distribution, where billing is off (`billing`/`planEnforcement`
 * capabilities are disabled), so the payment code paths in
 * `@burnless/engine/payments.ts` are never reached at runtime. Turbopack (which
 * next-bun-compile requires) hard-fails when it can't resolve the absent module,
 * so the BUN_COMPILE build aliases these imports to this stub.
 *
 * Cloud is unaffected: it uses the normal (webpack) build with the real SDKs
 * installed; this alias is gated on BUN_COMPILE=true in next.config.
 *
 * If a self-host operator DID enable billing without installing the SDK, the
 * Proxy throws a clear error instead of a cryptic undefined access.
 */
const handler: ProxyHandler<Record<string, unknown>> = {
  get() {
    throw new Error(
      "Payment SDK (razorpay/plaid) is not bundled in the self-host single binary. " +
        "Billing is a cloud-only capability; install the SDK and use the standard build to enable it.",
    );
  },
  construct() {
    throw new Error(
      "Payment SDK (razorpay/plaid) is not bundled in the self-host single binary. " +
        "Billing is a cloud-only capability.",
    );
  },
};

const stub = new Proxy(function () {} as unknown as Record<string, unknown>, handler);

export default stub;
export const verifyWebhookSignature = () => {
  throw new Error("Payment SDK not bundled in the self-host single binary.");
};
