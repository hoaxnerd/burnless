export default function SettingsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">Settings</h1>
        <p className="mt-1 text-sm text-surface-500">
          Manage your company and account settings
        </p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Company settings */}
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">
            Company
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Company name
              </label>
              <input
                type="text"
                placeholder="My Startup Inc."
                className="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  Stage
                </label>
                <select className="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                  <option>Pre-seed</option>
                  <option>Seed</option>
                  <option>Series A</option>
                  <option>Series B</option>
                  <option>Series C+</option>
                  <option>Bootstrapped</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  Currency
                </label>
                <select className="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                  <option>USD ($)</option>
                  <option>EUR (&euro;)</option>
                  <option>GBP (&pound;)</option>
                  <option>INR (&#8377;)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Integrations */}
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">
            Integrations
          </h2>
          <div className="space-y-3">
            {["QuickBooks", "Xero", "Plaid", "Mercury", "Gusto", "Stripe"].map(
              (name) => (
                <div
                  key={name}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-sm text-surface-700">{name}</span>
                  <button className="rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 transition-colors">
                    Connect
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
