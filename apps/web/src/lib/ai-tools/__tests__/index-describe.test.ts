// apps/web/src/lib/ai-tools/__tests__/index-describe.test.ts
import { describe, it, expect, vi } from "vitest";

// Import-graph isolation: ../index pulls data.ts → @/lib/auth → next-auth, which
// cannot resolve in vitest. Mock the framework seams only.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import { describeToolAction } from "../index";

describe("describeToolAction record_ prefix", () => {
  it("labels record_transaction as 'record …', not 'delete …'", () => {
    const label = describeToolAction("record_transaction", { amount: 12480 });
    expect(label.startsWith("record")).toBe(true);
    expect(label).not.toContain("delete");
  });
});
