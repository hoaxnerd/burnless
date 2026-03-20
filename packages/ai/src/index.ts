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

// Prompts
export { SYSTEM_PROMPT, buildSystemMessage } from "./prompts";

// Provider system
export {
  createProvider,
  getProvider,
  resetProvider,
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
} from "./providers";

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
  AiFeatureConfig,
  AiFeatureFlagsState,
  AiFeatureStatus,
  AiFeatureMeta,
} from "./feature-flags";

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
