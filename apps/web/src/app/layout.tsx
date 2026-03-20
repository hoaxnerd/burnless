import type { Metadata } from "next";
import "./globals.css";
import { CookieConsentBanner } from "@/components/cookie-consent";

export const metadata: Metadata = {
  title: "Burnless — AI Financial Planning for Startups",
  description:
    "Manage revenue, funding, and expenses with an AI companion that helps you make smarter financial decisions.",
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
    title: "Burnless — AI Financial Planning for Startups",
    description:
      "Manage revenue, funding, and expenses with an AI companion that helps you make smarter financial decisions.",
    siteName: "Burnless",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Burnless — AI Financial Planning for Startups",
    description:
      "Manage revenue, funding, and expenses with an AI companion that helps you make smarter financial decisions.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
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
        <CookieConsentBanner />
      </body>
    </html>
  );
}
