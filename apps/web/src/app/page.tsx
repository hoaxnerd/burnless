import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <header className="border-b border-surface-200 bg-surface-0">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">B</span>
              </div>
              <span className="text-xl font-semibold text-surface-900">
                Burnless
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/login"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 text-center">
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 inline-flex items-center rounded-full bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700">
              AI-first financial planning
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-surface-900 sm:text-6xl">
              Stop guessing.
              <br />
              <span className="text-brand-600">Start planning.</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-surface-600">
              Burnless gives startups an AI companion that understands your
              financials — runway, burn rate, forecasts, scenarios — so you
              can make decisions with confidence, not spreadsheets.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/login"
                className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
              >
                Start free trial
              </Link>
              <Link
                href="#features"
                className="rounded-lg px-6 py-3 text-sm font-semibold text-surface-700 ring-1 ring-inset ring-surface-300 hover:bg-surface-50 transition-colors"
              >
                See features
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-surface-50 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-surface-900">
                Everything your startup needs
              </h2>
              <p className="mt-4 text-lg text-surface-600">
                Financial clarity in minutes, not months
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: "AI Companion",
                  description:
                    "Ask questions in plain English. Get insights, scenarios, and recommendations tailored to your business.",
                  icon: "🤖",
                },
                {
                  title: "Multi-Scenario Modeling",
                  description:
                    "Run best, base, and worst case scenarios. See how hiring, fundraising, and growth decisions affect your runway.",
                  icon: "📊",
                },
                {
                  title: "Real-time Dashboards",
                  description:
                    "100+ metrics out of the box. Custom KPIs. Live cash position monitoring. Know where you stand — always.",
                  icon: "📈",
                },
                {
                  title: "Headcount Planning",
                  description:
                    "Model hiring timelines, salaries, benefits, and payroll taxes. See the true cost of growing your team.",
                  icon: "👥",
                },
                {
                  title: "Fundraising Tools",
                  description:
                    "Dilution tables, round modeling, investor-ready data rooms. Be prepared before the conversation starts.",
                  icon: "💰",
                },
                {
                  title: "Smart Integrations",
                  description:
                    "Connect QuickBooks, Xero, Plaid, Mercury, Gusto, and more. Your actuals sync automatically.",
                  icon: "🔗",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl bg-surface-0 p-8 shadow-sm border border-surface-200"
                >
                  <div className="text-3xl mb-4">{feature.icon}</div>
                  <h3 className="text-lg font-semibold text-surface-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-surface-600 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-200 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center text-sm text-surface-500">
          &copy; {new Date().getFullYear()} Burnless. AI-first financial
          planning for startups.
        </div>
      </footer>
    </div>
  );
}
