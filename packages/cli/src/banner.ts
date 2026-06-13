/** Static ASCII wordmark shown on install, `start`, and a bare invocation (spec §4). */
import { bold, dim } from "./ansi";

const WORDMARK = String.raw`
 _                     _
| |__  _   _ _ __ _ __ | | ___  ___ ___
| '_ \| | | | '__| '_ \| |/ _ \/ __/ __|
| |_) | |_| | |  | | | | |  __/\__ \__ \
|_.__/ \__,_|_|  |_| |_|_|\___||___/___/
`;

export function renderBanner(version: string): string {
  const mark = WORDMARK.split("\n")
    .map((line) => bold(line))
    .join("\n");
  return `${mark}\n  ${dim(`burnless v${version} — the founder platform`)}\n`;
}
