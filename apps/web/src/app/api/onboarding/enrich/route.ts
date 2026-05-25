/**
 * POST /api/onboarding/enrich — AI-powered company enrichment from website URL.
 *
 * Takes a website URL, uses the configured LLM provider to analyze the company,
 * and streams back enriched data fields. Each field arrives as it's discovered,
 * allowing the UI to progressively fill in the onboarding form.
 *
 * Provider-agnostic: works with any registered AI provider.
 * Falls back gracefully if the provider isn't configured or AI is disabled.
 */

import { z } from "zod";
import { getAuthUser, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { checkAiFeatureAllowed } from "@/lib/ai-feature-flags";
import { getUserCompany } from "@/lib/api-helpers";
import { setTrackingCompanyId } from "@/lib/ai-usage-tracker";
import { runOnboardingAgent } from "@/lib/onboarding-agent";

const enrichSchema = z.object({
  websiteUrl: z
    .string()
    .min(1, "Website URL is required")
    .transform((url) => {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return `https://${url}`;
      }
      return url;
    }),
});

export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "ai");
  if (blocked) return blocked;

  const user = await getAuthUser();
  if (!user?.id) return errorResponse("Please sign in to continue", 401);

  let body: z.infer<typeof enrichSchema>;
  try {
    body = enrichSchema.parse(await request.json());
  } catch {
    return errorResponse("Please provide a valid website URL", 400);
  }

  // Check if user already has a company (to decide if we need to check AI flags)
  const membership = await getUserCompany(user.id);
  if (membership) {
    setTrackingCompanyId(membership.companyId);
    const aiCheck = await checkAiFeatureAllowed(membership.companyId, "onboarding");
    if (!aiCheck.allowed) {
      return errorResponse(aiCheck.reason ?? "AI onboarding is disabled", 403);
    }
  }

  // Stream the enrichment results
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let pingInterval: NodeJS.Timeout | undefined;
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // stream might be closed
        }
      };

      try {
        // Send a ping/heartbeat every 5 seconds to keep the connection alive
        pingInterval = setInterval(() => {
          send({ type: "ping" });
        }, 5000);

        // Run the agent loop
        const agentResult = await runOnboardingAgent(body.websiteUrl, user.id, (statusMessage) => {
          send({ type: "status", message: statusMessage });
        });

        // Send greeting
        send({
          type: "greeting",
          companyName: agentResult.companyName,
          greeting: `Onboarding ${agentResult.companyName}`,
        });

        // Derivations for basic company fields
        const totalFunding = agentResult.fundingRounds.reduce((acc, r) => acc + r.amount, 0);
        const totalHeadcount = agentResult.headcount.length;
        const totalMonthlyRevenue = agentResult.revenueStreams.reduce((acc, r) => acc + (r.amount * r.quantity), 0);
        const mainExpensesSummary = agentResult.expenses.map(e => e.name).slice(0, 3).join(", ") || "General operations";

        const basicFields = [
          { field: "company_name", value: agentResult.companyName, confidence: "high" },
          { field: "stage", value: agentResult.stage || "Pre-seed", confidence: "high" },
          { field: "business_model", value: agentResult.businessModel || "SaaS", confidence: "high" },
          { field: "industry", value: agentResult.industry || "Software & SaaS", confidence: "high" },
          { field: "team_size", value: String(totalHeadcount), confidence: "high" },
          { field: "monthly_revenue", value: String(totalMonthlyRevenue), confidence: "high" },
          { field: "funding", value: String(totalFunding), confidence: "high" },
          { field: "main_expenses", value: mainExpensesSummary, confidence: "high" },
        ];

        // Send basic fields so existing UI parses them cleanly
        for (const f of basicFields) {
          send({ type: "field", ...f });
        }

        // Send complex arrays
        send({ type: "founders", value: agentResult.founders });
        send({ type: "funding_rounds", value: agentResult.fundingRounds });
        send({ type: "headcount", value: agentResult.headcount });
        send({ type: "expenses", value: agentResult.expenses });
        send({ type: "revenue_streams", value: agentResult.revenueStreams });

        send({ type: "done", result: agentResult });
      } catch (err: unknown) {
        send({
          type: "agent_failed",
          message: err instanceof Error ? err.message : "Onboarding agent failed",
          recoverable: true,
        });
      } finally {
        if (pingInterval) clearInterval(pingInterval);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
