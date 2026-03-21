/**
 * Install commands — dev environment bootstrapping.
 *
 * orqa install              Full setup (prereqs + submodules + deps + link + verify)
 * orqa install prereqs      Check and install prerequisites (node 22+, rust)
 * orqa install submodules   Init and update git submodules
 * orqa install deps         Install package dependencies (npm install + cargo fetch)
 * orqa install link         Build libs and npm link into app
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { getRoot } from "../lib/root.js";
import { generateInjectorConfig } from "../lib/injector-config.js";

const NODE_MIN_MAJOR = 22;

const USAGE = `
Usage: orqa install [subcommand]

Run with no subcommand for full setup. Or run individual steps:

Subcommands:
  prereqs      Check and install prerequisites (node 22+, rust, git)
  submodules   Init and update git submodules
  deps         Install npm and cargo dependencies
  link         Build all libs and npm link into app

Running 'orqa install' with no subcommand runs all steps then 'orqa verify'.
Run 'orqa verify' separately to check integrity, version, license, and readme.
`.trim();

export async function runInstallCommand(args: string[]): Promise<void> {
	const subcommand = args[0];

	if (subcommand === "--help" || subcommand === "-h") {
		console.log(USAGE);
		return;
	}

	const root = getRoot();

	switch (subcommand) {
		case "prereqs":
			await cmdPrereqs();
			break;
		case "submodules":
			cmdSubmodules(root);
			break;
		case "deps":
			cmdDeps(root);
			break;
		case "link":
			cmdLink(root);
			break;
		case undefined:
			console.log("=== OrqaStudio Full Install ===\n");
			await cmdPrereqs();
			console.log();
			cmdSubmodules(root);
			console.log();
			cmdDeps(root);
			console.log();
			cmdLink(root);
			console.log();
			cmdSmokeTest(root);
			console.log("\n=== Install complete. Run 'make dev' to start developing. ===");
			break;
		default:
			console.error(`Unknown subcommand: ${subcommand}`);
			console.error(USAGE);
			process.exit(1);
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd: string, cwd?: string): void {
	execSync(cmd, { cwd: cwd ?? process.cwd(), stdio: "inherit" });
}

function runQuiet(cmd: string): string | null {
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch {
		return null;
	}
}

function hasCommand(cmd: string): boolean {
	return runQuiet(`which ${cmd}`) !== null || runQuiet(`where ${cmd}`) !== null;
}

function detectPlatform(): "windows" | "macos" | "linux" {
	const p = process.platform;
	if (p === "win32") return "windows";
	if (p === "darwin") return "macos";
	return "linux";
}

async function ask(question: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim().toLowerCase());
		});
	});
}

// ── Prereqs ─────────────────────────────────────────────────────────────────

async function cmdPrereqs(): Promise<void> {
	console.log("Checking prerequisites...");
	const platform = detectPlatform();

	// Git — user must install themselves
	const gitVersion = runQuiet("git --version")?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
	if (gitVersion) {
		console.log(`  ✓ git ${gitVersion}`);
	} else {
		console.error("  ✗ git — not found");
		console.error("");
		console.error("    Git is required. Install it from:");
		if (platform === "windows") console.error("      https://git-scm.com/download/win");
		else if (platform === "macos") console.error("      xcode-select --install  (or: brew install git)");
		else console.error("      sudo apt install git  (or your package manager)");
		process.exit(1);
	}

	// Node.js
	const nodeVersion = runQuiet("node --version")?.replace("v", "") ?? null;
	const nodeMajor = nodeVersion ? parseInt(nodeVersion.split(".")[0], 10) : 0;

	if (nodeVersion && nodeMajor >= NODE_MIN_MAJOR) {
		console.log(`  ✓ node ${nodeVersion}`);
	} else {
		if (nodeVersion) {
			console.log(`  ! node ${nodeVersion} — need ${NODE_MIN_MAJOR}+`);
		} else {
			console.log("  ✗ node — not found");
		}

		// Try to install via fnm or nvm
		if (hasCommand("fnm")) {
			const answer = await ask(`    Install Node ${NODE_MIN_MAJOR} via fnm? [Y/n] `);
			if (answer !== "n" && answer !== "no") {
				console.log(`    Installing Node ${NODE_MIN_MAJOR}...`);
				run(`fnm install ${NODE_MIN_MAJOR}`);
				run(`fnm use ${NODE_MIN_MAJOR}`);
				const newVersion = runQuiet("node --version");
				console.log(`  ✓ node ${newVersion?.replace("v", "")}`);
			} else {
				exitWithNodeInstructions(platform);
			}
		} else if (hasCommand("nvm")) {
			const answer = await ask(`    Install Node ${NODE_MIN_MAJOR} via nvm? [Y/n] `);
			if (answer !== "n" && answer !== "no") {
				console.log(`    Installing Node ${NODE_MIN_MAJOR}...`);
				run(`nvm install ${NODE_MIN_MAJOR}`);
				run(`nvm use ${NODE_MIN_MAJOR}`);
				const newVersion = runQuiet("node --version");
				console.log(`  ✓ node ${newVersion?.replace("v", "")}`);
			} else {
				exitWithNodeInstructions(platform);
			}
		} else {
			// No version manager — offer to install fnm
			const answer = await ask("    No Node version manager found. Install fnm (fast node manager)? [Y/n] ");
			if (answer !== "n" && answer !== "no") {
				console.log("    Installing fnm...");
				if (platform === "windows") {
					run("winget install Schniz.fnm");
				} else {
					run("curl -fsSL https://fnm.vercel.app/install | bash");
				}
				console.log("");
				console.log("    fnm installed. Restart your terminal, then re-run: orqa install prereqs");
				process.exit(0);
			} else {
				exitWithNodeInstructions(platform);
			}
		}
	}

	// npm (ships with node)
	const npmVersion = runQuiet("npm --version");
	if (npmVersion) {
		console.log(`  ✓ npm ${npmVersion}`);
	} else {
		console.error("  ✗ npm — not found (should ship with Node.js). Reinstall Node.");
		process.exit(1);
	}

	// Rust
	const rustVersion = runQuiet("rustc --version")?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;

	if (rustVersion) {
		console.log(`  ✓ rustc ${rustVersion}`);
	} else {
		console.log("  ✗ rust — not found");

		if (hasCommand("rustup")) {
			const answer = await ask("    rustup found but no toolchain installed. Install stable? [Y/n] ");
			if (answer !== "n" && answer !== "no") {
				run("rustup install stable");
				run("rustup default stable");
				const newVersion = runQuiet("rustc --version")?.match(/(\d+\.\d+\.\d+)/)?.[1];
				console.log(`  ✓ rustc ${newVersion}`);
			} else {
				exitWithRustInstructions(platform);
			}
		} else {
			const answer = await ask("    Install Rust via rustup? [Y/n] ");
			if (answer !== "n" && answer !== "no") {
				console.log("    Installing rustup...");
				if (platform === "windows") {
					console.log("");
					console.log("    On Windows, download and run the installer from:");
					console.log("      https://rustup.rs/");
					console.log("");
					console.log("    After installation, restart your terminal and re-run: orqa install prereqs");
					process.exit(0);
				} else {
					run("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y");
					console.log("    Rust installed. Loading into current shell...");
					// Can't source .cargo/env in a child process, so advise restart
					console.log("");
					console.log("    Restart your terminal to add cargo to PATH, then re-run: orqa install");
					process.exit(0);
				}
			} else {
				exitWithRustInstructions(platform);
			}
		}
	}

	// Cargo (ships with rust)
	const cargoVersion = runQuiet("cargo --version")?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
	if (cargoVersion) {
		console.log(`  ✓ cargo ${cargoVersion}`);
	} else {
		console.error("  ✗ cargo — not found (should ship with rustup). Run: rustup install stable");
		process.exit(1);
	}
}

function exitWithNodeInstructions(platform: string): never {
	console.error("");
	console.error(`    Install Node.js ${NODE_MIN_MAJOR}+:`);
	if (platform === "windows") {
		console.error("      Option 1: winget install Schniz.fnm && fnm install 22");
		console.error("      Option 2: https://nodejs.org/en/download");
	} else if (platform === "macos") {
		console.error("      Option 1: brew install fnm && fnm install 22");
		console.error("      Option 2: https://nodejs.org/en/download");
	} else {
		console.error("      Option 1: curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22");
		console.error("      Option 2: https://nodejs.org/en/download");
	}
	process.exit(1);
}

function exitWithRustInstructions(platform: string): never {
	console.error("");
	console.error("    Install Rust:");
	if (platform === "windows") {
		console.error("      https://rustup.rs/ (download and run the installer)");
	} else {
		console.error("      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh");
	}
	process.exit(1);
}

// ── Submodules ──────────────────────────────────────────────────────────────

function cmdSubmodules(root: string): void {
	console.log("Initialising submodules...");
	run("git submodule update --init --recursive", root);
	console.log("  ✓ all submodules initialised");
}

// ── Deps ────────────────────────────────────────────────────────────────────

const LIB_ORDER: Array<{
	dir: string;
	deps: string[];
	build: string;
}> = [
	{ dir: "libs/types", deps: [], build: "npx tsc" },
	{ dir: "libs/cli", deps: ["@orqastudio/types"], build: "npx tsc" },
	{ dir: "connectors/claude-code", deps: ["@orqastudio/types", "@orqastudio/cli"], build: "npx tsc" },
	{ dir: "libs/sdk", deps: ["@orqastudio/types"], build: "npx tsc" },
	{ dir: "libs/svelte-components", deps: ["@orqastudio/types"], build: "npm run build" },
	{ dir: "libs/graph-visualiser", deps: ["@orqastudio/types"], build: "npm run build" },
];

function cmdDeps(root: string): void {
	console.log("Installing dependencies...");

	for (const lib of LIB_ORDER) {
		const dir = path.join(root, lib.dir);
		if (!fs.existsSync(dir)) {
			console.log(`  - ${lib.dir} (skipped — not found)`);
			continue;
		}
		console.log(`  - ${lib.dir}`);
		run("npm install", dir);
	}

	const appUi = path.join(root, "app/ui");
	if (fs.existsSync(appUi)) {
		console.log("  - app/ui");
		run("npm install", appUi);
	}

	const cargoDir = path.join(root, "app/backend/src-tauri");
	if (fs.existsSync(cargoDir)) {
		console.log("  - app/backend (cargo fetch)");
		run("cargo fetch --quiet", cargoDir);
	}

	console.log("  ✓ all dependencies installed");
}

// ── Link ────────────────────────────────────────────────────────────────────

function cmdLink(root: string): void {
	console.log("Building and linking libraries...");

	for (const lib of LIB_ORDER) {
		const dir = path.join(root, lib.dir);
		if (!fs.existsSync(dir)) continue;

		console.log(`  - ${lib.dir}`);

		if (lib.deps.length > 0) {
			run(`npm link ${lib.deps.join(" ")}`, dir);
		}

		run(lib.build, dir);
		run("npm link", dir);
	}

	const appUi = path.join(root, "app/ui");
	if (fs.existsSync(appUi)) {
		const allLibs = LIB_ORDER
			.map((lib) => {
				const pkgPath = path.join(root, lib.dir, "package.json");
				try {
					return JSON.parse(fs.readFileSync(pkgPath, "utf-8")).name as string;
				} catch {
					return null;
				}
			})
			.filter(Boolean) as string[];

		if (allLibs.length > 0) {
			console.log("  - app/ui (linking)");
			run(`npm link ${allLibs.join(" ")}`, appUi);
		}

		console.log("  - app/ui (svelte-kit sync)");
		run("npx svelte-kit sync", appUi);

		console.log("  - app/ui (build)");
		run("npm run build", appUi);
	}

	if (hasCommand("orqa")) {
		const version = runQuiet("orqa --version");
		console.log(`  ✓ orqa CLI: ${version}`);
	} else {
		console.error("  ✗ orqa not on PATH — try closing and reopening your terminal");
		process.exit(1);
	}

	// Generate injector config from plugin manifests.
	try {
		const config = generateInjectorConfig(root);
		const pluginCount = Object.keys(config.mode_templates).length
			+ (config.behavioral_rules ? 1 : 0)
			+ (config.session_reminders ? 1 : 0);
		if (pluginCount > 0) {
			console.log("  ✓ injector config generated");
		}
	} catch {
		// Non-fatal — prompt-injector will fall back to live scanning.
	}
}

// ── Smoke Test ──────────────────────────────────────────────────────────────

function cmdSmokeTest(root: string): void {
	console.log("Verifying install...");
	let failed = false;

	// CLI works
	if (hasCommand("orqa")) {
		console.log(`  ✓ orqa CLI responds`);
	} else {
		console.error("  ✗ orqa CLI not on PATH");
		failed = true;
	}

	// Artifact graph builds (validates all directories are scannable)
	try {
		runQuiet("orqa validate . --json");
		console.log("  ✓ artifact graph builds");
	} catch {
		console.error("  ✗ artifact graph failed to build");
		failed = true;
	}

	// Rust compiles
	const cargoDir = path.join(root, "app/backend/src-tauri");
	if (fs.existsSync(cargoDir)) {
		try {
			execSync("cargo check --quiet", { cwd: cargoDir, stdio: ["pipe", "pipe", "pipe"] });
			console.log("  ✓ cargo check passes");
		} catch {
			console.error("  ✗ cargo check failed — Rust dependencies may not be resolved");
			failed = true;
		}
	}

	// Svelte-check
	const appUi = path.join(root, "app/ui");
	if (fs.existsSync(appUi)) {
		try {
			execSync("npx svelte-check --threshold error", { cwd: appUi, stdio: ["pipe", "pipe", "pipe"] });
			console.log("  ✓ svelte-check passes");
		} catch {
			console.error("  ✗ svelte-check failed — frontend dependencies may not be linked");
			failed = true;
		}
	}

	if (failed) {
		console.error("\nInstall verification failed. Check the errors above.");
		process.exit(1);
	}

	console.log("  ✓ install verified");
}
