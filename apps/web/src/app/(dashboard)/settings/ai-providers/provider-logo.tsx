import type { ProviderKind } from "@burnless/ai";

/** Per-vendor brand colors (external brands — no design token; mirrors the mockup .logo.* swatches). */
const LOGO: Record<string, { bg: string; label: string }> = {
  anthropic: { bg: "#d97757", label: "A" },
  openai: { bg: "#10a37f", label: "O" },
  openrouter: { bg: "#6566f1", label: "OR" },
  ollama: { bg: "#374151", label: "Ol" },
  google: { bg: "#4285f4", label: "G" },
  mistral: { bg: "#ff7000", label: "M" },
  groq: { bg: "#f55036", label: "Gq" },
  "openai-compatible": { bg: "#6b7280", label: "+" },
};

export function ProviderLogo({ kind, size = 34 }: { kind: string; size?: number }) {
  const l = LOGO[kind] ?? LOGO["openai-compatible"]!;
  return (
    <div
      className="flex items-center justify-center rounded-[9px] font-bold text-white shrink-0"
      style={{ height: size, width: size, background: l.bg, fontSize: 13 }}
      aria-hidden
    >
      {l.label}
    </div>
  );
}
