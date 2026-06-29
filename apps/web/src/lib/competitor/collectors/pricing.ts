import type { Collector, ParseResult, RawCapture } from "./types";
import { httpFetch } from "./types";

interface Plan {
  name: string;
  price: { amount: number | null; currency: string | null; period: string | null };
  features: string[];
}

function parsePrice(s: string): { amount: number | null; currency: string | null; period: string | null } {
  const m = s.replace(/,/g, "").match(/(\$|USD|€|EUR|£|GBP)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/\s*(mo|month|yr|year))?/i);
  const symbolToCurrency: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP" };
  if (!m) return { amount: null, currency: null, period: null };
  return {
    amount: Number(m[2]),
    currency: m[1] ? (symbolToCurrency[m[1]] ?? m[1].toUpperCase()) : null,
    period: m[3] ? (m[3].startsWith("y") ? "year" : "month") : null,
  };
}

function fromJsonLd(html: string): Plan[] {
  const plans: Plan[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse((m[1] ?? "").trim());
      for (const node of Array.isArray(data) ? data : [data]) {
        if (node && node["@type"] === "Product" && node.offers) {
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          plans.push({
            name: String(node.name ?? "Plan"),
            price: {
              amount: offer.price != null ? Number(offer.price) : null,
              currency: offer.priceCurrency ?? null,
              period: null,
            },
            features: [],
          });
        }
      }
    } catch {
      /* ignore malformed block */
    }
  }
  return plans;
}

function fromDomHeuristic(html: string): Plan[] {
  const plans: Plan[] = [];
  const blockRe = /<(?:div|section|li)[^>]*class=["'][^"']*plan[^"']*["'][\s\S]*?<\/(?:div|section|li)>/gi;
  const blocks = html.match(blockRe) ?? [];
  for (const b of blocks) {
    const name = (b.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i)?.[1] ?? "Plan").trim();
    const priceText = b.match(/(\$|€|£)\s*[0-9][0-9.,]*\s*(?:\/\s*(?:mo|month|yr|year))?/i)?.[0];
    if (priceText) plans.push({ name, price: parsePrice(priceText), features: [] });
  }
  return plans;
}

export const pricingCollector: Collector = {
  type: "pricing",
  fetch: (source) => httpFetch(source.url),
  parse(raw: RawCapture): ParseResult {
    const jsonld = fromJsonLd(raw.raw);
    if (jsonld.length > 0) return { structured: { plans: jsonld }, confidence: 0.9 };
    const dom = fromDomHeuristic(raw.raw);
    if (dom.length > 0) return { structured: { plans: dom }, confidence: 0.5 };
    return { structured: { plans: [] }, confidence: 0.1 };
  },
};
