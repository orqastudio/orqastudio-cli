/**
 * Validation command — imports @orqastudio/integrity-validator directly.
 *
 * orqa validate [path] [--json] [--staged file1.md file2.md]
 */

import * as path from "node:path";

const USAGE = `
Usage: orqa validate [path] [options]

Run integrity validation on the specified path (defaults to current directory).

Options:
  --json              Output results as JSON
  --staged <files>    Validate specific staged files only
  --help, -h          Show this help message
`.trim();

export async function runValidateCommand(args: string[]): Promise<void> {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(USAGE);
		return;
	}

	const jsonOutput = args.includes("--json");
	const stagedIdx = args.indexOf("--staged");
	const targetPath = args.find((a) => !a.startsWith("--") && args.indexOf(a) !== stagedIdx + 1)
		?? process.cwd();

	try {
		// Import the validator directly — it's a dependency of @orqastudio/cli
		const validator = await import("@orqastudio/integrity-validator");

		if (stagedIdx >= 0) {
			const files = args.slice(stagedIdx + 1).filter((a) => !a.startsWith("--"));
			const result = await validator.validateFiles(files, targetPath);
			if (jsonOutput) {
				console.log(JSON.stringify(result, null, 2));
			} else {
				printResult(result);
			}
		} else {
			const result = await validator.validate(targetPath);
			if (jsonOutput) {
				console.log(JSON.stringify(result, null, 2));
			} else {
				printResult(result);
			}
		}
	} catch {
		// Fall back to shelling out if the import fails (e.g. not installed)
		const { execSync } = await import("node:child_process");

		const validatorPaths = [
			path.join(process.cwd(), "node_modules", ".bin", "orqa-integrity"),
			path.join(process.cwd(), "libs", "integrity-validator", "dist", "cli.js"),
		];

		let validatorPath: string | null = null;
		const { existsSync } = await import("node:fs");
		for (const p of validatorPaths) {
			if (existsSync(p)) {
				validatorPath = p;
				break;
			}
		}

		const stagedArgs = stagedIdx >= 0 ? ` --staged ${args.slice(stagedIdx + 1).join(" ")}` : "";
		const cmd = validatorPath
			? `node "${validatorPath}" ${targetPath}${jsonOutput ? " --json" : ""}${stagedArgs}`
			: `npx @orqastudio/integrity-validator ${targetPath}${jsonOutput ? " --json" : ""}${stagedArgs}`;

		try {
			const output = execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
			process.stdout.write(output);
		} catch (execErr: unknown) {
			if (execErr && typeof execErr === "object" && "stdout" in execErr) {
				process.stdout.write(String((execErr as { stdout: string }).stdout));
			}
			process.exit(1);
		}
	}
}

function printResult(result: { errors?: number; warnings?: number; [key: string]: unknown }): void {
	const errors = result.errors ?? 0;
	const warnings = result.warnings ?? 0;

	if (errors === 0 && warnings === 0) {
		console.log("Integrity check passed. 0 errors, 0 warnings.");
	} else {
		if (errors > 0) console.error(`${errors} error(s) found.`);
		if (warnings > 0) console.warn(`${warnings} warning(s) found.`);
		if (errors > 0) process.exit(1);
	}
}
