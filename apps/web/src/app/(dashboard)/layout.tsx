import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { DashboardShell } from "./dashboard-shell";
import { SentryUserContext } from "@/components/sentry-user-context";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isEmailVerified) redirect("/verify-email");

  const company = await getCompany();
  if (!company) redirect("/onboarding");

  const user = {
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };

  return (
    <Suspense fallback={null}>
      <SentryUserContext userId={session?.user?.id} email={session?.user?.email} />
      <DashboardShell user={user}>{children}</DashboardShell>
    </Suspense>
  );
}
