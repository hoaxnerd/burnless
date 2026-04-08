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
import { getProviderForFeature, createProvider } from "@burnless/ai";
import { getAuthUser, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { checkAiFeatureAllowed, getCompanyProviderConfig } from "@/lib/ai-feature-flags";
import { getUserCompany } from "@/lib/api-helpers";
import { setTrackingCompanyId } from "@/lib/ai-usage-tracker";

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

interface EnrichedField {
  field: string;
  value: string;
  confidence: "high" | "medium" | "low";
}

interface EnrichmentResult {
  companyName: string;
  greeting: string;
  fields: EnrichedField[];
}

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
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // Step 1: Fetch the website
        send({ type: "status", message: "Analyzing website..." });

        let websiteContent = "";
        try {
          const res = await fetch(body.websiteUrl, {
            headers: {
              "User-Agent": "Burnless/1.0 (Financial Planning Tool)",
            },
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) {
            const html = await res.text();
            // Extract visible text content (strip HTML tags, limit size)
            websiteContent = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 8000);
          }
        } catch {
          // Website fetch failed — we'll work with just the URL
          send({
            type: "status",
            message: "Could not reach website, analyzing URL...",
          });
        }

        // Step 2: Use AI to analyze the company
        send({ type: "status", message: "Learning about your company..." });

        // Use company-specific provider config if available, else fall back to default routing
        const companyConfig = membership ? await getCompanyProviderConfig(membership.companyId) : undefined;
        const provider = companyConfig
          ? createProvider(companyConfig)
          : getProviderForFeature("onboarding_enrich");
        if (!provider) {
          // No AI provider configured — return empty enrichment
          send({ type: "done", result: null });
          controller.close();
          return;
        }

        const prompt = websiteContent
          ? `Analyze this company website and extract structured information.

Website URL: ${body.websiteUrl}
Website content:
${websiteContent}

Extract the following fields. For each field, provide your best guess and a confidence level (high/medium/low). If you can't determine a field, skip it.

Respond ONLY with valid JSON in this exact format:
{
  "companyName": "the company name",
  "greeting": "a short greeting under 5 words like 'Onboarding [Company Name]'",
  "fields": [
    {"field": "company_name", "value": "...", "confidence": "high"},
    {"field": "stage", "value": "one of: Pre-seed, Seed, Series A, Series B+, Bootstrapped", "confidence": "medium"},
    {"field": "business_model", "value": "one of: SaaS, Marketplace, E-commerce, Services, Hardware, Other", "confidence": "high"},
    {"field": "industry", "value": "the industry/vertical", "confidence": "high"},
    {"field": "team_size", "value": "estimated number", "confidence": "low"},
    {"field": "monthly_revenue", "value": "estimated range like $0, $10K, $50K, $100K+", "confidence": "low"},
    {"field": "funding", "value": "known funding or $0 if bootstrapped", "confidence": "low"},
    {"field": "main_expenses", "value": "likely expense categories", "confidence": "medium"}
  ]
}

Only include fields you have reasonable data for. Be concise.`
          : `I have a website URL but couldn't fetch its content: ${body.websiteUrl}

Based on the domain name alone, try to infer what you can about the company.

Respond ONLY with valid JSON:
{
  "companyName": "best guess from domain",
  "greeting": "a short greeting under 5 words like 'Onboarding [Company Name]'",
  "fields": [
    {"field": "company_name", "value": "...", "confidence": "medium"}
  ]
}

Only include fields you can reasonably infer from the domain name.`;

        const text = await provider.generateText(prompt);

        // Parse the response
        if (!text) {
          send({ type: "done", result: null });
          controller.close();
          return;
        }

        try {
          // Extract JSON from the response (may be wrapped in markdown)
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON found");

          const result: EnrichmentResult = JSON.parse(jsonMatch[0]);

          // Send greeting first
          send({
            type: "greeting",
            companyName: result.companyName,
            greeting: result.greeting,
          });

          // Stream each field with a small delay for visual effect
          for (const field of result.fields) {
            send({ type: "field", ...field });
          }

          send({ type: "done", result });
        } catch {
          send({ type: "done", result: null });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Enrichment failed";
        send({ type: "error", message });
      } finally {
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
