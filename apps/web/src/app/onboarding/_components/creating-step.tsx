import { Loader2, Check } from "lucide-react";

interface CreatingStepProps {
  companyName: string;
}

export function CreatingStep({ companyName }: CreatingStepProps) {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center animate-fade-in">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
          Building your financial model
        </h2>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
          Setting up {companyName || "your company"}...
        </p>
        <div className="mt-6 space-y-2.5 text-left max-w-xs mx-auto">
          {[
            "Creating company profile",
            "Setting up base scenario",
            "Building expense model",
            "Generating projections",
          ].map((task, i) => (
            <div
              key={task}
              className="flex items-center gap-2.5 text-sm text-surface-500 dark:text-surface-400 animate-slide-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <Check className="w-4 h-4 text-success-500 flex-shrink-0" />
              {task}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
