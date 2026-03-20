"use client";

import { useState } from "react";
import {
  BookOpen,
  FileSpreadsheet,
  Landmark,
  CreditCard,
  Building2,
  DollarSign,
  Wallet,
  ExternalLink,
  Check,
  Clock,
  AlertCircle,
  Upload,
} from "lucide-react";
import Link from "next/link";

interface IntegrationItem {
  type: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: "available" | "coming_soon" | "connected";
  href?: string;
}

const integrations: IntegrationItem[] = [
  {
    type: "csv_import",
    name: "CSV Import",
    description: "Import transactions from bank statements and spreadsheets",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    status: "available",
    href: "/import",
  },
  {
    type: "quickbooks",
    name: "QuickBooks",
    description: "Sync your QuickBooks accounting data automatically",
    icon: <BookOpen className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "xero",
    name: "Xero",
    description: "Connect your Xero accounting for real-time sync",
    icon: <BookOpen className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "freshbooks",
    name: "FreshBooks",
    description: "Import invoices and expenses from FreshBooks",
    icon: <BookOpen className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "plaid",
    name: "Plaid",
    description: "Connect bank accounts directly for transaction import",
    icon: <Landmark className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "mercury",
    name: "Mercury",
    description: "Sync your Mercury banking transactions automatically",
    icon: <Building2 className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "gusto",
    name: "Gusto",
    description: "Import payroll data and employee costs from Gusto",
    icon: <DollarSign className="h-5 w-5" />,
    status: "coming_soon",
  },
  {
    type: "stripe",
    name: "Stripe",
    description: "Sync revenue and payment data from Stripe",
    icon: <CreditCard className="h-5 w-5" />,
    status: "coming_soon",
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"general" | "integrations" | "billing">(
    "general"
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
          Settings
        </h1>
        <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
          Manage your company, integrations, and billing
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-200 dark:border-surface-700 mb-6">
        {(
          [
            { key: "general", label: "General" },
            { key: "integrations", label: "Integrations" },
            { key: "billing", label: "Billing" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-brand-600 text-brand-700 dark:text-brand-300"
                : "border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="space-y-6 max-w-2xl">
          <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-4">
              Company
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                  Company name
                </label>
                <input
                  type="text"
                  placeholder="My Startup Inc."
                  className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    Stage
                  </label>
                  <select className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                    <option>Pre-seed</option>
                    <option>Seed</option>
                    <option>Series A</option>
                    <option>Series B</option>
                    <option>Series C+</option>
                    <option>Bootstrapped</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    Currency
                  </label>
                  <select className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                    <option>USD ($)</option>
                    <option>EUR (&euro;)</option>
                    <option>GBP (&pound;)</option>
                    <option>INR (&#8377;)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === "integrations" && (
        <div className="max-w-3xl">
          <div className="space-y-3">
            {integrations.map((integration) => (
              <div
                key={integration.type}
                className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-4 flex items-center gap-4"
              >
                <div className="h-10 w-10 rounded-lg bg-surface-100 dark:bg-surface-700 flex items-center justify-center text-surface-600 dark:text-surface-300">
                  {integration.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                      {integration.name}
                    </h3>
                    {integration.status === "coming_soon" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 dark:bg-surface-700 px-2 py-0.5 text-[10px] font-medium text-surface-500 dark:text-surface-400">
                        <Clock className="h-3 w-3" />
                        Coming Soon
                      </span>
                    )}
                    {integration.status === "connected" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-50 dark:bg-success-950 px-2 py-0.5 text-[10px] font-medium text-success-700 dark:text-success-300">
                        <Check className="h-3 w-3" />
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                    {integration.description}
                  </p>
                </div>
                <div>
                  {integration.status === "available" && integration.href ? (
                    <Link
                      href={integration.href}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Import
                    </Link>
                  ) : integration.status === "connected" ? (
                    <button className="rounded-lg border border-surface-300 dark:border-surface-600 px-3 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
                      Manage
                    </button>
                  ) : (
                    <button
                      disabled
                      className="rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-1.5 text-xs font-medium text-surface-400 cursor-not-allowed"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === "billing" && (
        <div className="max-w-3xl space-y-6">
          {/* Current plan */}
          <div className="rounded-xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
                Current Plan
              </h2>
              <span className="inline-flex items-center rounded-full bg-brand-50 dark:bg-brand-950 px-3 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                Free
              </span>
            </div>
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">
              You&apos;re on the free plan. Upgrade to unlock unlimited scenarios, AI
              companion, and export features.
            </p>
          </div>

          {/* Pricing tiers */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                name: "Free",
                price: "$0",
                period: "forever",
                current: true,
                features: [
                  "1 scenario",
                  "Basic metrics",
                  "Manual data entry",
                  "CSV import",
                ],
              },
              {
                name: "Pro",
                price: "$49",
                period: "/month",
                current: false,
                popular: true,
                features: [
                  "Unlimited scenarios",
                  "AI companion",
                  "PDF & CSV export",
                  "Data room",
                  "Priority support",
                ],
              },
              {
                name: "Team",
                price: "$99",
                period: "/month + $20/seat",
                current: false,
                features: [
                  "Everything in Pro",
                  "Team collaboration",
                  "Role-based access",
                  "Audit log",
                  "Custom integrations",
                ],
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl border p-6 ${
                  tier.popular
                    ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 dark:border-brand-700"
                    : "border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800"
                }`}
              >
                {tier.popular && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-surface-900 dark:text-surface-50">
                  {tier.name}
                </h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold text-surface-900 dark:text-surface-50">
                    {tier.price}
                  </span>
                  <span className="text-sm text-surface-500 dark:text-surface-400">
                    {tier.period}
                  </span>
                </div>
                <ul className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400"
                    >
                      <Check className="h-4 w-4 text-success-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled={tier.current}
                  className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    tier.current
                      ? "bg-surface-100 dark:bg-surface-700 text-surface-400 cursor-not-allowed"
                      : tier.popular
                        ? "bg-brand-600 text-white hover:bg-brand-700"
                        : "border border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700"
                  }`}
                >
                  {tier.current ? "Current Plan" : "Upgrade"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
