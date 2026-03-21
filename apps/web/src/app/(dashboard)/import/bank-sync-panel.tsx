"use client";

import { X, Building2, CreditCard, Zap, ArrowRight } from "lucide-react";

interface BankSyncPanelProps {
  setShowBankSync: (show: boolean) => void;
}

export function BankSyncPanel({ setShowBankSync }: BankSyncPanelProps) {
  return (
    <div className="mb-6 rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-700">
        <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
          Bank & Payment Connections
        </h3>
        <button onClick={() => setShowBankSync(false)} aria-label="Close bank connections panel" className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center text-surface-400 hover:text-surface-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { name: "Plaid", desc: "Connect 12,000+ banks", icon: Building2, color: "text-brand-600" },
            { name: "Mercury", desc: "Auto-sync transactions", icon: CreditCard, color: "text-violet-600" },
            { name: "Stripe", desc: "Revenue & payouts", icon: Zap, color: "text-amber-600" },
          ].map((provider) => (
            <button
              key={provider.name}
              className="flex items-center gap-3 rounded-xl border border-surface-200 dark:border-surface-700 p-4 text-left hover:border-brand-300 hover:bg-brand-50/50 dark:hover:border-brand-800 dark:hover:bg-brand-950/30 transition-all group"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-surface-50 dark:bg-surface-700 ${provider.color}`}>
                <provider.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-50">{provider.name}</p>
                <p className="text-xs text-surface-500 dark:text-surface-400">{provider.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-surface-300 group-hover:text-brand-500 transition-colors" />
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-surface-500 dark:text-surface-400 text-center">
          Bank sync requires API keys. Configure in Settings &rarr; Integrations.
        </p>
      </div>
    </div>
  );
}
