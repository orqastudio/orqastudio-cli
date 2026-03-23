#!/usr/bin/env node
/**
 * OrqaStudio CLI — general-purpose command-line interface.
 *
 * Usage:
 *   orqa install [prereqs|submodules|deps|link]  Dev environment setup
 *   orqa verify                                   Governance checks (integrity, version, license, readme)
 *   orqa check [rust|app|types|sdk|cli]           Code quality (lint, typecheck, format)
 *   orqa test [rust|app]                          Run test suites
 *   orqa enforce [path] [--json] [--fix]            Enforcement + integrity validation
 *   orqa plugin <subcommand>                      Plugin management
 *   orqa graph [--type <type>] [--status <s>]     Browse the artifact graph
 *   orqa version sync|bump|check|show             Version management
 *   orqa repo license|readme                      Repo maintenance audits
 */
import { runPluginCommand } from "./commands/plugin.js";
import { runIdCommand } from "./commands/id.js";
import { runMcpCommand } from "./commands/mcp.js";
import { runLspCommand } from "./commands/lsp.js";
import { runDebugCommand } from "./commands/debug.js";
import { runGraphCommand } from "./commands/graph.js";
import { runVersionCommand } from "./commands/version.js";
import { runRepoCommand } from "./commands/repo.js";
import { runInstallCommand } from "./commands/install.js";
import { runAuditCommand } from "./commands/audit.js";
import { runCheckCommand } from "./commands/check.js";
import { runTestCommand } from "./commands/test.js";
import { runDevCommand } from "./commands/dev.js";
import { runLinkCommand } from "./commands/link.js";
import { runEnforceCommand } from "./commands/enforce.js";
import { runDaemonCommand } from "./commands/daemon.js";
const USAGE = `
OrqaStudio CLI v0.1.0-dev

Usage: orqa <command> [options]

Commands:
  dev         Start the dev environment (Vite + Tauri)
  install     Full dev environment setup (prereqs, submodules, deps, link)
  audit       Full governance audit (integrity, version, license, readme)
  check       Code quality checks (lint, typecheck, format)
  test        Run test suites (rust, app)
  enforce     Enforcement + integrity validation (--fix, --mechanism, --report)
  id          Artifact ID management (generate, check, migrate)
  mcp         Start MCP server (connects to running app or spawns direct)
  lsp         Start LSP server (connects to running app or spawns direct)
  plugin      Plugin management (install, uninstall, list, update, registry, create)
  graph       Browse the artifact graph
  version     Version management (sync, bump, check, show)
  repo        Repo maintenance (license audit, readme audit)
  link        Cross-platform symlink management (create, verify, status)
  daemon      Manage the validation daemon (start, stop, status)
  log         Log enforcement responses (enforcement-response)

Options:
  --help, -h     Show this help message
  --version, -v  Show version

Run 'orqa <command> --help' for more information on a specific command.
`.trim();
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
        console.log(USAGE);
        return;
    }
    if (args[0] === "--version" || args[0] === "-v") {
        console.log("0.1.0-dev");
        return;
    }
    const command = args[0];
    const commandArgs = args.slice(1);
    switch (command) {
        case "dev":
            await runDevCommand(commandArgs);
            break;
        case "install":
            await runInstallCommand(commandArgs);
            break;
        case "audit":
        case "verify": // backwards compat alias
            await runAuditCommand(commandArgs);
            break;
        case "check":
            await runCheckCommand(commandArgs);
            break;
        case "test":
            await runTestCommand(commandArgs);
            break;
        case "id":
            await runIdCommand(commandArgs);
            break;
        case "mcp":
            await runMcpCommand(commandArgs);
            break;
        case "lsp":
            await runLspCommand(commandArgs);
            break;
        case "plugin":
            await runPluginCommand(commandArgs);
            break;
        case "graph":
            await runGraphCommand(commandArgs);
            break;
        case "version":
            await runVersionCommand(commandArgs);
            break;
        case "repo":
            await runRepoCommand(commandArgs);
            break;
        case "debug":
            await runDebugCommand(commandArgs);
            break;
        case "link":
            await runLinkCommand(commandArgs);
            break;
        case "enforce":
            await runEnforceCommand(commandArgs);
            break;
        case "daemon":
            await runDaemonCommand(commandArgs);
            break;
        case "log":
            // orqa log enforcement-response → delegates to enforce response
            if (commandArgs[0] === "enforcement-response") {
                await runEnforceCommand(["response", ...commandArgs.slice(1)]);
            }
            else {
                console.error(`Unknown log subcommand: ${commandArgs[0] ?? "(none)"}`);
                console.error("Available: enforcement-response");
                process.exit(1);
            }
            break;
        default:
            console.error(`Unknown command: ${command}`);
            console.error("Run 'orqa --help' for available commands.");
            process.exit(1);
    }
}
main().catch((err) => {
    console.error("Fatal error:", err instanceof Error ? err.message : err);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map