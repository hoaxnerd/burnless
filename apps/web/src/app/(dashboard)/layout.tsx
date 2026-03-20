import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { DashboardShell } from "./dashboard-shell";
import { SentryUserContext } from "@/components/sentry-user-context";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user
    ? { name: session.user.name ?? null, email: session.user.email ?? null, image: session.user.image ?? null }
    : null;

  return (
    <Suspense fallback={null}>
      <SentryUserContext userId={session?.user?.id} email={session?.user?.email} />
      <DashboardShell user={user}>{children}</DashboardShell>
    </Suspense>
  );
}
