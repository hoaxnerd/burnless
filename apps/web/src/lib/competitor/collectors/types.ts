import type { StructuredPayload } from "@burnless/engine";

export interface RawCapture {
  contentType: string;
  raw: string;
  fetchedAt: Date;
  status: number;
}

export interface ParseResult {
  structured: StructuredPayload;
  confidence: number;
}

export interface CollectorSource {
  id: string;
  type: string;
  url: string;
  config?: unknown;
}

export interface Collector {
  type: string;
  fetch(source: CollectorSource): Promise<RawCapture>;
  parse(raw: RawCapture, source: CollectorSource): ParseResult;
}

export async function httpFetch(url: string): Promise<RawCapture> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "BurnlessCompetitorBot/1.0 (+https://burnless.ai)" },
    });
    const raw = await res.text();
    return {
      contentType: res.headers.get("content-type") ?? "text/html",
      raw,
      fetchedAt: new Date(),
      status: res.status,
    };
  } finally {
    clearTimeout(timer);
  }
}
