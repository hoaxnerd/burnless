import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCompanyForAuthUser, getDashboardPreferences } from "@/lib/data";
import { DashboardShell } from "./dashboard-shell";
import { SentryUserContext } from "@/components/sentry-user-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Email verification temporarily disabled (BUR-161)
  // if (!session.user.isEmailVerified) redirect("/verify-email");

  const company = await getCompanyForAuthUser(session.user.id!);
  if (!company) redirect("/onboarding");

  const [user, prefs] = await Promise.all([
    Promise.resolve({
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      image: session.user.image ?? null,
    }),
    getDashboardPreferences().catch(() => null),
  ]);

  const initialSlotOverrides = (prefs?.slotOverrides ?? null) as Record<string, unknown> | null;
  const initialPageLayouts = (prefs?.pageLayouts ?? null) as Record<string, unknown> | null;

  return (
    <Suspense fallback={null}>
      <SentryUserContext userId={session?.user?.id} email={session?.user?.email} />
      <DashboardShell
        user={user}
        initialSlotOverrides={initialSlotOverrides}
        initialPageLayouts={initialPageLayouts}
      >
        {children}
      </DashboardShell>
    </Suspense>
  );
}
