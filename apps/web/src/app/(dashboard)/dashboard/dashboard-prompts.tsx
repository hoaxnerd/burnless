import Link from "next/link";

export function SetupPrompt() {
  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-12 text-center animate-scale-in">
      <div className="inline-flex items-center justify-center rounded-2xl bg-brand-500/10 p-4 mb-5">
        <svg className="h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-surface-900 mb-2">Welcome to Burnless</h3>
      <p className="text-sm text-surface-500 mb-8 max-w-sm mx-auto">
        Your AI-powered financial companion. Complete onboarding to set up your company.
      </p>
      <Link
        href="/onboarding"
        className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-md hover:shadow-lg"
      >
        Get started
      </Link>
    </div>
  );
}

export function NoScenarioPrompt() {
  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-12 text-center animate-scale-in">
      <div className="inline-flex items-center justify-center rounded-2xl bg-brand-500/10 p-4 mb-5">
        <svg className="h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-surface-900 mb-2">Create Your First Scenario</h3>
      <p className="text-sm text-surface-500 mb-8 max-w-sm mx-auto">
        A scenario is your financial model. Start with a base case and explore alternatives.
      </p>
      <Link
        href="/scenarios/new"
        className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shadow-md hover:shadow-lg"
      >
        Create scenario
      </Link>
    </div>
  );
}
