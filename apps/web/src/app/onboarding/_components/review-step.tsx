import { useRef, useState } from "react";
import { ArrowRight, SkipForward, Sparkles, AlertTriangle, RotateCcw } from "lucide-react";
import { useLocale } from "@/components/locale/locale-context";
import type {
  CompanyFields,
  FundingRound,
  HeadcountRole,
  OperatingExpense,
  RevenueStream,
} from "./types";
import { useSuggestionList } from "./review/use-suggestions";
import { CompanyIdentitySection } from "./review/company-identity-section";
import { FinancialsSummarySection, TeamSummarySection } from "./review/summary-sections";
import { RevenueStreamsSection } from "./review/revenue-streams-section";
import { FundingHistorySection } from "./review/funding-history-section";
import { HeadcountSection } from "./review/headcount-section";
import { ExpensesSection } from "./review/expenses-section";

export interface CreatePayload {
  userName?: string;
  founders: string[];
  fundingRounds: FundingRound[];
  headcount: HeadcountRole[];
  expenses: OperatingExpense[];
  revenueStreams: RevenueStream[];
}

interface ReviewStepProps {
  fields: CompanyFields;
  createError: string | null;
  onUpdateField: (name: keyof CompanyFields, value: string) => void;
  onCreate: (extraData?: CreatePayload) => void;
  onSkipOnboarding: () => void;
  initialFounders?: string[];
  initialFundingRounds?: FundingRound[];
  initialHeadcount?: HeadcountRole[];
  initialExpenses?: OperatingExpense[];
  initialRevenueStreams?: RevenueStream[];
}

export function ReviewStep({
  fields,
  createError,
  onUpdateField,
  onCreate,
  onSkipOnboarding,
  initialFounders = [],
  initialFundingRounds = [],
  initialHeadcount = [],
  initialExpenses = [],
  initialRevenueStreams = [],
}: ReviewStepProps) {
  const { currencySymbol, fmtCurrency } = useLocale();

  const [userName, setUserName] = useState("");
  const [nameBlurred, setNameBlurred] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameError = nameBlurred && !fields.company_name.value.trim()
    ? "Company name is required"
    : undefined;

  const fundingApi = useSuggestionList<FundingRound>({ initial: initialFundingRounds, idPrefix: "funding" });
  const headcountApi = useSuggestionList<HeadcountRole>({ initial: initialHeadcount, idPrefix: "headcount" });
  const expenseApi = useSuggestionList<OperatingExpense>({ initial: initialExpenses, idPrefix: "expense" });
  const revenueApi = useSuggestionList<RevenueStream>({ initial: initialRevenueStreams, idPrefix: "rev" });

  const aiFieldCount = Object.values(fields).filter((f) => f.source === "ai").length;

  const handleSubmit = () => {
    // ONB-05: block submit on empty company name — mark the field invalid and
    // focus it so the error is both perceivable and actionable.
    if (!fields.company_name.value.trim()) {
      setNameBlurred(true);
      nameInputRef.current?.focus();
      return;
    }
    onCreate({
      userName,
      founders: initialFounders,
      fundingRounds: fundingApi.selectedPayload() as FundingRound[],
      headcount: headcountApi.selectedPayload() as HeadcountRole[],
      expenses: expenseApi.selectedPayload() as OperatingExpense[],
      revenueStreams: revenueApi.selectedPayload() as RevenueStream[],
    });
  };

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <ProgressHeader onSkip={onSkipOnboarding} />
        <ReviewIntro aiFieldCount={aiFieldCount} />

        {createError && <ErrorBanner message={createError} onRetry={handleSubmit} />}

        <div className="space-y-6">
          <CompanyIdentitySection
            fields={fields}
            onUpdateField={onUpdateField}
            nameError={nameError}
            onNameBlur={() => setNameBlurred(true)}
            nameInputRef={nameInputRef}
            userName={userName}
            onUserNameChange={setUserName}
            suggestedFounders={initialFounders}
          />
          <FinancialsSummarySection
            fields={fields}
            onUpdateField={onUpdateField}
            currencySymbol={currencySymbol}
          />
          <TeamSummarySection fields={fields} onUpdateField={onUpdateField} />
          <RevenueStreamsSection
            api={revenueApi}
            currencySymbol={currencySymbol}
            fmtCurrency={fmtCurrency}
          />
          <FundingHistorySection
            api={fundingApi}
            currencySymbol={currencySymbol}
            fmtCurrency={fmtCurrency}
          />
          <HeadcountSection api={headcountApi} currencySymbol={currencySymbol} />
          <ExpensesSection api={expenseApi} currencySymbol={currencySymbol} />
        </div>

        <button
          onClick={handleSubmit}
          className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-base font-medium text-white hover:bg-brand-700 transition-colors press-effect shadow-md"
        >
          Create My Company
          <ArrowRight className="w-5 h-5" />
        </button>

        <button
          onClick={onSkipOnboarding}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-surface-200 dark:border-surface-700 px-6 py-3 text-sm font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
        >
          I&apos;ll do this later
        </button>

        <p className="mt-3 text-center text-xs text-surface-400">
          You can always fill this in from Settings.
        </p>
      </div>
    </div>
  );
}

function ProgressHeader({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2 animate-slide-up">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-8 rounded-full bg-brand-600" />
          <div className="h-2 w-8 rounded-full bg-brand-600" />
          <div className="h-2 w-8 rounded-full bg-surface-200 dark:bg-surface-700" />
        </div>
        <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
          Step 2 of 3
        </span>
      </div>
      <button
        onClick={onSkip}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        <SkipForward className="w-3.5 h-3.5" />
        Skip all
      </button>
    </div>
  );
}

function ReviewIntro({ aiFieldCount }: { aiFieldCount: number }) {
  const aiDetected = aiFieldCount > 0;
  return (
    <div className="text-center mb-6 animate-slide-up" style={{ animationDelay: "50ms" }}>
      <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-50">
        {aiDetected ? "Verify your details" : "Tell us about your company"}
      </h1>
      <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
        {aiDetected
          ? "We analyzed your website and pre-filled suggestion cards below. Select and customize before importing."
          : "Configure your startup profile details below."}
      </p>
      {aiDetected && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-50 dark:bg-accent-950 px-3 py-1 text-xs font-medium text-accent-700 dark:text-accent-400">
          <Sparkles className="w-3 h-3" />
          AI-detected cards have left purple accent borders
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl bg-danger-50 dark:bg-danger-950 border border-danger-500/20 p-4 animate-slide-up">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-danger-700 dark:text-danger-400">{message}</p>
          <p className="mt-1 text-xs text-danger-600 dark:text-danger-500">
            Check your details below and try again. If this keeps happening, skip onboarding and set up your company from Settings.
          </p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-danger-700 dark:text-danger-400 bg-danger-100 dark:bg-danger-900/50 hover:bg-danger-200 dark:hover:bg-danger-900 transition-colors"
      >
        <RotateCcw className="w-3 h-3" />
        Retry
      </button>
    </div>
  );
}
