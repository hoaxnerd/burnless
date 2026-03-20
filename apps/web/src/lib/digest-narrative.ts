/**
 * AI narrative generation for the Monday Morning CFO digest.
 * Uses the non-streaming chat() function from @burnless/ai.
 * Falls back to deterministic summary when AI is disabled.
 */

import { chat } from "@burnless/ai";
import type { DigestMetrics } from "./compute-digest";
import { buildDeterministicSummary } from "./compute-digest";
import { getAiFlags, checkAiFeatureAllowed } from "./ai-feature-flags";

const DIGEST_SYSTEM_PROMPT = `You are the CFO of a startup. Write a concise weekly financial briefing for the founder.

Rules:
- Be direct and data-driven. No filler.
- Lead with the most important insight.
- Use plain numbers (e.g., "$42k" not "forty-two thousand dollars").
- Highlight changes: what went up, what went down, why it matters.
- If runway is concerning (<6 months), lead with that.
- If there are anomalies, call them out clearly.
- End with 1-2 actionable recommendations.
- Keep it under 200 words.
- Do NOT use greetings or sign-offs. Just the briefing.`;

export async function generateDigestNarrative(
  companyId: string,
  metrics: DigestMetrics
): Promise<string | null> {
  const { allowed } = await checkAiFeatureAllowed(companyId, "weeklyDigest");
  if (!allowed) return null;

  const deterministic = buildDeterministicSummary(metrics);

  try {
    const result = await chat({
      messages: [
        {
          role: "user",
          content: `Here are this week's financial metrics for the weekly briefing:\n\n${deterministic}\n\nWrite a concise narrative briefing based on these numbers. Focus on what changed and what actions to take.`,
        },
      ],
      financialContext: deterministic,
      feature: "weekly_digest",
    });

    return result.response;
  } catch {
    // AI failure is non-fatal — caller uses deterministic summary
    return null;
  }
}
