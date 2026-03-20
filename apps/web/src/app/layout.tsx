import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Burnless \u2014 AI Financial Planning for Startups",
  description:
    "Manage revenue, funding, and expenses with an AI companion that helps you make smarter financial decisions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
