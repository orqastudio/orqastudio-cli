/**
 * Dev environment commands — submodule management, git operations.
 *
 * orqa dev status|commit|push|pull|release-check
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { readCanonicalVersion } from "../lib/version-sync.js";

const USAGE = `
Usage: orqa dev <subcommand> [options]

Subcommands:
  status              Show all submodule branches and latest commits
  commit [message]    Commit staged changes in all dirty submodules + dev repo
  push                Push all submodules + dev repo to origin
  pull                Pull all submodules + dev repo from origin
  release-check       Verify all repos are clean and on main
  update              Update all submodules to latest remote

Options:
  --help, -h          Show this help message
`.trim();

export async function runDevCommand(args: string[]): Promise<void> {
	const subcommand = args[0];

	if (!subcommand || subcommand === "--help" || subcommand === "-h") {
		console.log(USAGE);
		return;
	}

	const root = process.cwd();

	switch (subcommand) {
		case "status":
			cmdStatus(root);
			break;
		case "commit":
			cmdCommit(root, args.slice(1).join(" ") || undefined);
			break;
		case "push":
			cmdPush(root);
			break;
		case "pull":
			cmdPull(root);
			break;
		case "release-check":
			cmdReleaseCheck(root);
			break;
		case "update":
			cmdUpdate(root);
			break;
		default:
			console.error(`Unknown subcommand: ${subcommand}`);
			console.error(USAGE);
			process.exit(1);
	}
}

function cmdStatus(root: string): void {
	let version = "unknown";
	try { version = readCanonicalVersion(root); } catch { /* */ }

	console.log("=== Dev Environment Status ===");
	console.log(`Canonical version: ${version}\n`);

	const output = execSync(
		`git submodule foreach --quiet 'printf "%-35s %-12s %s\\n" "$sm_path" "$(git branch --show-current 2>/dev/null || echo detached)" "$(git log --oneline -1 2>/dev/null | cut -c1-50)"'`,
		{ cwd: root, encoding: "utf-8" },
	);
	console.log(output);
}

function cmdCommit(root: string, message?: string): void {
	let version = "unknown";
	try { version = readCanonicalVersion(root); } catch { /* */ }

	const msg = message ?? `Sync to ${version}`;

	console.log("=== Committing across submodules ===\n");

	const output = execSync(
		`git submodule foreach --quiet 'if [ -n "$(git status --porcelain)" ]; then echo "Committing: $sm_path"; git add -A && git commit -m "${msg}" || true; fi'`,
		{ cwd: root, encoding: "utf-8" },
	);
	if (output.trim()) console.log(output);

	console.log("=== Committing dev repo ===\n");
	try {
		execSync(`git add -A && git commit -m "${msg}"`, { cwd: root, encoding: "utf-8", stdio: "inherit" });
	} catch {
		console.log("Nothing to commit in dev repo.");
	}
}

function cmdPush(root: string): void {
	console.log("=== Pushing submodules ===\n");
	execSync(`git submodule foreach 'git push || true'`, { cwd: root, stdio: "inherit" });

	console.log("\n=== Pushing dev repo ===\n");
	execSync(`git push`, { cwd: root, stdio: "inherit" });
}

function cmdPull(root: string): void {
	console.log("=== Pulling dev repo ===\n");
	execSync(`git pull`, { cwd: root, stdio: "inherit" });

	console.log("\n=== Updating submodules ===\n");
	execSync(`git submodule update --remote --merge`, { cwd: root, stdio: "inherit" });
}

function cmdUpdate(root: string): void {
	execSync(`git submodule update --remote --merge`, { cwd: root, stdio: "inherit" });
	console.log("\nAll submodules updated to latest remote.");
}

function cmdReleaseCheck(root: string): void {
	let version = "unknown";
	try { version = readCanonicalVersion(root); } catch { /* */ }

	console.log("=== Release Readiness Check ===");
	console.log(`Version: ${version}\n`);

	let hasErrors = false;

	const output = execSync(
		`git submodule foreach --quiet 'BRANCH=$(git branch --show-current 2>/dev/null); DIRTY=$(git status --porcelain | wc -l | tr -d " "); if [ "$BRANCH" != "main" ]; then printf "  X %-35s branch: %s (expected main)\\n" "$sm_path" "$BRANCH"; elif [ "$DIRTY" -gt 0 ]; then printf "  X %-35s %s uncommitted changes\\n" "$sm_path" "$DIRTY"; else printf "  V %-35s clean on main\\n" "$sm_path"; fi'`,
		{ cwd: root, encoding: "utf-8" },
	);
	console.log(output);

	if (output.includes("  X ")) hasErrors = true;

	const devDirty = execSync(`git status --porcelain`, { cwd: root, encoding: "utf-8" }).trim();
	if (devDirty) {
		console.log("  X dev repo has uncommitted changes");
		hasErrors = true;
	} else {
		console.log("  V dev repo clean");
	}

	if (hasErrors) process.exit(1);
}
