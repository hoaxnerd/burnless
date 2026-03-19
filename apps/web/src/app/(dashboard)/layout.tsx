import Link from "next/link";

const navItems = [
  { href: "/overview", label: "Overview", icon: "LayoutDashboard" },
  { href: "/scenarios", label: "Scenarios", icon: "GitBranch" },
  { href: "/reports", label: "Reports", icon: "FileBarChart" },
  { href: "/team", label: "Team", icon: "Users" },
  { href: "/ai", label: "AI Companion", icon: "Sparkles" },
  { href: "/settings", label: "Settings", icon: "Settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-surface-200 bg-surface-0 flex flex-col">
        <div className="p-4 border-b border-surface-200">
          <Link href="/overview" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="text-lg font-semibold text-surface-900">
              Burnless
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
            >
              <span className="w-5 h-5 text-surface-400">{/* Icon placeholder */}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-surface-200">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-surface-200 flex items-center justify-center">
              <span className="text-xs font-medium text-surface-600">U</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-900 truncate">
                User
              </p>
              <p className="text-xs text-surface-500 truncate">
                user@startup.com
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-surface-50 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
