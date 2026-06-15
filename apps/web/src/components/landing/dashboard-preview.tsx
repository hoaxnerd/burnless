import {
  BarChart3,
  ChevronUp,
  Clock,
  Flame,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  Landmark,
  Plug,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

/* Static dashboard preview panel — pixel port of the "Dashboard preview" section
   of the approved landing mockup. Pure server component, no hooks. Data-viz
   (KPI sparklines + the two mini charts) stays as inline <svg> with literal viz
   hex (matches how recharts renders), everything else maps to semantic tokens so
   dark mode flips. */

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Sparkles, label: "Companion", ai: true },
  { icon: Receipt, label: "Expenses" },
  { icon: TrendingUp, label: "Revenue" },
  { icon: Landmark, label: "Funding" },
  { icon: Users, label: "Team" },
  { icon: GitBranch, label: "Scenarios" },
  { icon: FolderOpen, label: "Data Room" },
  { icon: Plug, label: "Connections" },
  { icon: Clock, label: "Automations" },
];

export function DashboardPreview() {
  return (
    <section
      id="product"
      className="mx-auto max-w-[1120px] px-4 pb-16 pt-4 sm:px-6 sm:pt-6 md:pb-24 lg:px-8"
    >
      {/* dash-cap */}
      <div className="mb-[1.1rem] flex items-center justify-center gap-[0.55rem] text-[0.82rem] text-surface-500">
        <span className="inline-flex items-center gap-[0.4rem] font-semibold text-success-700">
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-success-500" />
          Live
        </span>
        {" — your model, always current"}
      </div>

      {/* app */}
      <div className="relative flex overflow-hidden rounded-[22px] border border-surface-200 bg-surface-100 shadow-2xl">
        {/* app-side */}
        <aside className="hidden w-[200px] flex-none p-[0.7rem] lg:block">
          <div className="flex h-full flex-col rounded-2xl border border-surface-200/70 bg-surface-0 p-[0.65rem]">
            {/* side-brand */}
            <div className="flex items-center gap-[0.45rem] px-[0.4rem] pb-[0.6rem] pt-[0.3rem] text-[0.92rem] font-bold tracking-[-0.02em]">
              <BrandLogo className="h-[22px] w-[22px]" />
              burnless
            </div>

            {/* side-search */}
            <div className="mb-2 flex items-center gap-2 rounded-[10px] border border-surface-200 bg-surface-50 px-[0.6rem] py-[0.45rem] text-[0.78rem] text-surface-400">
              <Search className="h-[14px] w-[14px]" />
              Search
              <kbd className="ml-auto rounded-[5px] bg-surface-100 px-[0.3rem] py-[0.05rem] font-mono text-[0.66rem]">
                ⌘K
              </kbd>
            </div>

            {/* side-nav */}
            <nav className="flex flex-1 flex-col gap-[0.1rem]">
              {navItems.map(({ icon: Icon, label, active, ai }) => (
                <div
                  key={label}
                  className={
                    active
                      ? "flex items-center gap-[0.6rem] rounded-[10px] bg-brand-50 px-[0.55rem] py-[0.4rem] text-[0.78rem] font-medium text-brand-700 shadow-sm"
                      : ai
                        ? "flex items-center gap-[0.6rem] rounded-[10px] border border-accent-500/15 bg-gradient-to-r from-accent-500/10 to-transparent px-[0.55rem] py-[0.4rem] text-[0.78rem] font-medium text-accent-700"
                        : "flex items-center gap-[0.6rem] rounded-[10px] px-[0.55rem] py-[0.4rem] text-[0.78rem] font-medium text-surface-600"
                  }
                >
                  <Icon
                    className={
                      active
                        ? "h-[15px] w-[15px] flex-none text-brand-600"
                        : ai
                          ? "h-[15px] w-[15px] flex-none text-accent-500"
                          : "h-[15px] w-[15px] flex-none text-surface-400"
                    }
                  />
                  {label}
                </div>
              ))}
            </nav>

            {/* side-foot */}
            <div className="mt-2 flex items-center gap-[0.55rem] border-t border-surface-100 pt-[0.6rem]">
              <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-[0.7rem] font-bold text-white">
                M
              </div>
              <div>
                <div className="text-[0.74rem] font-semibold leading-[1.15] text-surface-900">
                  Maya Chen
                </div>
                <div className="text-[0.62rem] text-surface-400">maya@acmesaas.com</div>
              </div>
            </div>
          </div>
        </aside>

        {/* app-main */}
        <div className="min-w-0 flex-1 bg-surface-50 p-[0.8rem] sm:p-[1.15rem]">
          {/* kpis */}
          <div className="grid grid-cols-2 gap-[0.7rem] md:grid-cols-4">
            {/* Cash */}
            <div className="relative overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 p-[0.9rem]">
              <div className="mb-[0.55rem] flex items-center justify-between">
                <span className="flex items-center gap-[0.4rem] text-[0.66rem] font-medium uppercase tracking-[0.06em] text-surface-400">
                  <Wallet className="h-[15px] w-[15px] text-success-500" />
                  Cash
                </span>
                <span className="hidden md:block">
                  <svg width="64" height="26" viewBox="0 0 80 32">
                    <path
                      d="M0,30 C1.9,29.4 7.6,27.7 11.4,26.3 C15.2,24.9 19.1,23.2 22.9,21.6 C26.7,20 30.5,18.2 34.3,16.8 C38.1,15.4 41.9,14.4 45.7,13.2 C49.5,12 53.3,10.6 57.1,9.5 C60.9,8.4 64.8,7.5 68.6,6.6 C72.4,5.7 78.1,4.4 80,4 L80,32 L0,32Z"
                      fill="rgba(16,185,129,.14)"
                    />
                    <path
                      d="M0,30 C1.9,29.4 7.6,27.7 11.4,26.3 C15.2,24.9 19.1,23.2 22.9,21.6 C26.7,20 30.5,18.2 34.3,16.8 C38.1,15.4 41.9,14.4 45.7,13.2 C49.5,12 53.3,10.6 57.1,9.5 C60.9,8.4 64.8,7.5 68.6,6.6 C72.4,5.7 78.1,4.4 80,4"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </div>
              <div className="text-[1.45rem] font-bold leading-none tracking-[-0.02em] text-surface-900 tabular-nums">
                $773.5K
              </div>
              <div className="mt-2 flex items-center gap-[0.35rem] text-[0.7rem] font-semibold">
                <span className="text-success-600">▲ 6.1%</span>
                <span className="font-normal text-surface-400">vs last mo</span>
              </div>
            </div>

            {/* Net burn */}
            <div className="relative overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 p-[0.9rem]">
              <div className="mb-[0.55rem] flex items-center justify-between">
                <span className="flex items-center gap-[0.4rem] text-[0.66rem] font-medium uppercase tracking-[0.06em] text-surface-400">
                  <Flame className="h-[15px] w-[15px] text-orange-500" />
                  Net burn
                </span>
                <span className="hidden md:block">
                  <svg width="64" height="26" viewBox="0 0 80 32">
                    <path
                      d="M0,4 C1.9,4.8 7.6,7 11.4,8.5 C15.2,10.1 19.1,11.8 22.9,13.3 C26.7,14.8 30.5,16.2 34.3,17.7 C38.1,19.2 41.9,20.8 45.7,22.2 C49.5,23.6 53.3,24.8 57.1,25.9 C60.9,26.9 64.8,27.8 68.6,28.5 C72.4,29.2 78.1,29.8 80,30 L80,32 L0,32Z"
                      fill="rgba(16,185,129,.14)"
                    />
                    <path
                      d="M0,4 C1.9,4.8 7.6,7 11.4,8.5 C15.2,10.1 19.1,11.8 22.9,13.3 C26.7,14.8 30.5,16.2 34.3,17.7 C38.1,19.2 41.9,20.8 45.7,22.2 C49.5,23.6 53.3,24.8 57.1,25.9 C60.9,26.9 64.8,27.8 68.6,28.5 C72.4,29.2 78.1,29.8 80,30"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </div>
              <div className="text-[1.45rem] font-bold leading-none tracking-[-0.02em] text-surface-900 tabular-nums">
                $42.5K
              </div>
              <div className="mt-2 flex items-center gap-[0.35rem] text-[0.7rem] font-semibold">
                <span className="text-success-600">▼ 12%</span>
                <span className="font-normal text-surface-400">vs last mo</span>
              </div>
            </div>

            {/* Runway */}
            <div className="relative overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 p-[0.9rem]">
              <div className="mb-[0.55rem] flex items-center justify-between">
                <span className="flex items-center gap-[0.4rem] text-[0.66rem] font-medium uppercase tracking-[0.06em] text-surface-400">
                  <Clock className="h-[15px] w-[15px] text-brand-500" />
                  Runway
                </span>
                <span className="hidden md:block">
                  <svg width="64" height="26" viewBox="0 0 80 32">
                    <path
                      d="M0,30 C1.9,29.3 7.6,27.3 11.4,25.8 C15.2,24.3 19.1,22.5 22.9,20.8 C26.7,19.1 30.5,17.1 34.3,15.7 C38.1,14.3 41.9,13.5 45.7,12.4 C49.5,11.3 53.3,10 57.1,9 C60.9,8 64.8,7.3 68.6,6.5 C72.4,5.7 78.1,4.4 80,4 L80,32 L0,32Z"
                      fill="rgba(59,130,246,.14)"
                    />
                    <path
                      d="M0,30 C1.9,29.3 7.6,27.3 11.4,25.8 C15.2,24.3 19.1,22.5 22.9,20.8 C26.7,19.1 30.5,17.1 34.3,15.7 C38.1,14.3 41.9,13.5 45.7,12.4 C49.5,11.3 53.3,10 57.1,9 C60.9,8 64.8,7.3 68.6,6.5 C72.4,5.7 78.1,4.4 80,4"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </div>
              <div className="text-[1.45rem] font-bold leading-none tracking-[-0.02em] text-surface-900 tabular-nums">
                18.2 mo
              </div>
              <div className="mt-2 flex items-center gap-[0.35rem] text-[0.7rem] font-semibold">
                <span className="text-success-600">▲ 1.4</span>
                <span className="font-normal text-surface-400">vs last mo</span>
              </div>
            </div>

            {/* MRR */}
            <div className="relative overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 p-[0.9rem]">
              <div className="mb-[0.55rem] flex items-center justify-between">
                <span className="flex items-center gap-[0.4rem] text-[0.66rem] font-medium uppercase tracking-[0.06em] text-surface-400">
                  <TrendingUp className="h-[15px] w-[15px] text-accent-500" />
                  MRR
                </span>
                <span className="hidden md:block">
                  <svg width="64" height="26" viewBox="0 0 80 32">
                    <path
                      d="M0,30 C1.9,29.4 7.6,27.5 11.4,26.2 C15.2,24.9 19.1,23.9 22.9,22.4 C26.7,20.9 30.5,18.9 34.3,17.3 C38.1,15.7 41.9,14.2 45.7,12.9 C49.5,11.6 53.3,10.8 57.1,9.7 C60.9,8.6 64.8,7.5 68.6,6.5 C72.4,5.5 78.1,4.4 80,4 L80,32 L0,32Z"
                      fill="rgba(124,58,237,.14)"
                    />
                    <path
                      d="M0,30 C1.9,29.4 7.6,27.5 11.4,26.2 C15.2,24.9 19.1,23.9 22.9,22.4 C26.7,20.9 30.5,18.9 34.3,17.3 C38.1,15.7 41.9,14.2 45.7,12.9 C49.5,11.6 53.3,10.8 57.1,9.7 C60.9,8.6 64.8,7.5 68.6,6.5 C72.4,5.5 78.1,4.4 80,4"
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </div>
              <div className="text-[1.45rem] font-bold leading-none tracking-[-0.02em] text-surface-900 tabular-nums">
                $28.3K
              </div>
              <div className="mt-2 flex items-center gap-[0.35rem] text-[0.7rem] font-semibold">
                <span className="text-success-600">▲ 8%</span>
                <span className="font-normal text-surface-400">vs last mo</span>
              </div>
            </div>
          </div>

          {/* insights */}
          <div className="mt-[0.7rem] overflow-hidden rounded-[18px] border border-surface-200 bg-surface-0">
            <div className="flex items-center justify-between px-[0.85rem] py-[0.6rem]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-[14px] w-[14px] text-brand-400" />
                <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-surface-400">
                  AI Insights
                </span>
                <span className="text-[0.62rem] text-surface-300">· 2m ago</span>
              </div>
              <div className="flex items-center gap-[0.45rem] text-surface-400">
                <RefreshCw className="h-[14px] w-[14px]" />
                <ChevronUp className="h-[14px] w-[14px]" />
              </div>
            </div>
            <div className="flex flex-col gap-2 px-[0.85rem] pb-[0.85rem]">
              {/* critical */}
              <div className="flex items-start gap-[0.7rem] rounded-[14px] border border-danger-500/20 bg-danger-500/5 px-[0.8rem] py-[0.7rem]">
                <span className="mt-[0.05rem] flex-none">
                  <ShieldAlert className="h-4 w-4 text-danger-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.8rem] font-semibold leading-[1.3] text-surface-900">
                    Hiring 3 engineers would drop runway to 9.7 months
                  </div>
                  <p className="mt-[0.22rem] text-[0.735rem] leading-[1.5] text-surface-600">
                    The plan you&apos;re modelling adds{" "}
                    <b className="font-mono font-semibold text-surface-900">+$37.5K/mo</b>, pushing
                    net burn to <b className="font-mono font-semibold text-surface-900">$80K</b> and
                    runway below your 12-month floor. Hire 2, defer 1 to hold{" "}
                    <b className="font-mono font-semibold text-surface-900">11.5 mo</b>.
                  </p>
                </div>
                <span className="mt-[0.32rem] h-2 w-2 flex-none rounded-full bg-danger-500" />
              </div>

              {/* warning */}
              <div className="flex items-start gap-[0.7rem] rounded-[14px] border border-warning-500/[0.22] bg-warning-500/[0.06] px-[0.8rem] py-[0.7rem]">
                <span className="mt-[0.05rem] flex-none">
                  <BarChart3 className="h-4 w-4 text-warning-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.8rem] font-semibold leading-[1.3] text-surface-900">
                    Cloud spend jumped 38% this month
                  </div>
                  <p className="mt-[0.22rem] text-[0.735rem] leading-[1.5] text-surface-600">
                    AWS rose{" "}
                    <b className="font-mono font-semibold text-surface-900">$3.2K → $4.4K</b> —
                    likely a new service. That&apos;s{" "}
                    <b className="font-mono font-semibold text-surface-900">~$14K/yr</b> if it
                    sticks. Want me to break it down by resource?
                  </p>
                </div>
                <span className="mt-[0.32rem] h-2 w-2 flex-none rounded-full bg-warning-500" />
              </div>
            </div>
          </div>

          {/* chart-duo */}
          <div className="mt-[0.7rem] grid grid-cols-1 gap-[0.7rem] sm:grid-cols-2">
            {/* MRR mini */}
            <div className="rounded-2xl border border-surface-200 bg-surface-0 px-[0.85rem] pb-[0.85rem] pt-[0.75rem]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[0.72rem] font-semibold text-surface-900">MRR</span>
                <span className="font-mono text-[0.64rem] font-semibold text-accent-600">
                  ▲ 8% MoM
                </span>
              </div>
              <svg
                viewBox="0 0 280 96"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="block h-auto w-full"
              >
                <defs>
                  <linearGradient id="mrrg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity=".16" />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity=".01" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="32" x2="280" y2="32" stroke="#f1f3f5" strokeDasharray="3 3" />
                <line x1="0" y1="64" x2="280" y2="64" stroke="#f1f3f5" strokeDasharray="3 3" />
                <path
                  d="M0.0,92.0 C5.2,90.3 20.7,85.7 31.1,81.8 C41.5,77.9 51.8,72.8 62.2,68.7 C72.6,64.6 82.9,60.4 93.3,57.0 C103.7,53.6 114.0,51.7 124.4,48.3 C134.8,44.9 145.2,40.2 155.6,36.6 C166.0,33.0 176.3,29.3 186.7,26.4 C197.1,23.5 207.4,21.5 217.8,19.1 C228.2,16.7 238.5,14.0 248.9,11.8 C259.3,9.6 274.8,7.0 280.0,6.0 L280,96 L0,96 Z"
                  fill="url(#mrrg)"
                />
                <path
                  d="M0.0,92.0 C5.2,90.3 20.7,85.7 31.1,81.8 C41.5,77.9 51.8,72.8 62.2,68.7 C72.6,64.6 82.9,60.4 93.3,57.0 C103.7,53.6 114.0,51.7 124.4,48.3 C134.8,44.9 145.2,40.2 155.6,36.6 C166.0,33.0 176.3,29.3 186.7,26.4 C197.1,23.5 207.4,21.5 217.8,19.1 C228.2,16.7 238.5,14.0 248.9,11.8 C259.3,9.6 274.8,7.0 280.0,6.0"
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* Revenue vs Expenses mini */}
            <div className="rounded-2xl border border-surface-200 bg-surface-0 px-[0.85rem] pb-[0.85rem] pt-[0.75rem]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[0.72rem] font-semibold text-surface-900">
                  Revenue vs Expenses
                </span>
                <span className="font-mono text-[0.64rem] font-semibold text-success-600">
                  net burn ▼12%
                </span>
              </div>
              <svg viewBox="0 0 280 96" aria-hidden="true" className="block h-auto w-full">
                <line x1="0" y1="48" x2="280" y2="48" stroke="#f1f3f5" strokeDasharray="3 3" />
                <line x1="0" y1="88" x2="280" y2="88" stroke="#e5e7eb" />
                <rect x="4.7" y="63.1" width="14" height="24.9" rx="2" fill="#2563eb" />
                <rect x="20.7" y="13.4" width="14" height="74.6" rx="2" fill="#ef4444" opacity=".85" />
                <rect x="51.3" y="61.3" width="14" height="26.7" rx="2" fill="#2563eb" />
                <rect x="67.3" y="11.7" width="14" height="76.3" rx="2" fill="#ef4444" opacity=".85" />
                <rect x="98.0" y="59.8" width="14" height="28.2" rx="2" fill="#2563eb" />
                <rect x="114.0" y="10.0" width="14" height="78.0" rx="2" fill="#ef4444" opacity=".85" />
                <rect x="144.7" y="58.2" width="14" height="29.8" rx="2" fill="#2563eb" />
                <rect x="160.7" y="8.8" width="14" height="79.2" rx="2" fill="#ef4444" opacity=".85" />
                <rect x="191.3" y="57.3" width="14" height="30.7" rx="2" fill="#2563eb" />
                <rect x="207.3" y="8.3" width="14" height="79.7" rx="2" fill="#ef4444" opacity=".85" />
                <rect x="238.0" y="56.0" width="14" height="32.0" rx="2" fill="#2563eb" />
                <rect x="254.0" y="8.0" width="14" height="80.0" rx="2" fill="#ef4444" opacity=".85" />
              </svg>
              <div className="mt-[0.45rem] flex gap-[0.8rem] text-[0.6rem] text-surface-500">
                <span>
                  <i className="mr-[0.3rem] inline-block h-[7px] w-[7px] rounded-sm bg-brand-600 align-middle" />
                  Revenue
                </span>
                <span>
                  <i className="mr-[0.3rem] inline-block h-[7px] w-[7px] rounded-sm bg-danger-500 align-middle" />
                  Expenses
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
