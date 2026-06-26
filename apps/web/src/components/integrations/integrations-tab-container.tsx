"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { apiFetch } from "@/lib/api-fetch";
import { KEYS, revalidate } from "@/lib/swr";
import {
  type IntegrationRow,
  toConnectedIntegrations,
} from "./integrations-data";
import { IntegrationsTab } from "./integrations-tab";

/**
 * Client container for the Integrations tab on the Connections page. Owns the
 * integrations data + mutation logic lifted verbatim from the Settings page so
 * the tabs component stays lean. Reads `?connect=stripe` to auto-open the Stripe
 * connect card (parity with the old `/settings?connect=stripe` deep-link).
 */
export function IntegrationsTabContainer() {
  const [notifiedIntegrations, setNotifiedIntegrations] = useState<Set<string>>(new Set());

  // The GET returns the integration rows verbatim; project them into
  // ConnectedIntegration[] so `lastError` (from metadata.sync) reaches the UI.
  // Reading off the shared SWR cache means a connect/disconnect mutation
  // revalidates the list without a manual reload (DFL-01).
  const { data: integrationsData } = useSWR<IntegrationRow[]>(KEYS.integrations);
  const connectedIntegrations = toConnectedIntegrations(integrationsData ?? []);

  const reloadIntegrations = () => revalidate(KEYS.integrations);

  // Disconnect integration
  const disconnectIntegration = async (id: string) => {
    const res = await apiFetch(`/api/integrations/${id}`, { method: "DELETE" });
    if (res.ok) reloadIntegrations();
  };

  const getIntegrationStatus = (
    type: string,
    implemented: boolean,
  ): "available" | "coming_soon" | "connected" => {
    const connected = connectedIntegrations.find((i) => i.type === type);
    if (connected && connected.status === "active") return "connected";
    if (implemented) return "available";
    return "coming_soon";
  };

  const getConnectedId = (type: string): string | null => {
    return connectedIntegrations.find((i) => i.type === type)?.id ?? null;
  };

  // Honor the `?connect=stripe` deep-link so the Stripe card auto-opens (parity
  // with the old /settings?connect=stripe behavior).
  const searchParams = useSearchParams();
  const autoOpenConnect = searchParams.get("connect") === "stripe";

  return (
    <IntegrationsTab
      connectedIntegrations={connectedIntegrations}
      notifiedIntegrations={notifiedIntegrations}
      setNotifiedIntegrations={setNotifiedIntegrations}
      disconnectIntegration={disconnectIntegration}
      onConnected={reloadIntegrations}
      getIntegrationStatus={getIntegrationStatus}
      getConnectedId={getConnectedId}
      autoOpenConnect={autoOpenConnect}
    />
  );
}
