import { Check, ArrowRight } from "lucide-react";

interface DoneStepProps {
  companyName: string;
  onGoToDashboard: () => void;
}

export function DoneStep({ companyName, onGoToDashboard }: DoneStepProps) {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center animate-scale-in">
        <div className="w-14 h-14 rounded-2xl bg-success-100 dark:bg-success-950 flex items-center justify-center mx-auto mb-4 animate-celebrate">
          <Check className="w-7 h-7 text-success-600 dark:text-success-500" />
        </div>
        <h2 className="text-xl font-bold text-surface-900 dark:text-surface-50">
          You&apos;re all set!
        </h2>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
          {companyName || "Your company"}&apos;s financial model is
          ready.
        </p>
        <button
          onClick={onGoToDashboard}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-base font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Go to Dashboard
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
