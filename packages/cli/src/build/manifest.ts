/**
 * Content manifest for a built artifact: every file's sha256 + byte length. Used to
 * emit `manifest.json` (integrity record; the per-file companion to the tarball's own
 * `.sha256`) and to verify an extracted artifact wasn't corrupted.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
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
    }
  }
}

function sha256(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
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
      return { path: rel, sha256: sha256(abs), bytes: statSync(abs).size };
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
