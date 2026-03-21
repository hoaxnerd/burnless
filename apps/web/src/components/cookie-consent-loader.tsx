"use client";

import dynamic from "next/dynamic";

const CookieConsentBanner = dynamic(
  () =>
    import("@/components/cookie-consent").then((m) => ({
      default: m.CookieConsentBanner,
    })),
  { ssr: false }
);

export function CookieConsentLoader() {
  return <CookieConsentBanner />;
}
