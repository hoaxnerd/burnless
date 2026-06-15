/**
 * Release download/verify/extract engine (spec §2). Pure-JS, ZERO new deps: global fetch +
 * node:crypto (sha256) + system `tar` (extract) + fs symlinks. Shared by the npm thin entry's
 * download-on-demand (Model B) and `burnless update`. Checksum is verified BEFORE unpack.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync,
  symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configDir } from "../config";

export const PUBLIC_RELEASE_REPO = "hoaxnerd/burnless";

/**
 * Public default download base for a SPECIFIC version. Assets live on GitHub Releases under
 * tag `v<ver>`: https://github.com/<org>/burnless/releases/download/v<ver>/burnless-<ver>.tar.gz
 * (+ .sha256). Tarballs are served DIRECT from GitHub Releases (not proxied through
 * burnless.ai — too large); `burnless.ai/latest` resolves the version string, install.sh
 * builds this base from it.
 */
export function publicReleaseBaseFor(version: string): string {
  return `https://github.com/${PUBLIC_RELEASE_REPO}/releases/download/v${version}/`;
}

/**
 * Resolve the release download base. Honors the `BURNLESS_RELEASE_BASE_URL` env override
 * (used by the install-acceptance harness with `file://`); otherwise falls back to the
 * versioned GitHub-Releases default for `version`. `version` is required for the default
 * because each release's assets live under its own `v<ver>` tag directory.
 */
export function resolveReleaseSource(
  version: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = env.BURNLESS_RELEASE_BASE_URL?.trim();
  return base && base.length > 0 ? base : publicReleaseBaseFor(version);
}

export function versionsDir(home?: string): string {
  return join(configDir(home), "versions");
}

function tarballName(version: string): string {
  return `burnless-${version}.tar.gz`;
}

/** Fetch bytes from an http(s) or file:// URL (no deps). */
export async function fetchBytes(url: string): Promise<Buffer> {
  // Some Node builds reject file:// in global fetch — read the path directly.
  if (url.startsWith("file:")) {
    return readFileSync(fileURLToPath(url));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Download the tarball + its .sha256, verify, and persist to `dest` ONLY on a match. */
export async function downloadAndVerify(opts: {
  base: string;
  version: string;
  dest: string;
}): Promise<void> {
  const name = tarballName(opts.version);
  const baseSlash = opts.base.endsWith("/") ? opts.base : opts.base + "/";
  const tarBytes = await fetchBytes(baseSlash + name);
  const shaText = (await fetchBytes(baseSlash + name + ".sha256")).toString("utf8");
  const expected = shaText.trim().split(/\s+/)[0]?.toLowerCase();
  const actual = createHash("sha256").update(tarBytes).digest("hex");
  if (!expected || expected !== actual) {
    throw new Error(`checksum mismatch for ${name} (expected ${expected ?? "<none>"}, got ${actual})`);
  }
  mkdirSync(dirname(opts.dest), { recursive: true });
  writeFileSync(opts.dest, tarBytes);
}

/** Extract a verified tarball into versions/<version> (atomic via a temp dir + rename). */
export function extractArtifact(opts: { tarball: string; version: string; home?: string }): string {
  const vdir = versionsDir(opts.home);
  mkdirSync(vdir, { recursive: true });
  const staging = mkdtempSync(join(vdir, `.staging-${opts.version}-`));
  try {
    execFileSync("tar", ["-xzf", opts.tarball, "-C", staging], { stdio: "inherit" });
    const final = join(vdir, opts.version);
    rmSync(final, { recursive: true, force: true });
    renameSync(staging, final);
    return final;
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    throw e;
  }
}

/** Atomically point versions/current → <version> (symlink swap via rename). */
export function flipCurrent(version: string, home?: string): void {
  const vdir = versionsDir(home);
  const cur = join(vdir, "current");
  const tmp = join(vdir, `.current-${version}`);
  rmSync(tmp, { force: true });
  symlinkSync(version, tmp); // relative target → portable
  renameSync(tmp, cur); // atomic replace
}

export function installedVersions(home?: string): string[] {
  const vdir = versionsDir(home);
  if (!existsSync(vdir)) return [];
  return readdirSync(vdir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
}

/** Ensure versions/<version> exists (download+verify+extract if absent) and current points at it. */
export async function ensureArtifact(opts: {
  base?: string;
  version: string;
  home?: string;
  flip?: boolean; // default true
}): Promise<string> {
  const base = opts.base ?? resolveReleaseSource(opts.version);
  const vdir = versionsDir(opts.home);
  const target = join(vdir, opts.version);
  if (!existsSync(join(target, ".burnless-artifact"))) {
    const dl = join(tmpdir(), `burnless-${opts.version}-${process.pid}.tar.gz`);
    try {
      await downloadAndVerify({ base, version: opts.version, dest: dl });
      extractArtifact({ tarball: dl, version: opts.version, home: opts.home });
    } finally {
      rmSync(dl, { force: true });
    }
  }
  if (opts.flip !== false) flipCurrent(opts.version, opts.home);
  return target;
}
