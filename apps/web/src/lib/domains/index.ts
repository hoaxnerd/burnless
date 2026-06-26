/**
 * Domain boot registration.
 *
 * registerDomains() is idempotent — it guards against calling register() twice
 * (the registry throws on duplicate id). Import this module to ensure the
 * registry is populated; call registerDomains() explicitly in server entry points.
 *
 * A3a-2: only the finance domain is registered. Additional domains (A3b: company-
 * knowledge, etc.) will add their modules here.
 */

import { domainRegistry } from "./registry";
import { financeDomainModule } from "./finance";
import { companyKnowledgeModule } from "./company-knowledge";
import { memoryDomainModule } from "./memory";
import { skillsDomainModule } from "./skills";
import { integrationsDomainModule } from "./integrations";

let registered = false;

export function registerDomains(): void {
  if (registered) return;
  registered = true;
  domainRegistry.register(financeDomainModule);
  domainRegistry.register(companyKnowledgeModule);
  domainRegistry.register(memoryDomainModule);
  domainRegistry.register(skillsDomainModule);
  domainRegistry.register(integrationsDomainModule);
}

// Auto-register at module load so any importer gets a populated registry.
registerDomains();

export { domainRegistry } from "./registry";
export type { DomainModule, DomainNavEntry } from "./contracts";
