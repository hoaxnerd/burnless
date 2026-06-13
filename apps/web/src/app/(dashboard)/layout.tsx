import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getCompanyForAuthUser,
  getDashboardPreferences,
  isCompanyClaimed,
} from "@/lib/data";
import { DashboardShell } from "./dashboard-shell";
import { SentryUserContext } from "@/components/sentry-user-context";
import { ChatSessionProvider } from "@/components/ai/chat-session-context";
import { getCapabilities } from "@/lib/capabilities";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Email verification — cap-gated (S4a). Off on self_host (no wall); restored
  // for cloud. OAuth users auto-verify (signIn callback), so only cloud
  // credentials signups hit this. `emailVerification` auto-degrades off in S1
  // when no email provider is configured, so a misconfigured cloud instance
  // won't wall users.
  if (getCapabilities().emailVerification && !session.user.isEmailVerified) {
    redirect("/verify-email");
  }

  const company = await getCompanyForAuthUser(session.user.id!);
  // Onboarding gate — the INVERSE of the /onboarding layout guard, which must
  // stay symmetric with it (see onboarding/layout.tsx).
  //
  // Install-company ripple: on self-host (autoLogin) boot auto-creates a real
  // `companies` row + owner membership from first boot, so `company` is ALWAYS
  // truthy there and a bare `if (!company)` check is DEAD — it would let a fresh
  // self-host user land on /dashboard against an UNCLAIMED "My Company"
  // placeholder, bypassing the wizard entirely (no company claim, no AI-config
  // step, no enrich, no scaffolding: base scenario / accounts / departments /
  // aiFeatureFlags are created only by the claim path). So:
  //   - cloud (no autoLogin): no install placeholder → no company means
  //     onboarding is not done → redirect (unchanged behavior).
  //   - self-host (autoLogin): redirect when there is no company OR the install
  //     company is NOT yet CLAIMED (no base scenario). A claimed company renders
  //     the dashboard.
  if (!company) {
    redirect("/onboarding");
  } else if (getCapabilities().autoLogin && !(await isCompanyClaimed(company.id))) {
    redirect("/onboarding");
  }

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
        <ChatSessionProvider>{children}</ChatSessionProvider>
      </DashboardShell>
    </Suspense>
  );
}
