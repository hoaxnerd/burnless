import type { Command } from "commander";
import { runAction } from "../context";
import { UsageError } from "../errors";

const VERBS = [
  "start", "db", "health", "doctor", "bootstrap", "login", "logout", "whoami",
  "status", "tools", "profiles", "call", "mcp", "completion",
];

function bashScript(): string {
  return `# burnless bash completion — eval "$(burnless completion bash)"
_burnless() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "${VERBS.join(" ")}" -- "$cur") )
}
complete -F _burnless burnless
`;
}

function zshScript(): string {
  return `# burnless zsh completion — eval "$(burnless completion zsh)"
_burnless() { compadd ${VERBS.join(" ")} }
compdef _burnless burnless
`;
}

function fishScript(): string {
  return VERBS.map((v) => `complete -c burnless -n __fish_use_subcommand -a ${v}`).join("\n") + "\n";
}

/** `burnless completion <bash|zsh|fish>` — print a shell completion script to stdout. */
export function registerCompletion(program: Command): void {
  program
    .command("completion")
    .description("Print a shell completion script (bash|zsh|fish)")
    .argument("<shell>", "bash, zsh, or fish")
    .action(async (shell: string, _opts, cmd: Command) => {
      await runAction(cmd, async () => {
        const script =
          shell === "bash" ? bashScript() : shell === "zsh" ? zshScript() : shell === "fish" ? fishScript() : null;
        if (!script) throw new UsageError(`Unknown shell "${shell}" (expected bash|zsh|fish).`);
        process.stdout.write(script);
      });
    });
}
