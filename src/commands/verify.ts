/**
 * Verify command — run all checks in one go.
 *
 * orqa verify
 *
 * Runs: integrity validation, version drift, license audit, readme audit.
 * Exits non-zero if any check fails.
 */

import { execSync } from "node:child_process";
import { getRoot } from "../lib/root.js";

export async function runVerifyCommand(): Promise<void> {
	const root = getRoot();
	let failed = false;

	const checks = [
		{ name: "integrity", cmd: "orqa enforce ." },
		{ name: "version", cmd: "orqa version check" },
		{ name: "license", cmd: "orqa repo license" },
		{ name: "readme", cmd: "orqa repo readme" },
	];

	for (const check of checks) {
		try {
			execSync(check.cmd, { cwd: root, stdio: "inherit" });
		} catch {
			failed = true;
		}
	}

	if (failed) {
		process.exit(1);
	}
}
