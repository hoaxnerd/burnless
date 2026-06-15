/**
 * Node provisioner (spec §3.3 / D1/D2/D8). Pure-JS twin of scripts/provision-node.sh
 * for the npm/npx path. Downloads the pinned Node on glibc-Linux + macOS; on Alpine/musl
 * it is a no-op (the apk-installed node that launched npm is used). ZERO new deps.
 */
import { configDir } from "../config";
import { join } from "node:path";
import { existsSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fetchBytes } from "./release";

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

const MUSL_LOADERS = ["/lib/ld-musl-x86_64.so.1", "/lib/ld-musl-aarch64.so.1"];

/** Detect a musl-libc Linux (Alpine). Inputs injectable for tests. */
export function isMuslLinux(opts: {
  platform?: string;
  existsFn?: (p: string) => boolean;
} = {}): boolean {
  const platform = opts.platform ?? process.platform;
  if (platform !== "linux") return false;
  const exists = opts.existsFn ?? existsSync;
  if (exists("/etc/alpine-release")) return true;
  return MUSL_LOADERS.some((p) => exists(p));
}

export type EnsureNodeResult =
  | { provisioned: true; path: string }
  | { provisioned: false; reason: "musl" };

interface DownloadExtractArgs {
  url: string;
  shasumsUrl: string;
  tarballName: string;
  destRuntimeDir: string;
}

/** Download a Node tarball, verify it against SHASUMS256.txt, extract into destRuntimeDir. */
async function downloadAndExtractNode(args: DownloadExtractArgs): Promise<void> {
  const tarBytes = await fetchBytes(args.url);
  const shaText = (await fetchBytes(args.shasumsUrl)).toString("utf8");
  const line = shaText.split("\n").find((l) => l.trim().endsWith(args.tarballName));
  const expected = line?.trim().split(/\s+/)[0]?.toLowerCase();
  const actual = createHash("sha256").update(tarBytes).digest("hex");
  if (!expected || expected !== actual) {
    throw new Error(`node checksum mismatch for ${args.tarballName} (expected ${expected ?? "<none>"}, got ${actual})`);
  }
  const staging = mkdtempSync(join(tmpdir(), "burnless-node-"));
  try {
    const tarPath = join(staging, args.tarballName);
    writeFileSync(tarPath, tarBytes);
    execFileSync("tar", ["-xzf", tarPath, "-C", staging], { stdio: "inherit" });
    const inner = readdirSync(staging, { withFileTypes: true })
      .find((e) => e.isDirectory() && e.name.startsWith("node-"));
    if (!inner) throw new Error("node tarball had no node-* directory");
    mkdirSync(args.destRuntimeDir, { recursive: true });
    cpSync(join(staging, inner.name), args.destRuntimeDir, { recursive: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Ensure a usable pinned Node is present for the app. No-op on musl (apk node is used). */
export async function ensureVendoredNode(opts: {
  home?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string;
  arch?: string;
  isMusl?: boolean;
  existsFn?: (p: string) => boolean;
  downloadAndExtractFn?: (args: DownloadExtractArgs) => Promise<void>;
}): Promise<EnsureNodeResult> {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const exists = opts.existsFn ?? existsSync;
  const musled = opts.isMusl ?? isMuslLinux({ platform, existsFn: exists });
  if (musled) return { provisioned: false, reason: "musl" };

  const target = nodeTargetFor(platform, arch);
  if (!target) throw new Error(`unsupported platform for Node provisioning: ${platform}/${arch}`);

  const nodePath = vendoredNodePath(opts.home);
  if (exists(nodePath)) return { provisioned: true, path: nodePath };

  const base = nodeBaseUrl(env).replace(/\/$/, "");
  const tarballName = nodeTarballName(PINNED_NODE_VERSION, target);
  const download = opts.downloadAndExtractFn ?? downloadAndExtractNode;
  await download({
    url: `${base}/${PINNED_NODE_VERSION}/${tarballName}`,
    shasumsUrl: `${base}/${PINNED_NODE_VERSION}/SHASUMS256.txt`,
    tarballName,
    destRuntimeDir: runtimeDir(opts.home),
  });
  return { provisioned: true, path: nodePath };
}
