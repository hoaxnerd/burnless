import {
  LayoutDashboard,
  Receipt,
  ArrowLeftRight,
  TrendingUp,
  Landmark,
  Users,
  GitBranch,
  Sparkles,
  FolderOpen,
  Plug,
  Clock,
  type LucideIcon,
} from "lucide-react";

/* ── Nav item definitions ─────────────────────────────────────────────────── */
//
// A3a-2 NOTE: The sidebar array (coreNavItems) is intentionally kept hardcoded here.
// `navEntries` on each DomainModule is the backend data representation (icon as string
// name; used by API consumers that cannot import Lucide components).
// When a second domain registers nav entries, switch the sidebar to call
// `domainRegistry.getActive*()` and map icon strings to Lucide components at render time.
//

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

export const coreNavItems: NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "expenses", href: "/expenses", label: "Expenses", icon: Receipt },
  { id: "transactions", href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "revenue", href: "/revenue", label: "Revenue", icon: TrendingUp },
  { id: "funding", href: "/funding", label: "Funding", icon: Landmark },
  { id: "team", href: "/team", label: "Team", icon: Users },
  { id: "scenarios", href: "/scenarios", label: "Scenarios", icon: GitBranch },
  { id: "data-room", href: "/data-room", label: "Data Room", icon: FolderOpen },
  { id: "connections", href: "/connections", label: "Connections", icon: Plug },
  { id: "automations", href: "/automations", label: "Automations", icon: Clock },
];

export const aiNavItem: NavItem = { id: "ai", href: "/ai", label: "Companion", icon: Sparkles };

export const NAV_ITEM_MAP = new Map<string, NavItem>(
  [...coreNavItems, aiNavItem].map((item) => [item.id, item])
);

/* ── Quick Action mode types ──────────────────────────────────────────────── */

export type QuickActionMode = "intelligence" | "dynamic" | "custom";

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  action?: () => void;
  /** Per-item mode */
  mode?: QuickActionMode;
}

/* ── User info ────────────────────────────────────────────────────────────── */

export interface UserInfo {
  name: string | null;
  email: string | null;
  image: string | null;
}
