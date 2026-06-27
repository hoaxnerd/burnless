#!/usr/bin/env node
/**
 * Publish backstop for the MANUAL `npm publish` path.
 *
 * The release CI runs scripts/verify-npm-package.sh (which rebuilds + checks the version),
 * but a maintainer publishing by hand bypasses CI — which is exactly how burnless@0.3.0
 * once shipped a stale dist/ (0.2.1 code) under a 0.3.0 package.json. `prepublishOnly`
 * runs `npm run build` first (so dist is never stale), then this script as a belt: it runs
 * the freshly-built CLI and asserts the version it reports equals package.json. Any drift
 * fails the publish with a clear message instead of shipping a mislabeled package.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const expected = JSON.parse(readFileSync(join(cliRoot, "package.json"), "utf8")).version;
const bin = join(cliRoot, "dist", "index.thin.js");

let reported;
try {
  // `--version` prints the bare CLI_VERSION (build metadata is only injected at packaging
  // time, which doesn't happen during npm publish); take the leading token defensively.
  reported = execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8" })
    .trim()
    .split(/\s+/)[0];
} catch (err) {
  console.error(`✗ could not run the built CLI at ${bin}.\n  Did "npm run build" succeed?\n  ${err.message}`);
  process.exit(1);
}

if (reported !== expected) {
  console.error(
    `✗ version drift — package.json is ${expected} but the built CLI reports ${reported}.\n` +
      `  The dist/ is stale. Run "npm run build" before publishing (prepublishOnly does this for you).`,
  );
  process.exit(1);
}
console.log(`✓ built CLI reports ${reported}, matching package.json — safe to publish`);
