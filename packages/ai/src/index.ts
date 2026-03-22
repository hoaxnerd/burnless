// @burnless/ai — AI companion for financial planning
// Provider-agnostic: supports Anthropic, OpenAI, OpenRouter, and more.
// Configure via AI_PROVIDER + AI_MODEL + AI_API_KEY env vars.

// Chat
export { chat, chatStream } from "./chat";

// Context assembly
export { buildFinancialSnapshot, formatContextForPrompt } from "./context";

// Tool definitions
export { getFinancialTools, financialTools } from "./tools";

// Insights
export { generateInsights } from "./insights";
export { generatePageInsights } from "./page-insights";
export type { InsightPage, PageInsightContext, PageInsight } from "./page-insights";

// Prompts
export { SYSTEM_PROMPT, buildSystemMessage } from "./prompts";

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
  AnthropicProvider,
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
