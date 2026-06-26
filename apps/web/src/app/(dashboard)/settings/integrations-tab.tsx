"use client";

import { useState } from "react";
import { Check, Clock, Upload, Unplug, Bell } from "lucide-react";
import Link from "next/link";
import {
  AVAILABLE_INTEGRATIONS,
  COMING_SOON_INTEGRATIONS,
  type ConnectedIntegration,
} from "./settings-data";
import { StripeConnectCard } from "./stripe-connect-card";
import { useCapabilities } from "@/components/providers/capability-context";

interface IntegrationsTabProps {
  connectedIntegrations: ConnectedIntegration[];
  notifiedIntegrations: Set<string>;
  setNotifiedIntegrations: React.Dispatch<React.SetStateAction<Set<string>>>;
  disconnectIntegration: (id: string) => void;
  /** Revalidate the connected-integrations list after a successful connect. */
  onConnected: () => void;
  getIntegrationStatus: (type: string, implemented: boolean) => "available" | "coming_soon" | "connected";
  getConnectedId: (type: string) => string | null;
}

export function IntegrationsTab({
  connectedIntegrations: _connectedIntegrations,
  notifiedIntegrations,
  setNotifiedIntegrations,
  disconnectIntegration,
  onConnected,
  getIntegrationStatus,
  getConnectedId,
}: IntegrationsTabProps) {
  // Task 12: the coming-soon (cloud-only) integration tiles are gated.
  const caps = useCapabilities();
  // The Stripe connect card is opened inline from the Stripe row's "Connect"
  // affordance (which still deep-links to /settings?connect=stripe for parity).
  const [openConnect, setOpenConnect] = useState<string | null>(null);
  return (
    <div className="max-w-3xl space-y-8">
      {/* Available Integrations */}
      <div>
        <h2 className="text-sm font-semibold text-surface-900 mb-3">Available</h2>
        <div className="space-y-3">
          {AVAILABLE_INTEGRATIONS.map((integration) => {
            const status = getIntegrationStatus(integration.type, integration.implemented);
            const connectedId = getConnectedId(integration.type);
            // Stripe is wired to the live connect card (registry connector).
            // Gate the connect affordance on caps.integrations (parity with the
            // server capability guard). When not connected and opened, the row
            // expands to the card; otherwise the row shows a "Connect" button.
            const isStripe = integration.type === "stripe";
            const stripeCardOpen = isStripe && caps.integrations && status !== "connected" && openConnect === "stripe";
            return (
              <div
                key={integration.type}
                className={`rounded-2xl bg-surface-0 border p-5 ${
                  stripeCardOpen ? "space-y-4" : "flex items-center gap-4"
                } transition-all ${
                  status === "connected"
                    ? "border-success-200 bg-success-50/30"
                    : "border-surface-200 hover:border-surface-300"
                }`}
              >
                <div className={stripeCardOpen ? "flex items-center gap-4" : "contents"}>
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                    status === "connected"
                      ? "bg-success-100 text-success-600"
                      : "bg-surface-100 text-surface-600"
                  }`}>
                    {integration.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-surface-900">
                        {integration.name}
                      </h3>
                      {status === "connected" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-medium text-success-700">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {integration.description}
                    </p>
                  </div>
                  {!stripeCardOpen && (
                    <div>
                      {isStripe && caps.integrations ? (
                        status === "connected" && connectedId ? (
                          <button
                            onClick={() => disconnectIntegration(connectedId)}
                            className="flex items-center gap-1.5 rounded-xl border border-danger-200 px-4 py-2 text-xs font-medium text-danger-600 hover:bg-danger-50 transition-colors"
                          >
                            <Unplug className="h-3.5 w-3.5" />
                            Disconnect
                          </button>
                        ) : (
                          <Link
                            href={`/settings?connect=${integration.type}`}
                            onClick={(e) => {
                              e.preventDefault();
                              setOpenConnect("stripe");
                            }}
                            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm shadow-brand-600/20"
                          >
                            Connect
                          </Link>
                        )
                      ) : status === "available" && integration.href ? (
                        <Link
                          href={integration.href}
                          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm shadow-brand-600/20"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Import
                        </Link>
                      ) : status === "connected" && connectedId ? (
                        <button
                          onClick={() => disconnectIntegration(connectedId)}
                          className="flex items-center gap-1.5 rounded-xl border border-danger-200 px-4 py-2 text-xs font-medium text-danger-600 hover:bg-danger-50 transition-colors"
                        >
                          <Unplug className="h-3.5 w-3.5" />
                          Disconnect
                        </button>
                      ) : (
                        <Link
                          href={`/settings?connect=${integration.type}`}
                          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors shadow-sm shadow-brand-600/20"
                        >
                          Connect
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                {stripeCardOpen && (
                  <StripeConnectCard
                    onConnected={() => {
                      setOpenConnect(null);
                      onConnected();
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Coming Soon Integrations — Task 12: gated on integrations capability */}
      {caps.integrations && (
      <div>
        <h2 className="text-sm font-semibold text-surface-500 mb-3">Coming Soon</h2>
        <div className="space-y-3">
          {COMING_SOON_INTEGRATIONS.map((integration) => (
            <div
              key={integration.type}
              className="rounded-2xl bg-surface-50/50 border border-surface-200 p-5 flex items-center gap-4 opacity-75"
            >
              <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-surface-100 text-surface-400">
                {integration.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-surface-600">
                    {integration.name}
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-surface-500">
                    <Clock className="h-3 w-3" />
                    Coming Soon
                  </span>
                </div>
                <p className="text-xs text-surface-400 mt-0.5">
                  {integration.description}
                </p>
              </div>
              <div>
                <button
                  onClick={() =>
                    setNotifiedIntegrations((prev) => {
                      const next = new Set(prev);
                      next.add(integration.type);
                      return next;
                    })
                  }
                  disabled={notifiedIntegrations.has(integration.type)}
                  className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium transition-colors ${
                    notifiedIntegrations.has(integration.type)
                      ? "border-surface-200 text-surface-400 cursor-default bg-surface-50"
                      : "border-surface-300 text-surface-600 hover:bg-surface-100 hover:border-surface-400"
                  }`}
                >
                  {notifiedIntegrations.has(integration.type) ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Notified
                    </>
                  ) : (
                    <>
                      <Bell className="h-3.5 w-3.5" />
                      Notify Me
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
