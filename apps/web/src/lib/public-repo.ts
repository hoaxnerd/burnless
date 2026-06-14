/**
 * The public GitHub repository (owner/name). The CLI (`PUBLIC_RELEASE_REPO` in
 * packages/cli/src/bootstrap/release.ts) and `scripts/install.sh` hardcode the
 * same value; this is the single source for the web app's GitHub links and the
 * `/install` + `/latest` route handlers that front the GitHub-native
 * distribution from the cloud deployment (burnless.ai).
 */
export const PUBLIC_REPO = "hoaxnerd/burnless";

/** Canonical https URL to the public repository (for view-source / star links). */
export const GITHUB_REPO_URL = `https://github.com/${PUBLIC_REPO}`;
