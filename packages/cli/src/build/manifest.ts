/**
 * Content manifest for a built artifact: every file's sha256 + byte length. Used to
 * emit `manifest.json` (integrity record; the per-file companion to the tarball's own
 * `.sha256`) and to verify an extracted artifact wasn't corrupted.
 */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ARTIFACT_LAYOUT_VERSION } from "../local/artifact-layout";

export interface ManifestFile {
  path: string; // POSIX-style relative path
  sha256: string;
  bytes: number;
}
export interface Manifest {
  version: string;
  layoutVersion: number;
  builtAt: string;
  files: ManifestFile[];
}

function walk(dir: string, root: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, root, out);
    } else if (entry.isFile()) {
      out.push(relative(root, abs));
    } else if (entry.isSymbolicLink()) {
      // Record the symlink itself (hashed by its link TARGET STRING below), but do NOT
      // recurse INTO it — following links risks node_modules symlink cycles/explosion.
      out.push(relative(root, abs));
    }
  }
}

/**
 * Hash a manifest entry. For a symlink, hash its link TARGET STRING (not the resolved
 * content) — cycle-safe and detects retargeting. For a regular file, hash its content.
 */
function sha256(abs: string): string {
  const content = lstatSync(abs).isSymbolicLink() ? Buffer.from(readlinkSync(abs)) : readFileSync(abs);
  return createHash("sha256").update(content).digest("hex");
}

export interface ManifestMeta {
  version: string;
  builtAt: string;
}

/** Index every file under `root` (excluding the manifest itself), POSIX-normalized. */
export function buildManifest(root: string, meta: ManifestMeta): Manifest {
  const rels: string[] = [];
  walk(root, root, rels);
  const files = rels
    .map((rel) => rel.split(sep).join("/"))
    .filter((rel) => rel !== "manifest.json")
    .sort()
    .map<ManifestFile>((rel) => {
      const abs = join(root, ...rel.split("/"));
      const bytes = lstatSync(abs).isSymbolicLink() ? readlinkSync(abs).length : statSync(abs).size;
      return { path: rel, sha256: sha256(abs), bytes };
    });
  return { version: meta.version, layoutVersion: ARTIFACT_LAYOUT_VERSION, builtAt: meta.builtAt, files };
}

/** Returns the paths whose on-disk content no longer matches the manifest ([] = intact). */
export function verifyManifest(root: string, manifest: Manifest): string[] {
  const problems: string[] = [];
  for (const f of manifest.files) {
    const abs = join(root, ...f.path.split("/"));
    try {
      if (sha256(abs) !== f.sha256) problems.push(f.path);
    } catch {
      problems.push(f.path);
    }
  }
  return problems;
}
