/**
 * GET /oauth/authorize — the consent screen (expose spec §5.2, mockup §3).
 * Validates ALL OAuth params server-side; every failure renders an error —
 * NEVER redirects to an unvalidated redirect_uri. Requires a signed-in
 * session (redirects to /login with a return url otherwise).
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOauthClientById, listCompaniesForUser } from "@burnless/db";
import { env } from "@/lib/env";
import { ConsentScreen } from "./consent-screen";

export const metadata = { title: "Authorize access — Burnless" };

const VALID_SCOPES = ["read", "write", "delete"] as const;
type Scope = (typeof VALID_SCOPES)[number];

function ConsentError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-100 p-7">
      <div className="w-full max-w-[420px] rounded-2xl border border-surface-200 bg-surface-0 p-7 shadow-xl">
        <h1 className="text-[17px] font-bold tracking-[-0.015em] text-surface-900">
          Authorization request invalid
        </h1>
        <p className="mt-2 text-[12.5px] text-surface-500">{message}</p>
        <p className="mt-4 text-[10.5px] leading-relaxed text-surface-400">
          Close this window and retry the connection from your app.
        </p>
      </div>
    </main>
  );
}

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  const clientId = str(params.client_id);
  const redirectUri = str(params.redirect_uri);
  const responseType = str(params.response_type);
  const codeChallenge = str(params.code_challenge);
  const codeChallengeMethod = str(params.code_challenge_method);
  const resource = str(params.resource);
  const state = str(params.state);
  const scopeParam = str(params.scope);

  if (!clientId || !redirectUri || !codeChallenge) {
    return <ConsentError message="Missing required OAuth parameters (client_id, redirect_uri, code_challenge)." />;
  }
  const client = await getOauthClientById(clientId);
  if (!client) return <ConsentError message="Unknown client." />;
  if (!client.redirectUris.includes(redirectUri)) {
    return <ConsentError message="redirect_uri does not match the registered value." />;
  }
  if (responseType !== "code") return <ConsentError message="Only response_type=code is supported." />;
  if (codeChallengeMethod !== "S256") return <ConsentError message="Only the S256 PKCE method is supported." />;
  if (resource !== `${env.APP_URL}/mcp`) {
    return <ConsentError message="resource must be this instance's MCP endpoint." />;
  }
  const requestedScopes = (scopeParam ? scopeParam.split(" ") : ["read"]).filter(
    (s): s is Scope => (VALID_SCOPES as readonly string[]).includes(s)
  );
  if (requestedScopes.length === 0) return <ConsentError message="No valid scopes requested." />;

  const session = await auth();
  if (!session?.user?.id) {
    const returnTo = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string") returnTo.set(k, v);
    }
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${returnTo.toString()}`)}`);
  }

  const companies = await listCompaniesForUser(session.user.id);
  if (companies.length === 0) {
    return <ConsentError message="Your account has no company — finish onboarding first." />;
  }

  return (
    <ConsentScreen
      client={{ id: client.id, name: client.name }}
      companies={companies.map((c) => ({ companyId: c.companyId, name: c.name, role: c.role }))}
      requestedScopes={requestedScopes}
      oauthParams={{
        redirectUri,
        state: state ?? null,
        codeChallenge,
        resource: resource!,
      }}
    />
  );
}
