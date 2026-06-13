import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCompanyForAuthUser, isCompanyClaimed } from "@/lib/data";
import { getCapabilities } from "@/lib/capabilities";

/**
 * Server guard for /onboarding (ONB-01).
 *
 * Mirrors the inverse guard in (dashboard)/layout.tsx (which redirects to
 * /onboarding when no company exists).
 *
 * Install-company ripple: on self-host (autoLogin), boot now auto-creates a
 * real `companies` row + owner membership from the first boot (so per-company
 * AI provider config works everywhere). A bare company-existence check would
 * therefore redirect self-host users straight to /dashboard and lock them out
 * of the wizard — they could never CLAIM the placeholder. So the redirect is
 * gated on CLAIMED-ness, not mere existence:
 *   - cloud (no autoLogin): no install placeholder exists → any company means
 *     onboarding is done → redirect (unchanged behavior).
 *   - self-host (autoLogin): redirect only once the install company is CLAIMED
 *     (a base scenario exists). An UNCLAIMED placeholder renders the wizard so
 *     the user can claim it.
 *
 * Running here (before the client wizard mounts) means an already-onboarded
 * user never sees the wizard or fires the AI enrich call. The POST 409
 * (ONBOARDING_ALREADY_COMPLETE) in api/onboarding/route.ts stays as
 * defense-in-depth.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const company = await getCompanyForAuthUser(session.user.id!);
  if (company) {
    // Cloud: company existence == onboarding complete. Self-host: only when the
    // install placeholder has been claimed (otherwise let the user claim it).
    const claimed = getCapabilities().autoLogin
      ? await isCompanyClaimed(company.id)
      : true;
    if (claimed) redirect("/dashboard");
  }

  return <>{children}</>;
}
