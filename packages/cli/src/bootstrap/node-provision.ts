/**
 * Node provisioner (spec §3.3 / D1/D2/D8). Pure-JS twin of scripts/provision-node.sh
 * for the npm/npx path. Downloads the pinned Node on glibc-Linux + macOS; on Alpine/musl
 * it is a no-op (the apk-installed node that launched npm is used). ZERO new deps.
 */
import { configDir } from "../config";
import { join } from "node:path";

export const PINNED_NODE_VERSION = "v22.14.0";

export interface NodeTarget {
  os: "linux" | "darwin";
  arch: "x64" | "arm64";
}

/** Map a Node `process.platform`/`process.arch` pair to a download target, or null if unsupported. */
export function nodeTargetFor(platform: string, arch: string): NodeTarget | null {
  const os = platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : null;
  const a = arch === "arm64" ? "arm64" : arch === "x64" ? "x64" : null;
  if (!os || !a) return null;
  return { os, arch: a };
}

export function nodeTarballName(version: string, t: NodeTarget): string {
  return `node-${version}-${t.os}-${t.arch}.tar.gz`;
}

export function nodeBaseUrl(env: NodeJS.ProcessEnv): string {
  const override = env.BURNLESS_NODE_DIST_URL?.trim();
  return override && override.length > 0 ? override : "https://nodejs.org/dist";
}

/** Pinned Node lives under the burnless home so it survives artifact updates. */
export function runtimeDir(home?: string): string {
  return join(configDir(home), "runtime");
}

export function vendoredNodePath(home?: string): string {
  return join(runtimeDir(home), "bin", "node");
}
