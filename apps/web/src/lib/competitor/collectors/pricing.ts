import type { Collector, ParseResult, RawCapture } from "./types";
import { httpFetch } from "./types";

interface Plan {
  name: string;
  price: { amount: number | null; currency: string | null; period: string | null };
  features: string[];
}

// Module-level regex constants (all non-global: exec() always starts at position 0).
const PRICE_RE = /([$€£]|USD|EUR|GBP)?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(month|mo|year|yr))?/i;
const H1_RE = /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i;
const PRICE_BLOCK_RE = /[$€£]\s*\d[\d.,]*\s*(?:\/\s*(?:month|mo|year|yr))?/i;
const SYMBOL_TO_CURRENCY: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP" };

function resolvePeriod(raw: string | undefined): "year" | "month" | null {
  if (!raw) return null;
  return raw.startsWith("y") ? "year" : "month";
}

function parsePrice(s: string): { amount: number | null; currency: string | null; period: string | null } {
  const m = PRICE_RE.exec(s.replaceAll(",", ""));
  if (!m) return { amount: null, currency: null, period: null };
  return {
    amount: Number(m[2]),
    currency: m[1] ? (SYMBOL_TO_CURRENCY[m[1]] ?? m[1].toUpperCase()) : null,
    period: resolvePeriod(m[3]),
  };
}

type JsonObj = Record<string, unknown>;

function jsonLdNodeToPlan(raw: unknown): Plan | null {
  if (raw == null || typeof raw !== "object") return null;
  const node = raw as JsonObj;
  if (node["@type"] !== "Product" || !node.offers) return null;
  const offersRaw = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  const offer = (offersRaw ?? {}) as JsonObj;
  return {
    name: String(node.name ?? "Plan"),
    price: {
      amount: offer.price != null ? Number(offer.price) : null,
      currency: (offer.priceCurrency as string | undefined) ?? null,
      period: null,
    },
    features: [],
  };
}

function fromJsonLd(html: string): Plan[] {
  const plans: Plan[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse((m[1] ?? "").trim()) as unknown;
      const nodes: unknown[] = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const plan = jsonLdNodeToPlan(node);
        if (plan) plans.push(plan);
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
    const name = (H1_RE.exec(b)?.[1] ?? "Plan").trim();
    const priceText = PRICE_BLOCK_RE.exec(b)?.[0];
    if (priceText) plans.push({ name, price: parsePrice(priceText), features: [] });
  }
  return plans;
}

/** A plan is "well-formed" for DOM blocks iff it has a real name (not the generic fallback) AND a numeric price. */
function isWellFormedDom(p: Plan): boolean {
  return p.name !== "Plan" && p.price.amount !== null;
}

export const pricingCollector: Collector = {
  type: "pricing",
  fetch: (source) => httpFetch(source.url),
  parse(raw: RawCapture): ParseResult {
    // JSON-LD path: keep only Products whose offer has a numeric price.
    // If JSON-LD Products were found but none have a price → 0.1 (priceless Product, e.g. Sentry-style).
    const jsonld = fromJsonLd(raw.raw);
    if (jsonld.length > 0) {
      const priced = jsonld.filter((p) => p.price.amount !== null);
      return { structured: { plans: priced }, confidence: priced.length > 0 ? 0.9 : 0.1 };
    }

    // DOM-heuristic path: keep only blocks with a real name AND a price.
    // Implausibly many well-formed plans (> 8) = noise, not a real pricing page.
    const dom = fromDomHeuristic(raw.raw);
    const wellFormed = dom.filter(isWellFormedDom);
    const confidence = wellFormed.length === 0 || wellFormed.length > 8 ? 0.1 : 0.5;
    return { structured: { plans: wellFormed }, confidence };
  },
};
