import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCompanyForAuthUser } from "@/lib/data";

/**
 * Server guard for /onboarding (ONB-01).
 *
 * Mirrors the inverse guard in (dashboard)/layout.tsx (which redirects to
 * /onboarding when no company exists). Both gate on the SAME company-existence
 * signal — getCompanyForAuthUser — so they are mutually exclusive and never
 * form a redirect loop.
 *
 * Running here (before the client wizard mounts) means an already-onboarded
 * user never sees the wizard or fires the ~20s AI enrich call. The POST 409
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
  if (company) redirect("/dashboard");

  return <>{children}</>;
}
