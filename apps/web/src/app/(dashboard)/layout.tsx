import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { DashboardShell } from "./dashboard-shell";

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
      <DashboardShell user={user}>{children}</DashboardShell>
    </Suspense>
  );
}
