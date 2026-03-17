#!/usr/bin/env node

/**
 * OrqaStudio CLI — general-purpose command-line interface.
 *
 * Usage:
 *   orqa plugin <subcommand>                    Plugin management
 *   orqa validate [path] [--json]               Run integrity check
 *   orqa graph [--type <type>] [--status <s>]   Browse the artifact graph
 *   orqa version sync|bump|check|show           Version management
 *   orqa repo license|readme                    Repo maintenance audits
 *   orqa debug [command]                        Run debug tool
 */

import { runPluginCommand } from "./commands/plugin.js";
import { runValidateCommand } from "./commands/validate.js";
import { runDebugCommand } from "./commands/debug.js";
import { runGraphCommand } from "./commands/graph.js";
import { runVersionCommand } from "./commands/version.js";
import { runRepoCommand } from "./commands/repo.js";

const USAGE = `
OrqaStudio CLI v0.1.0-dev

Usage: orqa <command> [options]

Commands:
  plugin      Plugin management (install, uninstall, list, update, registry, create)
  validate    Run integrity validation on the current project
  graph       Browse the artifact graph
  version     Version management (sync, bump, check, show)
  repo        Repo maintenance (license audit, readme audit)
  debug       Run the debug tool

Options:
  --help, -h     Show this help message
  --version, -v  Show version

Run 'orqa <command> --help' for more information on a specific command.
`.trim();

async function main(): Promise<void> {
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
		case "plugin":
			await runPluginCommand(commandArgs);
			break;
		case "validate":
			await runValidateCommand(commandArgs);
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
