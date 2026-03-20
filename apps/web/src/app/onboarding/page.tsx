"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot, Send, Loader2, ArrowRight, Check, SkipForward } from "lucide-react";

type OnboardingStep = "welcome" | "chat" | "creating" | "done";

interface Message {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

const SETUP_QUESTIONS = [
  "company_name",
  "stage",
  "business_model",
  "monthly_revenue",
  "team_size",
  "funding",
  "main_expenses",
] as const;

type SetupField = (typeof SETUP_QUESTIONS)[number];

interface CompanySetup {
  company_name: string;
  stage: string;
  business_model: string;
  monthly_revenue: string;
  team_size: string;
  funding: string;
  main_expenses: string;
}

const DEFAULTS: CompanySetup = {
  company_name: "My Company",
  stage: "Pre-seed",
  business_model: "SaaS",
  monthly_revenue: "$0",
  team_size: "1",
  funding: "$0",
  main_expenses: "General operations",
};

const INITIAL_MESSAGE = `Hey! I'm your AI financial companion. Let's get your company set up in Burnless.

I'll walk you through a few questions to build your initial financial model. Think of this like a quick conversation with a financial advisor.

You can skip any question if you're not sure yet — you can always update later in Settings.

**What's your company name?**`;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentField, setCurrentField] = useState<number>(0);
  const [setup, setSetup] = useState<Partial<CompanySetup>>({});
  const [skippedFields, setSkippedFields] = useState<Set<SetupField>>(new Set());
  const [progress, setProgress] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (step === "chat") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step]);

  const startChat = () => {
    setStep("chat");
    setMessages([{ role: "assistant", content: INITIAL_MESSAGE }]);
  };

  const completionPct = () => {
    const total = SETUP_QUESTIONS.length;
    const answered = SETUP_QUESTIONS.filter(
      (f) => setup[f] && !skippedFields.has(f)
    ).length;
    return Math.round((answered / total) * 100);
  };

  const getNextQuestion = (fieldIdx: number, userAnswer: string, skipped = false): string => {
    const updatedSetup = { ...setup };
    const field = SETUP_QUESTIONS[fieldIdx];

    if (field) {
      updatedSetup[field] = skipped ? DEFAULTS[field] : userAnswer;
      setSetup(updatedSetup);
      if (skipped) {
        setSkippedFields((prev) => new Set([...prev, field]));
      }
    }

    const nextIdx = fieldIdx + 1;
    setCurrentField(nextIdx);
    setProgress(Math.round((nextIdx / SETUP_QUESTIONS.length) * 100));

    const displayAnswer = skipped ? "(skipped)" : userAnswer;

    switch (nextIdx) {
      case 1:
        return `Great, **${displayAnswer}**! ${skipped ? "No worries, you can set this later." : "Love it."}

What stage are you at? For example:
- Pre-seed (idea stage)
- Seed (early traction)
- Series A (scaling)
- Series B+ (growth)
- Bootstrapped (self-funded)`;
      case 2:
        return `Got it, ${displayAnswer}.

What's your business model?
- **SaaS** (subscription software)
- **Marketplace** (connecting buyers/sellers)
- **E-commerce** (selling products)
- **Services** (consulting/agency)
- **Hardware** (physical products)
- **Other**`;
      case 3:
        return `${displayAnswer} - ${skipped ? "we'll assume the basics for now." : "solid."}

What's your approximate **monthly revenue** right now? (Even $0 is fine if you're pre-revenue)`;
      case 4:
        return `${displayAnswer} in monthly revenue.

How many people are on the team currently? (Include founders, full-time, and contractors)`;
      case 5:
        return `A team of ${displayAnswer}.

Have you raised any funding? If so, how much total? (e.g., "$500k seed round" or "bootstrapped, no outside funding")`;
      case 6:
        return `Got it.

Last one - what are your **main expense categories**? For example:
- Salaries & payroll
- Cloud infrastructure (AWS/GCP)
- Marketing
- Office/co-working
- Software tools

Just list what's relevant to you.`;
      default:
        return buildSummary(updatedSetup as CompanySetup, skipped ? DEFAULTS.main_expenses : userAnswer);
    }
  };

  const buildSummary = (data: CompanySetup, lastAnswer: string): string => {
    data.main_expenses = lastAnswer;
    setSetup(data);
    setProgress(100);

    const skippedNote = skippedFields.size > 0
      ? `\n\n*${skippedFields.size} field${skippedFields.size > 1 ? "s" : ""} skipped — you can update these anytime in Settings.*`
      : "";

    return `Here's what I've got:

| | |
|---|---|
| **Company** | ${data.company_name} |
| **Stage** | ${data.stage} |
| **Model** | ${data.business_model} |
| **Monthly Revenue** | ${data.monthly_revenue} |
| **Team Size** | ${data.team_size} |
| **Funding** | ${data.funding} |
| **Main Expenses** | ${data.main_expenses} |
${skippedNote}

Does this look right? I'll use this to create your initial financial model with:
- Revenue projections based on your current run rate
- Expense forecasts for your key categories
- A burn rate and runway calculation
- A base scenario you can adjust anytime

Type **"looks good"** to proceed, or correct anything you'd like to change.`;
  };

  const handleSkip = () => {
    if (isLoading || currentField >= SETUP_QUESTIONS.length) return;

    const field = SETUP_QUESTIONS[currentField];
    const defaultValue = field ? DEFAULTS[field] : "";

    setMessages((prev) => [...prev, { role: "user", content: "Skip for now" }]);

    // Brief delay for natural feel
    setIsLoading(true);
    setTimeout(() => {
      const response = getNextQuestion(currentField, defaultValue, true);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
      setIsLoading(false);
    }, 200);
  };

  const handleSkipAll = () => {
    if (isLoading) return;

    // Fill all remaining fields with defaults
    const updatedSetup = { ...setup };
    const newSkipped = new Set(skippedFields);
    for (let i = currentField; i < SETUP_QUESTIONS.length; i++) {
      const field = SETUP_QUESTIONS[i]!;
      updatedSetup[field] = DEFAULTS[field];
      newSkipped.add(field);
    }
    setSetup(updatedSetup);
    setSkippedFields(newSkipped);
    setCurrentField(SETUP_QUESTIONS.length);
    setProgress(100);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: "Skip all remaining questions" },
    ]);

    setTimeout(() => {
      const data = updatedSetup as CompanySetup;
      const summary = `No problem! I've filled in sensible defaults for everything.

| | |
|---|---|
| **Company** | ${data.company_name} |
| **Stage** | ${data.stage} |
| **Model** | ${data.business_model} |
| **Monthly Revenue** | ${data.monthly_revenue} |
| **Team Size** | ${data.team_size} |
| **Funding** | ${data.funding} |
| **Main Expenses** | ${data.main_expenses} |

*You can update all of these in Settings after setup.*

Type **"looks good"** to proceed, or change anything you'd like.`;

      setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
    }, 200);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    // Simulate a brief delay for natural conversation feel
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));

    // Check if user confirmed the summary
    if (currentField >= SETUP_QUESTIONS.length) {
      const confirmed = userMessage.toLowerCase().includes("looks good") ||
        userMessage.toLowerCase().includes("yes") ||
        userMessage.toLowerCase().includes("correct") ||
        userMessage.toLowerCase().includes("proceed") ||
        userMessage.toLowerCase().includes("go ahead") ||
        userMessage.toLowerCase().includes("perfect") ||
        userMessage.toLowerCase().includes("let's go") ||
        userMessage.toLowerCase().includes("do it");

      if (confirmed) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Setting up your financial model now..." },
        ]);
        setIsLoading(false);
        await createCompany();
        return;
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "No worries! What would you like to change? Just tell me what to update." },
        ]);
        setIsLoading(false);
        return;
      }
    }

    const response = getNextQuestion(currentField, userMessage);
    setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    setIsLoading(false);
  };

  const createCompany = async () => {
    setStep("creating");
    setCreateError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create company");
      }

      await new Promise((r) => setTimeout(r, 1500));
      setStep("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setCreateError(message);
      setStep("chat");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Hmm, ran into an issue: **${message}**

Don't worry — your answers are saved. Just type **"retry"** or **"try again"** and I'll give it another shot.`,
        },
      ]);
    }
  };

  const canSkip = step === "chat" && currentField < SETUP_QUESTIONS.length && !isLoading;

  // Welcome screen
  if (step === "welcome") {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
        <div className="w-full max-w-lg text-center">
          <div className="h-14 w-14 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-2xl">B</span>
          </div>
          <h1 className="text-3xl font-bold text-surface-900">Welcome to Burnless</h1>
          <p className="mt-3 text-surface-500 max-w-md mx-auto">
            Your AI-powered financial operating system. Let's set up your company with a quick conversation.
          </p>

          <button
            onClick={startChat}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Bot className="w-4 h-4" />
            Start Setup
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="mt-4 text-xs text-surface-400">
            Takes about 2 minutes. You can skip any question you're not sure about.
          </p>
        </div>
      </div>
    );
  }

  // Creating screen
  if (step === "creating") {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <Loader2 className="w-10 h-10 text-brand-600 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-surface-900">Building your financial model</h2>
          <p className="mt-2 text-sm text-surface-500">
            Setting up {setup.company_name || "your"}'s workspace...
          </p>
          <div className="mt-6 space-y-2 text-left max-w-xs mx-auto">
            {["Creating company profile", "Setting up base scenario", "Building expense model", "Generating projections"].map((task) => (
              <div key={task} className="flex items-center gap-2 text-xs text-surface-500">
                <Check className="w-3.5 h-3.5 text-green-500" />
                {task}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Done screen
  if (step === "done") {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-surface-900">You're all set!</h2>
          <p className="mt-2 text-sm text-surface-500">
            {setup.company_name || "Your company"}'s financial model is ready. Your AI companion has created an initial forecast based on what you told me.
          </p>
          {skippedFields.size > 0 && (
            <p className="mt-2 text-xs text-surface-400">
              {completionPct()}% profile complete — visit Settings to fill in the rest.
            </p>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Chat screen
  return (
    <div className="min-h-screen bg-surface-50 flex flex-col">
      {/* Header */}
      <div className="bg-surface-0 border-b border-surface-200 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="text-sm font-semibold text-surface-900">Burnless Setup</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Skip all button */}
            {canSkip && (
              <button
                onClick={handleSkipAll}
                className="text-xs text-surface-400 hover:text-surface-600 transition-colors"
              >
                Skip all &rarr;
              </button>
            )}
            {/* Progress bar */}
            <div className="flex items-center gap-2">
              <div className="w-32 h-1.5 rounded-full bg-surface-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-surface-400">{progress}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="flex gap-2.5 max-w-[85%]">
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-brand-600" />
                    </div>
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white"
                      : "bg-surface-0 border border-surface-200 text-surface-800"
                  }`}
                >
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                  {msg.isStreaming && <span className="inline-block ml-0.5 animate-pulse">|</span>}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-surface-0 border-t border-surface-200 px-4 py-4">
        <form onSubmit={handleSend} className="max-w-2xl mx-auto">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer..."
              disabled={isLoading}
              className="flex-1 rounded-xl border border-surface-300 bg-surface-0 px-4 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50"
            />
            {canSkip && (
              <button
                type="button"
                onClick={handleSkip}
                title="Skip this question"
                className="rounded-xl border border-surface-300 bg-surface-0 px-3 py-2.5 text-surface-400 hover:text-surface-600 hover:border-surface-400 transition-colors"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          {canSkip && (
            <p className="mt-2 text-center text-xs text-surface-400">
              Not sure? Press the skip button — you can always update in Settings later.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
