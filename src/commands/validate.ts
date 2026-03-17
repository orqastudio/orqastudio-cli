/**
 * Validation command — uses the built-in integrity validator.
 *
 * orqa validate [path] [--json]
 */

import { buildGraph } from "../validator/graph.js";
import { buildCheckContext, runChecksWithSummary } from "../validator/checker.js";

const USAGE = `
Usage: orqa validate [path] [options]

Run integrity validation on the specified path (defaults to current directory).

Options:
  --json              Output results as JSON
  --help, -h          Show this help message
`.trim();

export async function runValidateCommand(args: string[]): Promise<void> {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(USAGE);
		return;
	}

	const jsonOutput = args.includes("--json");
	const targetPath = args.find((a) => !a.startsWith("--")) ?? process.cwd();

	const graph = buildGraph({ projectRoot: targetPath });
	const ctx = buildCheckContext(targetPath);
	const summary = runChecksWithSummary(graph, ctx);

	if (jsonOutput) {
		console.log(JSON.stringify(summary, null, 2));
	} else {
		const { errors, warnings, totalFindings } = summary;

		if (totalFindings === 0) {
			console.log("Integrity check passed. 0 errors, 0 warnings.");
		} else {
			// Group by category
			const byCategory = new Map<string, typeof summary.findings>();
			for (const f of summary.findings) {
				const list = byCategory.get(f.category) ?? [];
				list.push(f);
				byCategory.set(f.category, list);
			}

			for (const [category, findings] of byCategory) {
				console.log(`\n${category} (${findings.length}):`);
				for (const f of findings) {
					const icon = f.severity === "error" ? "E" : "W";
					console.log(`  [${icon}] ${f.artifactId}: ${f.message}`);
				}
			}

			console.log(`\n${errors} error(s), ${warnings} warning(s).`);

			if (errors > 0) process.exit(1);
		}
	}
}
