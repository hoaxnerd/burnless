/**
 * Input sanitization for LLM prompts.
 *
 * Defends against prompt injection by:
 * 1. Stripping patterns that attempt to override system instructions
 * 2. Limiting message length to prevent context overflow attacks
 * 3. Removing embedded system/role-switching markers
 */

/** Maximum user message length (characters). */
const MAX_MESSAGE_LENGTH = 10_000;

/**
 * Patterns that indicate prompt injection attempts.
 * These try to override system instructions or switch roles.
 */
const INJECTION_PATTERNS = [
  // Role-switching attempts
  /\b(?:system|assistant)\s*:/gi,
  // Explicit instruction override
  /ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)/gi,
  /disregard\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)/gi,
  /forget\s+(?:all\s+)?(?:your|previous|prior)\s+(?:instructions?|prompts?|rules?)/gi,
  // Prompt extraction
  /(?:repeat|show|print|reveal|display|output)\s+(?:your|the|all)?\s*(?:system\s+)?(?:prompt|instructions?|rules?)/gi,
  // Role impersonation
  /you\s+are\s+now\s+(?:a|an)\s+/gi,
  /(?:pretend|act)\s+(?:to\s+be|as\s+if|like)\s+/gi,
  /new\s+(?:instructions?|rules?|role)\s*:/gi,
  // XML/markdown injection into structured prompts
  /```\s*system\b/gi,
  /<\/?system>/gi,
];

/**
 * Sanitize a user message before sending to the LLM.
 *
 * Returns the sanitized message. Does NOT throw — degraded input
 * is better than a broken user experience.
 */
export function sanitizeUserMessage(message: string): string {
  // Truncate to max length
  let sanitized = message.length > MAX_MESSAGE_LENGTH
    ? message.slice(0, MAX_MESSAGE_LENGTH)
    : message;

  // Strip null bytes and other control characters (except newlines, tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Neutralize injection patterns by wrapping matched text in brackets
  // This preserves the user's intent while defanging the injection
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => `[${match}]`);
  }

  return sanitized;
}

/**
 * Check if a message contains suspicious injection patterns.
 * Returns true if the message appears to be an injection attempt.
 * Used for logging/monitoring, not blocking.
 */
export function detectInjectionAttempt(message: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0; // Reset regex state
    return pattern.test(message);
  });
}
