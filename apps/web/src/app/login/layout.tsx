import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — burnless",
  description:
    "Sign in to burnless to manage your startup finances with AI-powered insights.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
