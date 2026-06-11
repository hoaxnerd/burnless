export type Capability =
  | "marketingSite" | "billing" | "multiTenant" | "selfServeSignup"
  | "oauthLogin" | "autoLogin" | "stdioMcp" | "planEnforcement"
  | "emailVerification" | "managedAiProvider" | "integrations"
  | "inviteCodes" | "semanticSearch" | "dataResidency";

export type Capabilities = Record<Capability, boolean>;
export type Edition = "self_host" | "cloud";

export const EDITION_PRESETS: Record<Edition, Capabilities> = {
  self_host: {
    marketingSite: false, billing: false, multiTenant: false, selfServeSignup: false,
    oauthLogin: false, autoLogin: true, stdioMcp: true, planEnforcement: false,
    emailVerification: false, managedAiProvider: false, integrations: false,
    inviteCodes: false, semanticSearch: false, dataResidency: false,
  },
  cloud: {
    marketingSite: true, billing: true, multiTenant: true, selfServeSignup: true,
    oauthLogin: true, autoLogin: false, stdioMcp: false, planEnforcement: true,
    emailVerification: true, managedAiProvider: true, integrations: true,
    inviteCodes: true, semanticSearch: false, dataResidency: true,
  },
};
