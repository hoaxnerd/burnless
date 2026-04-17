import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { CookieConsentLoader } from "@/components/cookie-consent-loader";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://burnless.com"),
  title: "burnless — AI Financial Planning for Startups",
  description:
    "Manage revenue, funding, and expenses with a companion that helps you make smarter financial decisions.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "burnless — AI Financial Planning for Startups",
    description:
      "Manage revenue, funding, and expenses with a companion that helps you make smarter financial decisions.",
    siteName: "burnless",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "burnless — AI Financial Planning for Startups",
    description:
      "Manage revenue, funding, and expenses with a companion that helps you make smarter financial decisions.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("burnless-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div id="main-content">{children}</div>
        <Suspense fallback={null}>
          <AnalyticsProvider />
        </Suspense>
        <CookieConsentLoader />
      </body>
    </html>
  );
}
