/**
 * [S5 single-binary build] No-op stub for Sentry + OpenTelemetry, aliased in for
 * the BUN_COMPILE (self-host single-binary) build ONLY. Gated on BUN_COMPILE=true
 * in next.config — the cloud build (normal webpack) keeps the REAL Sentry/OTel.
 *
 * Why: Sentry/OpenTelemetry is cloud-ops telemetry the self-host edition doesn't
 * need; next-bun-compile eagerly evals @opentelemetry/api, whose CJS module-eval
 * crashes under bun-compile (and it's the biggest reducible ~69MB chunk).
 *
 * Why CJS (.cjs): @opentelemetry/api exposes many NAMED exports (trace, context,
 * propagation, diag, createContextKey, ROOT_CONTEXT, SpanStatusCode, …). An ESM
 * default-export Proxy can't intercept `import { createContextKey } from ...`. A
 * CJS `module.exports = <Proxy>` DOES — named-destructure goes through the get
 * trap — so every OTel/Sentry symbol resolves to a recursive callable no-op.
 */
const makeNoop = () =>
  new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "__esModule") return true;
      if (prop === "default") return root;
      // Symbol access (e.g. Symbol.toPrimitive) → undefined, not a proxy.
      if (typeof prop === "symbol") return undefined;
      return makeNoop();
    },
    apply: () => undefined,
    construct: () => ({}),
  });

const root = makeNoop();
module.exports = root;
