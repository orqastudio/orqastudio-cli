/**
 * Repo maintenance commands — license and readme auditing.
 *
 * orqa repo license|readme
 */

import { auditLicenses, DEFAULT_LICENSE_POLICY } from "../lib/license.js";
import { auditReadmes } from "../lib/readme.js";

const USAGE = `
Usage: orqa repo <subcommand> [options]

Subcommands:
  license             Audit LICENSE files across all repos
  readme              Audit README.md files across all repos

Options:
  --json              Output as JSON
  --help, -h          Show this help message
`.trim();

export async function runRepoCommand(args: string[]): Promise<void> {
	const subcommand = args[0];

	if (!subcommand || subcommand === "--help" || subcommand === "-h") {
		console.log(USAGE);
		return;
	}

	const root = process.cwd();
	const jsonOutput = args.includes("--json");

	switch (subcommand) {
		case "license": {
			const results = auditLicenses(root);
			if (jsonOutput) {
				console.log(JSON.stringify(results, null, 2));
				break;
			}

			console.log("License Audit\n");
			console.log("Policy:");
			for (const p of DEFAULT_LICENSE_POLICY) {
				console.log(`  ${p.category}: ${p.expectedLicense}`);
			}
			console.log();

			const ok = results.filter((r) => r.status === "ok");
			const missing = results.filter((r) => r.status === "missing");
			const mismatch = results.filter((r) => r.status === "mismatch");

			if (ok.length > 0) {
				console.log(`${ok.length} OK:`);
				for (const r of ok) console.log(`  ${r.file}`);
			}
			if (missing.length > 0) {
				console.log(`\n${missing.length} MISSING:`);
				for (const r of missing) console.log(`  ${r.file} (expected ${r.expected})`);
			}
			if (mismatch.length > 0) {
				console.log(`\n${mismatch.length} MISMATCH:`);
				for (const r of mismatch) console.log(`  ${r.file}: found ${r.found}, expected ${r.expected}`);
			}

			if (missing.length > 0 || mismatch.length > 0) process.exit(1);
			break;
		}

		case "readme": {
			const results = auditReadmes(root);
			if (jsonOutput) {
				console.log(JSON.stringify(results, null, 2));
				break;
			}

			console.log("README Audit\n");

			const ok = results.filter((r) => r.status === "ok");
			const missing = results.filter((r) => r.status === "missing");
			const incomplete = results.filter((r) => r.status === "incomplete");

			if (ok.length > 0) {
				console.log(`${ok.length} OK:`);
				for (const r of ok) console.log(`  ${r.name}`);
			}
			if (missing.length > 0) {
				console.log(`\n${missing.length} MISSING:`);
				for (const r of missing) console.log(`  ${r.name}`);
			}
			if (incomplete.length > 0) {
				console.log(`\n${incomplete.length} INCOMPLETE:`);
				for (const r of incomplete) console.log(`  ${r.name}: missing ${r.missingSections.join(", ")}`);
			}

			if (missing.length > 0 || incomplete.length > 0) process.exit(1);
			break;
		}

		default:
			console.error(`Unknown subcommand: ${subcommand}`);
			console.error(USAGE);
			process.exit(1);
	}
}
