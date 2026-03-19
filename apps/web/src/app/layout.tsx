import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Burnless — AI Financial Planning for Startups",
  description:
    "Manage revenue, funding, and expenses with an AI companion that helps you make smarter financial decisions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
