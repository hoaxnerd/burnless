// scripts/build-artifact.ts
/**
 * S5 P4 — build the burnless fat-artifact (spec §5). Platform-agnostic (system-Node v1:
 * pure JS + WASM). Stages: Next standalone server + static + public + drizzle migrations
 * + tsup CLI + PGLite WASM/vector assets (which Next's tracer cannot copy — they load via
 * runtime import.meta.url), writes the marker + manifest, gates on completeness, then
 * tar.gz + sha256. Run: `pnpm build:artifact` (env BURNLESS_ARTIFACT_OUT overrides output).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_LAYOUT,
  ARTIFACT_LAYOUT_VERSION,
  ARTIFACT_MARKER,
} from "../packages/cli/src/local/artifact-layout";
import { buildManifest } from "../packages/cli/src/build/manifest";
import { verifyArtifact } from "../packages/cli/src/build/required-files";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(join(repoRoot, "packages/db/src/index.ts"));
const cliPkg = JSON.parse(readFileSync(join(repoRoot, "packages/cli/package.json"), "utf8")) as {
  version: string;
};
const version = cliPkg.version;

const stageDir = process.env.BURNLESS_ARTIFACT_STAGE ?? join(repoRoot, "dist-artifact", "stage");
const outDir = process.env.BURNLESS_ARTIFACT_OUT ?? join(repoRoot, "dist-artifact");
const tarball = join(outDir, `burnless-${version}.tar.gz`);

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = {}): void {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: repoRoot, stdio: "inherit", env: { ...process.env, ...env } });
}

function copyDir(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

/**
 * Source dir of an installed package (the dir holding its package.json).
 *
 * NOTE: `require.resolve("<pkg>/package.json")` THROWS ERR_PACKAGE_PATH_NOT_EXPORTED for
 * the PGLite packages — their `exports` map does not expose `./package.json`. So resolve
 * the package's main entry instead and walk UP to the directory whose own package.json
 * has a matching `name`. This is robust to nested dist/ layouts.
 */
function pkgDir(name: string): string {
  const mainEntry = require_.resolve(name);
  let dir = dirname(mainEntry);
  // Walk up to the package root (the dir holding a package.json with the matching name).
  for (let i = 0; i < 10; i += 1) {
    const pj = join(dir, "package.json");
    if (existsSync(pj)) {
      try {
        const parsed = JSON.parse(readFileSync(pj, "utf8")) as { name?: string };
        if (parsed.name === name) return dir;
      } catch {
        // ignore unparsable package.json and keep climbing
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate package root for "${name}" starting from ${mainEntry}`);
}

/** Copy a complete `dist/` from source over every staged copy of that package
 *  (Next's nft copies the JS but not the runtime-URL-loaded WASM/tarball assets). */
function ensurePgliteAssets(pkgName: string, sentinels: string[]): void {
  const srcDist = join(pkgDir(pkgName), "dist");
  // Verify the source actually carries the runtime assets before staging.
  for (const sentinel of sentinels) {
    const abs = join(srcDist, sentinel);
    if (!existsSync(abs)) {
      throw new Error(`PGLite source asset missing: ${abs} (cannot stage ${pkgName})`);
    }
  }
  // 1. canonical copy for the CLI (resolves by walking up from <root>/cli/).
  const canonical = join(stageDir, "node_modules", ...pkgName.split("/"), "dist");
  copyDir(srcDist, canonical);
  // 2. overwrite every traced copy under web/ so the server resolves complete assets.
  const webRoot = join(stageDir, "web");
  for (const dir of findPackageDistDirs(webRoot, pkgName)) copyDir(srcDist, dir);
}

/** Find every `<...>/node_modules/<pkgName>/dist` directory under `root`. */
function findPackageDistDirs(root: string, pkgName: string): string[] {
  const matches: string[] = [];
  const segs = pkgName.split("/");
  const walk = (dir: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const abs = join(dir, e.name);
      if (e.name === "node_modules") {
        const candidate = join(abs, ...segs, "dist");
        if (existsSync(candidate)) matches.push(candidate);
        walk(abs); // nested node_modules
      } else {
        walk(abs);
      }
    }
  };
  walk(root);
  return matches;
}

async function main(): Promise<void> {
  console.log(`Building burnless fat-artifact v${version} (system-Node, platform-agnostic)`);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  // 1. Next standalone build (the --webpack pin is load-bearing; NEXT_STANDALONE gates output).
  run("pnpm", ["--filter", "@burnless/web", "build"], { NEXT_STANDALONE: "true" });

  // 2. Stage the standalone server + the assets Next does NOT auto-include.
  const webBuild = join(repoRoot, "apps/web/.next");
  copyDir(join(webBuild, "standalone"), join(stageDir, "web"));
  copyDir(join(webBuild, "static"), join(stageDir, "web/apps/web/.next/static"));
  const publicDir = join(repoRoot, "apps/web/public");
  if (existsSync(publicDir)) copyDir(publicDir, join(stageDir, "web/apps/web/public"));

  // 3. CLI bundle (pglite external — Task 1).
  run("pnpm", ["--filter", "burnless", "build"]);
  copyDir(join(repoRoot, "packages/cli/dist"), join(stageDir, "cli"));

  // 4. Migrations (exclude the pre-collapse archive).
  copyDir(join(repoRoot, "packages/db/drizzle"), join(stageDir, ARTIFACT_LAYOUT.migrationsDir));
  rmSync(join(stageDir, ARTIFACT_LAYOUT.migrationsDir, ".pre-collapse-archive"), {
    recursive: true,
    force: true,
  });

  // 5. PGLite WASM + vector assets (the 2a fix — staged + every traced copy completed).
  ensurePgliteAssets("@electric-sql/pglite", ["pglite.wasm", "pglite.data"]);
  ensurePgliteAssets("@electric-sql/pglite-pgvector", ["vector.tar.gz"]);

  // 6. Marker + manifest.
  const builtAt = new Date().toISOString();
  writeFileSync(
    join(stageDir, ARTIFACT_MARKER),
    JSON.stringify({ layoutVersion: ARTIFACT_LAYOUT_VERSION, version, builtAt }, null, 2) + "\n",
  );
  const manifest = buildManifest(stageDir, { version, builtAt });
  writeFileSync(join(stageDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // 7. Completeness gate (fail the build, not the user's first boot).
  const missing = verifyArtifact(stageDir);
  if (missing.length > 0) {
    console.error(`\n✗ artifact incomplete — missing:\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }

  // 8. Compress + checksum.
  run("tar", ["-czf", tarball, "-C", stageDir, "."]);
  const sum = createHash("sha256").update(readFileSync(tarball)).digest("hex");
  writeFileSync(`${tarball}.sha256`, `${sum}  ${`burnless-${version}.tar.gz`}\n`);

  const sizeMb = (readFileSync(tarball).length / 1e6).toFixed(1);
  console.log(`\n✓ artifact complete: ${tarball} (${sizeMb} MB)`);
  console.log(`  sha256: ${sum}`);
  console.log(`  stage:  ${stageDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
