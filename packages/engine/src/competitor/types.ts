export type Severity = "info" | "success" | "warning" | "error";
export type StructuredPayload = Record<string, unknown>;

export interface Change {
  kind: "added" | "removed" | "modified";
  path: string[];
  before?: unknown;
  after?: unknown;
}

export interface Alert {
  changeType: string;
  summary: string;
  severity: Severity;
  before?: unknown;
  after?: unknown;
}
