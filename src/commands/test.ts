/**
 * Test runner.
 *
 * orqa test              Run all test suites
 * orqa test rust         Rust: cargo test
 * orqa test app          Frontend: vitest
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const USAGE = `
Usage: orqa test [subcommand]

Run all test suites, or target a specific area:

Subcommands:
  rust      Rust backend tests (cargo test)
  app       Frontend tests (vitest)

Running 'orqa test' with no subcommand runs all test suites.
`.trim();

interface TestSuite {
	name: string;
	key: string;
	dir: string;
	command: string;
}

function getSuites(root: string): TestSuite[] {
	return [
		{
			name: "Rust backend",
			key: "rust",
			dir: path.join(root, "app/backend/src-tauri"),
			command: "cargo test",
		},
		{
			name: "Frontend (vitest)",
			key: "app",
			dir: path.join(root, "app/ui"),
			command: "npx vitest run",
		},
	];
}

export async function runTestCommand(args: string[]): Promise<void> {
	if (args[0] === "--help" || args[0] === "-h") {
		console.log(USAGE);
		return;
	}

	const root = process.cwd();
	const target = args[0];
	const suites = getSuites(root);

	const toRun = target
		? suites.filter((s) => s.key === target)
		: suites;

	if (target && toRun.length === 0) {
		console.error(`Unknown target: ${target}`);
		console.error(USAGE);
		process.exit(1);
	}

	let failed = false;

	for (const suite of toRun) {
		if (!fs.existsSync(suite.dir)) {
			console.log(`  - ${suite.name} (skipped — not found)`);
			continue;
		}

		console.log(`  ${suite.name}...`);
		try {
			execSync(suite.command, { cwd: suite.dir, stdio: "inherit" });
		} catch {
			failed = true;
		}
	}

	if (failed) {
		process.exit(1);
	}
}
