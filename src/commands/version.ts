/**
 * Version management commands.
 *
 * orqa version sync|bump|check
 */

import {
	readCanonicalVersion,
	writeCanonicalVersion,
	syncVersions,
	checkVersionDrift,
} from "../lib/version-sync.js";

const USAGE = `
Usage: orqa version <subcommand> [options]

Subcommands:
  sync              Sync VERSION file to all package.json, Cargo.toml, orqa-plugin.json
  bump <version>    Set new version and sync (e.g. orqa version bump 0.2.0-dev)
  check             Check for version drift across repos
  show              Show the current canonical version
`.trim();

export async function runVersionCommand(args: string[]): Promise<void> {
	const subcommand = args[0];

	if (!subcommand || subcommand === "--help" || subcommand === "-h") {
		console.log(USAGE);
		return;
	}

	const root = process.cwd();

	switch (subcommand) {
		case "show": {
			const version = readCanonicalVersion(root);
			console.log(version);
			break;
		}

		case "sync": {
			const version = readCanonicalVersion(root);
			console.log(`Syncing version: ${version}`);
			const result = syncVersions(root, version);
			console.log(`\nUpdated ${result.updated.length} files.`);
			for (const f of result.updated) {
				console.log(`  ${f}`);
			}
			break;
		}

		case "bump": {
			const newVersion = args[1];
			if (!newVersion) {
				console.error("Usage: orqa version bump <version>");
				console.error("Example: orqa version bump 0.2.0-dev");
				process.exit(1);
			}
			writeCanonicalVersion(root, newVersion);
			console.log(`Version set to: ${newVersion}`);
			const result = syncVersions(root, newVersion);
			console.log(`\nUpdated ${result.updated.length} files.`);
			for (const f of result.updated) {
				console.log(`  ${f}`);
			}
			break;
		}

		case "check": {
			const canonical = readCanonicalVersion(root);
			const drift = checkVersionDrift(root);

			console.log(`Canonical version: ${canonical}`);

			if (drift.length === 0) {
				console.log("All packages in sync.");
			} else {
				console.log(`\n${drift.length} package(s) out of sync:\n`);
				for (const d of drift) {
					console.log(`  ${d.file}: ${d.version} (expected ${canonical})`);
				}
				process.exit(1);
			}
			break;
		}

		default:
			console.error(`Unknown subcommand: ${subcommand}`);
			console.error(USAGE);
			process.exit(1);
	}
}
