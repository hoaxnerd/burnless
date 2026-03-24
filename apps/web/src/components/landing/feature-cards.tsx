import {
  GitBranch,
  BarChart3,
  FileText,
  Plug,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Bottom Feature Cards — config and visuals
   ───────────────────────────────────────────── */

export const bottomFeatures = [
  {
    icon: GitBranch,
    title: "Scenario Planning",
    description: "Model any 'what if' before you commit",
    gradient: "from-accent-500/15 to-accent-400/5",
    iconColor: "text-accent-400",
    iconBg: "bg-accent-500/10 border-accent-500/20",
    visual: "branches",
  },
  {
    icon: BarChart3,
    title: "Revenue Intelligence",
    description: "MRR, ARR, churn — benchmarked",
    gradient: "from-highlight-500/15 to-highlight-400/5",
    iconColor: "text-highlight-500",
    iconBg: "bg-highlight-500/10 border-highlight-500/20",
    visual: "chart",
  },
  {
    icon: FileText,
    title: "Investor Reports",
    description: "Board decks in one click",
    gradient: "from-warning-500/15 to-brand-500/5",
    iconColor: "text-warning-400",
    iconBg: "bg-warning-500/10 border-warning-500/20",
    visual: "document",
  },
  {
    icon: Plug,
    title: "Smart Integrations",
    description: "Connect in minutes",
    gradient: "from-brand-500/15 to-success-500/5",
    iconColor: "text-brand-400",
    iconBg: "bg-brand-500/10 border-brand-500/20",
    visual: "logos",
  },
];

function BranchVisual() {
  return (
    <div className="flex items-center justify-center h-full">
      <svg width="80" height="64" viewBox="0 0 80 64" fill="none" className="text-accent-400/60">
        {/* Main trunk */}
        <path d="M40 4 L40 60" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {/* Branch left */}
        <path d="M40 20 Q30 20 22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Branch right */}
        <path d="M40 35 Q50 35 58 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Branch left 2 */}
        <path d="M40 48 Q30 48 20 42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Nodes */}
        <circle cx="40" cy="20" r="3" fill="currentColor" />
        <circle cx="40" cy="35" r="3" fill="currentColor" />
        <circle cx="40" cy="48" r="3" fill="currentColor" />
        <circle cx="22" cy="12" r="3" className="text-accent-300/80" fill="currentColor" />
        <circle cx="58" cy="28" r="3" className="text-accent-300/80" fill="currentColor" />
        <circle cx="20" cy="42" r="3" className="text-accent-300/80" fill="currentColor" />
      </svg>
    </div>
  );
}

function MiniChart() {
  const bars = [35, 42, 38, 55, 48, 65, 58, 72, 68, 80, 75, 88];
  return (
    <div className="flex items-end gap-[3px] h-full px-2 pb-1">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-all duration-500"
          style={{
            height: `${h}%`,
            background:
              i >= 8
                ? "linear-gradient(to top, #10b981, #34d399)"
                : "linear-gradient(to top, #1e3a5f, #2563eb40)",
            transitionDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

function DocumentPreview() {
  return (
    <div className="flex flex-col gap-1.5 p-2 h-full justify-center">
      <div className="h-2 w-3/4 rounded-full bg-warning-400/30" />
      <div className="h-1.5 w-full rounded-full bg-surface-200/15" />
      <div className="h-1.5 w-full rounded-full bg-surface-200/15" />
      <div className="h-1.5 w-5/6 rounded-full bg-surface-200/15" />
      <div className="mt-1.5 h-8 w-full rounded bg-surface-200/8 border border-surface-200/10" />
      <div className="h-1.5 w-full rounded-full bg-surface-200/15" />
      <div className="h-1.5 w-2/3 rounded-full bg-surface-200/15" />
    </div>
  );
}

function LogoGrid() {
  const logos = ["QB", "Xe", "Pl", "Me", "St", "Gm"];
  return (
    <div className="grid grid-cols-3 gap-1.5 p-2 h-full place-content-center">
      {logos.map((l) => (
        <div
          key={l}
          className="w-8 h-8 rounded-lg bg-surface-200/10 border border-surface-200/15 flex items-center justify-center"
        >
          <span className="text-[9px] font-bold text-surface-500 font-mono">{l}</span>
        </div>
      ))}
    </div>
  );
}

export function CardVisual({ type }: { type: string }) {
  switch (type) {
    case "branches":
      return <BranchVisual />;
    case "chart":
      return <MiniChart />;
    case "document":
      return <DocumentPreview />;
    case "logos":
      return <LogoGrid />;
    default:
      return null;
  }
}
