// @burnless/ai — AI companion for financial planning
// Depends on @burnless/engine for calculations and @burnless/types for interfaces.
// Uses the Anthropic SDK for Claude API integration.

// Chat
export { chat, chatStream } from "./chat";

// Context assembly
export { buildFinancialSnapshot, formatContextForPrompt } from "./context";

// Tool definitions
export { financialTools } from "./tools";

// Insights
export { generateInsights } from "./insights";

// Prompts
export { SYSTEM_PROMPT, buildSystemMessage } from "./prompts";

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
