// @burnless/ai — Companion for financial planning
// Provider-agnostic: supports Anthropic, OpenAI, OpenRouter, and more.
// Configure via AI_PROVIDER + AI_MODEL + AI_API_KEY env vars.

// Runtime-tunable AI limits (env-configurable)
export { getAiLimits, type AiLimits } from "./config";

// Chat
export { chat, chatStream } from "./chat";

// Context assembly
export { buildFinancialSnapshot, formatContextForPrompt } from "./context";

// Tool definitions
export { getFinancialTools, getMcpExposedTools, MCP_SERVER_EXCLUDED_TOOLS } from "./tools";

// Tool-name alias map (forward-compat for retired names in stored audit logs / history)
export { TOOL_NAME_ALIASES, canonicalToolName } from "./tool-aliases";

// Tool input Zod schemas
export {
  ExpenseFrequencySchema,
  ForecastMethodSchema,
  UpdateExpenseSchema,
  CreateExpenseSchema,
} from "./schemas/expenses";
export type {
  UpdateExpenseInput,
  CreateExpenseInput,
} from "./schemas/expenses";

// Insights
export { generateInsights } from "./insights";
export { generatePageInsights } from "./page-insights";
export type { InsightPage, PageInsightContext, PageInsight } from "./page-insights";

// Prompts
export { SYSTEM_PROMPT, AUTONOMOUS_SYSTEM_PROMPT, buildSystemPrompt, buildSystemMessage, type PromptMode } from "./prompts";

// Input sanitization
export { sanitizeUserMessage, detectInjectionAttempt } from "./sanitize";

// Provider system
export {
  createProvider,
  createProviderForTier,
  getProvider,
  resetProvider,
  resolveModelForTier,
  getFallbackTiers,
  LlmProvider,
  AiSdkProvider,
} from "./providers";
export type {
  ProviderConfig,
  CompletionRequest,
  LlmResponse,
  StreamEvent,
  ContentBlock,
  ToolDefinition,
  LlmMessage,
  StopReason,
  ModelTier,
  UsageRecord,
} from "./providers";

// Model routing
export {
  getProviderForFeature,
  resolveResilientProvider,
  getProviderForTier,
  getFeatureTier,
  getFeatureTierMap,
  getFeatureProviderMap,
  getAllProviderHealth,
  completeWithFallback,
  estimateCostMicros,
  onUsage,
  onRequestLog,
} from "./routing";
export type { ProviderHealthStatus } from "./routing";

// Feature flags
export {
  resolveFeatureStatus,
  canMakeLlmCall,
  canFeatureCallLlm,
  DEFAULT_AI_FLAGS,
  DEFAULT_COMPANION_NAME,
  AI_FEATURE_LIST,
} from "./feature-flags";
export type {
  AiFeatureName,
  AiDataMode,
  AiWriteMode,
  AiFeatureConfig,
  AiFeatureFlagsState,
  AiFeatureStatus,
  AiFeatureMeta,
} from "./feature-flags";

// Plan configuration (single source of truth for all plan data)
// Note: MICROS_PER_CREDIT is intentionally NOT exported here — it's an internal
// conversion constant used only by server-side ai-feature-flags.ts. Import it
// directly from "./plans.config" where needed.
export {
  PLANS,
  AI_CREDITS_PER_USD,
  getEnabledPlans,
  getPlan,
  getPlanLimits,
} from "./plans.config";
export type { PlanKey, PlanDefinition } from "./plans.config";

// Embeddings
export {
  createEmbeddingService,
  resetEmbeddingService,
  OpenAIEmbeddingProvider,
  NoopEmbeddingProvider,
  type EmbeddingService,
} from "./embeddings";

// Types
export type {
  FinancialSnapshot,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ToolCallResult,
  StreamChunk,
  ToolHandler,
  ToolContext,
  InsightType,
  Insight,
} from "./types";

// Revenue tool schemas (canonical, single source of truth)
export {
  PricingTierSchema,
  SubscriptionParamsSchema,
  OneTimeParamsSchema,
  UsageBasedParamsSchema,
  ServicesParamsSchema,
  MarketplaceParamsSchema,
  EcommerceParamsSchema,
  HardwareParamsSchema,
  RevenueStreamTypeSchema,
  AddRevenueStreamSchema,
  UpdateRevenueStreamSchema,
} from "./schemas/revenue";

// Funding tool schemas (canonical, single source of truth; roundType immutability enforced)
export * from "./schemas/funding";

// Generative UI (display/input tool sets + form-spec builder + types)
export * from "./generative-ui";

// Provider catalog (P2 — preset knowledge: base URLs, auth style, discovery, known models)
export * from "./catalog";

// Tool-loop convergence guard (pure functions)
export { toolSignature, seedSignatureCounts, checkGuard, type GuardLimits, type GuardDecision } from "./tool-loop-guard";

// Permissions (tool categorization + pure resolver)
export {
  resolvePermission,
  categorizeToolName,
  listBuiltinToolsForControl,
  BUILTIN_PERMISSION_DEFAULTS,
  MUTATION_TOOL_NAMES,
} from "./permissions";
export type {
  PermissionCategory,
  PermissionMode,
  PermissionDecision,
  PermissionDefaults,
  ResolvePermissionContext,
  BuiltinToolControl,
} from "./permissions";

// Durable chat-turn event log types (single source of truth)
export type { TurnEvent, TurnEventType, TurnEventPayload, ToolUseRef, OpenGate } from "./turn-log/types";
export { projectModelThread } from "./turn-log/project-model-thread";
