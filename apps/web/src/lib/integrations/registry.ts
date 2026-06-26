import type { IntegrationConnector, CatalogEntry } from "./contracts";
import { stripeConnector } from "./stripe/connector";

export class IntegrationRegistry {
  private connectors = new Map<string, IntegrationConnector>();
  register(c: IntegrationConnector): void {
    if (this.connectors.has(c.id)) throw new Error(`duplicate integration connector id: ${c.id}`);
    this.connectors.set(c.id, c);
  }
  get(id: string): IntegrationConnector | undefined { return this.connectors.get(id); }
  getAll(): IntegrationConnector[] { return Array.from(this.connectors.values()); }
  catalog(): CatalogEntry[] {
    return this.getAll().map((c) => ({
      type: c.id, displayName: c.displayName, description: c.description, icon: c.icon,
      capability: c.capability, status: c.source ? "available" : "coming_soon",
    }));
  }
}

export const integrationRegistry = new IntegrationRegistry();

let registered = false;
export function registerConnectors(): void {
  if (registered) return;
  registered = true;
  integrationRegistry.register(stripeConnector);
}
