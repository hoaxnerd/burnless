export default function TeamPage() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            Team & Headcount
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            Plan and track your team growth
          </p>
        </div>
        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
          Add role
        </button>
      </div>

      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <div className="mx-auto max-w-md">
          <div className="text-4xl mb-4">👥</div>
          <h3 className="text-lg font-semibold text-surface-900 mb-2">
            No team members yet
          </h3>
          <p className="text-sm text-surface-500 mb-6">
            Add your current team and planned hires to see how headcount affects
            your burn rate and runway.
          </p>
          <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
            Add your first role
          </button>
        </div>
      </div>
    </div>
  );
}
