/**
 * Plugin management commands.
 *
 * orqa plugin list|install|uninstall|update|enable|disable|refresh|diff|registry|create
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { installPlugin, uninstallPlugin, listInstalledPlugins } from "../lib/installer.js";
import { fetchRegistry, searchRegistry } from "../lib/registry.js";
import { readManifest } from "../lib/manifest.js";
import {
	readContentManifest,
	writeContentManifest,
	copyPluginContent,
	removePluginContent,
	installPluginDeps,
	buildPlugin,
	runLifecycleHook,
	diffPluginContent,
} from "../lib/content-lifecycle.js";
import type { ContentManifest } from "../lib/content-lifecycle.js";
import type { PluginProjectConfig } from "@orqastudio/types";

const USAGE = `
Usage: orqa plugin <subcommand> [options]

Subcommands:
  list                              List installed plugins
  install <owner/repo|path> [-v]    Install a plugin
  uninstall <name>                  Remove a plugin
  update [name]                     Update one or all plugins
  enable <name>                     Enable a plugin (copy content to .orqa/)
  disable <name>                    Disable a plugin (remove content from .orqa/)
  refresh [name]                    Re-sync content for one or all enabled plugins
  diff [name]                       Show content drift for one or all installed plugins
  registry [--official|--community] Browse available plugins
  create [template]                 Scaffold a new plugin from template
`.trim();

export async function runPluginCommand(args: string[]): Promise<void> {
	const subcommand = args[0];

	if (!subcommand || subcommand === "--help" || subcommand === "-h") {
		console.log(USAGE);
		return;
	}

	switch (subcommand) {
		case "list":
			await cmdList();
			break;
		case "install":
			await cmdInstall(args.slice(1));
			break;
		case "uninstall":
			await cmdUninstall(args.slice(1));
			break;
		case "update":
			await cmdUpdate(args.slice(1));
			break;
		case "enable":
			await cmdEnable(args.slice(1));
			break;
		case "disable":
			await cmdDisable(args.slice(1));
			break;
		case "refresh":
			await cmdRefresh(args.slice(1));
			break;
		case "diff":
			await cmdDiff(args.slice(1));
			break;
		case "registry":
			await cmdRegistry(args.slice(1));
			break;
		case "create":
			await cmdCreate(args.slice(1));
			break;
		default:
			console.error(`Unknown subcommand: ${subcommand}`);
			console.error(USAGE);
			process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readProjectJson(projectRoot: string): Record<string, unknown> {
	const p = path.join(projectRoot, ".orqa", "project.json");
	const raw = fs.readFileSync(p, "utf-8");
	return JSON.parse(raw) as Record<string, unknown>;
}

function writeProjectJson(projectRoot: string, data: Record<string, unknown>): void {
	const p = path.join(projectRoot, ".orqa", "project.json");
	fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Look up a plugin directory by name. Checks:
 *   1. plugins/<short-name>/orqa-plugin.json
 *   2. connectors/<short-name>/orqa-plugin.json
 *   3. .orqa/project.json plugins section for the path field
 *
 * Returns the absolute plugin directory path or null if not found.
 */
function resolvePluginDir(name: string, projectRoot: string): string | null {
	const shortName = name.replace(/^@[^/]+\//, "");

	// 1. plugins/ directory
	const pluginsDir = path.join(projectRoot, "plugins", shortName);
	if (fs.existsSync(path.join(pluginsDir, "orqa-plugin.json"))) {
		return pluginsDir;
	}

	// 2. connectors/ directory
	const connectorsDir = path.join(projectRoot, "connectors", shortName);
	if (fs.existsSync(path.join(connectorsDir, "orqa-plugin.json"))) {
		return connectorsDir;
	}

	// 3. project.json plugins section
	const projectJsonPath = path.join(projectRoot, ".orqa", "project.json");
	if (fs.existsSync(projectJsonPath)) {
		try {
			const projectJson = readProjectJson(projectRoot);
			const pluginsSection = projectJson["plugins"] as
				| Record<string, { path?: string }>
				| undefined;
			if (pluginsSection) {
				const pluginConfig = pluginsSection[name];
				if (pluginConfig?.path) {
					const resolved = path.isAbsolute(pluginConfig.path)
						? pluginConfig.path
						: path.join(projectRoot, pluginConfig.path);
					if (fs.existsSync(path.join(resolved, "orqa-plugin.json"))) {
						return resolved;
					}
				}
			}
		} catch {
			// project.json not parseable — fall through
		}
	}

	return null;
}

/**
 * Update the plugins section of .orqa/project.json for a single plugin.
 * Merges with any existing entry.
 */
function updateProjectJsonPlugin(
	projectRoot: string,
	name: string,
	updates: Partial<PluginProjectConfig>,
): void {
	const projectJsonPath = path.join(projectRoot, ".orqa", "project.json");

	if (!fs.existsSync(projectJsonPath)) {
		throw new Error(`project.json not found at ${projectJsonPath}`);
	}

	const data = readProjectJson(projectRoot);
	const plugins = (data["plugins"] ?? {}) as Record<string, Partial<PluginProjectConfig>>;
	const existing = plugins[name] ?? {};
	plugins[name] = { ...existing, ...updates };
	data["plugins"] = plugins;
	writeProjectJson(projectRoot, data);
}

/**
 * Remove a plugin entry from .orqa/project.json.
 */
function removeProjectJsonPlugin(projectRoot: string, name: string): void {
	const projectJsonPath = path.join(projectRoot, ".orqa", "project.json");

	if (!fs.existsSync(projectJsonPath)) {
		return;
	}

	const data = readProjectJson(projectRoot);
	const plugins = (data["plugins"] ?? {}) as Record<string, unknown>;
	delete plugins[name];
	data["plugins"] = plugins;
	writeProjectJson(projectRoot, data);
}

/**
 * Delete all files listed in the content manifest entry for a plugin without
 * removing the manifest entry itself (used by disable — keeps entry for re-enable).
 */
function deleteContentFiles(projectRoot: string, pluginName: string): void {
	const contentManifest = readContentManifest(projectRoot);
	const entry = contentManifest.plugins[pluginName];

	if (!entry) {
		return;
	}

	for (const relPath of entry.files) {
		const absPath = path.join(projectRoot, relPath);
		if (fs.existsSync(absPath)) {
			fs.unlinkSync(absPath);
		}
	}
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function cmdList(): Promise<void> {
	const plugins = listInstalledPlugins();

	if (plugins.length === 0) {
		console.log("No plugins installed.");
		return;
	}

	console.log("Installed plugins:\n");
	for (const p of plugins) {
		console.log(`  ${p.name} @ ${p.version} (${p.source})`);
		console.log(`    ${p.path}`);
	}
}

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

async function cmdInstall(args: string[]): Promise<void> {
	if (args.length === 0) {
		console.error("Usage: orqa plugin install <owner/repo|path> [--version <tag>]");
		process.exit(1);
	}

	const source = args[0];
	const versionIdx = args.indexOf("--version");
	const version = versionIdx >= 0 ? args[versionIdx + 1] : undefined;

	const projectRoot = process.cwd();

	// Check if this is a first-party plugin already inside the project
	const absSource = path.resolve(source);
	const isFirstParty =
		absSource.startsWith(path.join(projectRoot, "plugins")) ||
		absSource.startsWith(path.join(projectRoot, "connectors"));

	if (isFirstParty && fs.existsSync(path.join(absSource, "orqa-plugin.json"))) {
		await cmdInstallFirstParty(absSource, projectRoot);
		return;
	}

	const result = await installPlugin({ source, version, projectRoot });

	if (result.collisions.length > 0) {
		console.log(`\nInstalled: ${result.name} @ ${result.version}`);
		console.log(`Path: ${result.path}`);
		console.log(`\n${result.collisions.length} relationship key collision(s) detected:\n`);

		for (const c of result.collisions) {
			console.log(`  Key: "${c.key}"`);
			console.log(`    Existing (${c.existingSource}): ${c.existingDescription || "(no description)"}`);
			console.log(`      semantic: ${c.existingSemantic ?? "none"}, from: [${c.existingFrom.join(", ")}], to: [${c.existingTo.join(", ")}]`);
			console.log(`    Incoming: ${c.incomingDescription || "(no description)"}`);
			console.log(`      semantic: ${c.incomingSemantic ?? "none"}, from: [${c.incomingFrom.join(", ")}], to: [${c.incomingTo.join(", ")}]`);
			console.log(`    Intent match: ${c.semanticMatch ? "YES — same semantic, likely safe to merge" : "NO — different semantic, should rename"}`);
			console.log();
		}

		// Interactive resolution
		const readline = await import("node:readline");
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

		const decisions: Array<{ key: string; decision: "merged" | "renamed"; existingSource: string; originalKey?: string }> = [];

		for (const c of result.collisions) {
			const suggestion = c.semanticMatch ? "merge" : "rename";
			const answer = await ask(`  "${c.key}" — [m]erge or [r]ename? (suggested: ${suggestion}) `);
			const choice = answer.trim().toLowerCase();

			if (choice === "r" || choice === "rename") {
				decisions.push({ key: c.key, decision: "renamed", existingSource: c.existingSource, originalKey: c.key });
				console.log(`    -> Will namespace as plugin-specific key\n`);
			} else {
				decisions.push({ key: c.key, decision: "merged", existingSource: c.existingSource });
				console.log(`    -> Will merge from/to constraints\n`);
			}
		}

		rl.close();

		// Write decisions to the installed manifest
		if (decisions.length > 0) {
			const manifestPath = path.join(result.path, "orqa-plugin.json");
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
			manifest["mergeDecisions"] = decisions;
			fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
			console.log(`Recorded ${decisions.length} merge decision(s) in plugin manifest.`);
		}
	} else {
		console.log(`\nInstalled: ${result.name} @ ${result.version}`);
		console.log(`Path: ${result.path}`);
	}

	// --- Content lifecycle: post-install steps ---
	const pluginManifest = readManifest(result.path);
	const shortPath = path.relative(projectRoot, result.path).replace(/\\/g, "/");

	console.log(`\nRunning post-install lifecycle for ${result.name}...`);

	// Install npm dependencies and build
	installPluginDeps(result.path, pluginManifest);
	buildPlugin(result.path, pluginManifest);

	// Copy content to .orqa/
	const copiedFiles = copyPluginContent(result.path, projectRoot, pluginManifest);
	if (copiedFiles.length > 0) {
		console.log(`  Copied ${copiedFiles.length} content file(s) to .orqa/`);
	}

	// Record ownership in .orqa/manifest.json
	const contentManifest: ContentManifest = readContentManifest(projectRoot);
	contentManifest.plugins[result.name] = {
		version: result.version,
		installed_at: new Date().toISOString(),
		files: copiedFiles,
	};
	writeContentManifest(projectRoot, contentManifest);

	// Register in .orqa/project.json
	const projectJsonPath = path.join(projectRoot, ".orqa", "project.json");
	if (fs.existsSync(projectJsonPath)) {
		updateProjectJsonPlugin(projectRoot, result.name, {
			installed: true,
			enabled: true,
			path: shortPath,
		});
		console.log(`  Registered ${result.name} in .orqa/project.json`);
	}

	// Run install lifecycle hook
	runLifecycleHook(result.path, pluginManifest, "install");

	console.log(`\nPlugin ${result.name} installed successfully.`);
}

/**
 * Install a first-party plugin (already inside plugins/ or connectors/).
 * Does NOT copy the directory — just registers, copies content, installs deps, builds, runs hooks.
 */
async function cmdInstallFirstParty(pluginDir: string, projectRoot: string): Promise<void> {
	const pluginManifest = readManifest(pluginDir);
	const shortPath = path.relative(projectRoot, pluginDir).replace(/\\/g, "/");

	console.log(`\nInstalling first-party plugin: ${pluginManifest.name} @ ${pluginManifest.version}`);
	console.log(`Path: ${shortPath}`);

	// Install npm dependencies and build
	installPluginDeps(pluginDir, pluginManifest);
	buildPlugin(pluginDir, pluginManifest);

	// Copy content to .orqa/
	const copiedFiles = copyPluginContent(pluginDir, projectRoot, pluginManifest);
	if (copiedFiles.length > 0) {
		console.log(`  Copied ${copiedFiles.length} content file(s) to .orqa/`);
	}

	// Record ownership in .orqa/manifest.json
	const contentManifest: ContentManifest = readContentManifest(projectRoot);
	contentManifest.plugins[pluginManifest.name] = {
		version: pluginManifest.version,
		installed_at: new Date().toISOString(),
		files: copiedFiles,
	};
	writeContentManifest(projectRoot, contentManifest);

	// Register in .orqa/project.json
	updateProjectJsonPlugin(projectRoot, pluginManifest.name, {
		installed: true,
		enabled: true,
		path: shortPath,
	});
	console.log(`  Registered in .orqa/project.json`);

	// Run install lifecycle hook
	runLifecycleHook(pluginDir, pluginManifest, "install");

	console.log(`\nPlugin ${pluginManifest.name} installed successfully.`);
}

// ---------------------------------------------------------------------------
// uninstall
// ---------------------------------------------------------------------------

async function cmdUninstall(args: string[]): Promise<void> {
	if (args.length === 0) {
		console.error("Usage: orqa plugin uninstall <name>");
		process.exit(1);
	}

	const name = args[0];
	const projectRoot = process.cwd();

	// Resolve plugin directory for lifecycle operations
	const pluginDir = resolvePluginDir(name, projectRoot);

	if (pluginDir) {
		let pluginManifest;
		try {
			pluginManifest = readManifest(pluginDir);
		} catch {
			// If manifest is not readable, proceed with best-effort cleanup
		}

		if (pluginManifest) {
			// Run uninstall lifecycle hook before removing anything
			runLifecycleHook(pluginDir, pluginManifest, "uninstall");
		}
	}

	// Remove content from .orqa/ and clear manifest entry
	removePluginContent(name, projectRoot);

	// Remove from .orqa/project.json
	removeProjectJsonPlugin(projectRoot, name);

	// Remove plugin directory and update lockfile — but only for GitHub-installed plugins.
	// First-party plugins (local source) keep their directory in the repo.
	try {
		const { readLockfile } = await import("../lib/lockfile.js");
		const lockfile = readLockfile(projectRoot);
		const locked = lockfile.plugins.find((l) => l.name === name);
		if (locked) {
			uninstallPlugin(name, projectRoot);
		}
	} catch {
		// No lockfile or not in lockfile — skip directory removal
	}

	console.log(`Uninstalled ${name}`);
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

async function cmdUpdate(args: string[]): Promise<void> {
	const name = args[0];
	const plugins = listInstalledPlugins().filter(
		(p) => p.source === "github" && (!name || p.name === name),
	);

	if (plugins.length === 0) {
		console.log(name ? `Plugin not found: ${name}` : "No updatable plugins.");
		return;
	}

	const projectRoot = process.cwd();

	for (const p of plugins) {
		console.log(`Checking ${p.name}...`);
		const { readLockfile } = await import("../lib/lockfile.js");
		const lockfile = readLockfile(projectRoot);
		const locked = lockfile.plugins.find((l) => l.name === p.name);
		if (locked) {
			// Re-install from the same repo (fetches latest)
			const result = await installPlugin({ source: locked.repo, projectRoot });

			// Re-sync content
			const pluginManifest = readManifest(result.path);
			const copiedFiles = copyPluginContent(result.path, projectRoot, pluginManifest);

			if (copiedFiles.length > 0) {
				console.log(`  Re-synced ${copiedFiles.length} content file(s)`);
			}

			// Update content manifest
			const contentManifest = readContentManifest(projectRoot);
			contentManifest.plugins[result.name] = {
				version: result.version,
				installed_at: new Date().toISOString(),
				files: copiedFiles,
			};
			writeContentManifest(projectRoot, contentManifest);

			// Run install hook again
			runLifecycleHook(result.path, pluginManifest, "install");

			console.log(`Updated ${result.name} to ${result.version}`);
		}
	}
}

// ---------------------------------------------------------------------------
// enable
// ---------------------------------------------------------------------------

async function cmdEnable(args: string[]): Promise<void> {
	if (args.length === 0) {
		console.error("Usage: orqa plugin enable <name>");
		process.exit(1);
	}

	const name = args[0];
	const projectRoot = process.cwd();

	const pluginDir = resolvePluginDir(name, projectRoot);
	if (!pluginDir) {
		console.error(`Plugin not found: ${name}`);
		console.error("Run 'orqa plugin install' first.");
		process.exit(1);
	}

	const pluginManifest = readManifest(pluginDir);

	// Copy content from plugin -> .orqa/
	const copiedFiles = copyPluginContent(pluginDir, projectRoot, pluginManifest);

	if (copiedFiles.length > 0) {
		console.log(`Copied ${copiedFiles.length} content file(s) to .orqa/`);
	}

	// Update content manifest (add or refresh entry)
	const contentManifest = readContentManifest(projectRoot);
	contentManifest.plugins[name] = {
		version: pluginManifest.version,
		installed_at: new Date().toISOString(),
		files: copiedFiles,
	};
	writeContentManifest(projectRoot, contentManifest);

	// Set enabled: true in project.json
	const projectJsonPath = path.join(projectRoot, ".orqa", "project.json");
	if (fs.existsSync(projectJsonPath)) {
		updateProjectJsonPlugin(projectRoot, name, { enabled: true });
	}

	console.log(`Plugin ${name} enabled.`);
}

// ---------------------------------------------------------------------------
// disable
// ---------------------------------------------------------------------------

async function cmdDisable(args: string[]): Promise<void> {
	if (args.length === 0) {
		console.error("Usage: orqa plugin disable <name>");
		process.exit(1);
	}

	const name = args[0];
	const projectRoot = process.cwd();

	// Delete files from .orqa/ but keep the manifest entry (for re-enable)
	deleteContentFiles(projectRoot, name);

	// Set enabled: false in project.json
	const projectJsonPath = path.join(projectRoot, ".orqa", "project.json");
	if (fs.existsSync(projectJsonPath)) {
		updateProjectJsonPlugin(projectRoot, name, { enabled: false });
	}

	console.log(`Plugin ${name} disabled. Content removed from .orqa/ (manifest retained for re-enable).`);
}

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

async function cmdRefresh(args: string[]): Promise<void> {
	const targetName = args[0];
	const projectRoot = process.cwd();

	// Collect plugins to refresh
	const installed = listInstalledPlugins(projectRoot);
	const toRefresh = targetName
		? installed.filter((p) => p.name === targetName)
		: installed;

	if (toRefresh.length === 0) {
		console.log(targetName ? `Plugin not found: ${targetName}` : "No plugins installed.");
		return;
	}

	for (const p of toRefresh) {
		// Only refresh enabled plugins (unless a specific name was requested)
		if (!targetName) {
			const projectJsonPath = path.join(projectRoot, ".orqa", "project.json");
			if (fs.existsSync(projectJsonPath)) {
				try {
					const data = readProjectJson(projectRoot);
					const plugins = data["plugins"] as Record<string, { enabled?: boolean }> | undefined;
					if (plugins && plugins[p.name]?.enabled === false) {
						console.log(`Skipping disabled plugin: ${p.name}`);
						continue;
					}
				} catch {
					// project.json unreadable — proceed
				}
			}
		}

		console.log(`Refreshing ${p.name}...`);

		const pluginDir = p.path;
		const pluginManifest = readManifest(pluginDir);

		// Install deps and build
		installPluginDeps(pluginDir, pluginManifest);
		buildPlugin(pluginDir, pluginManifest);

		// Re-sync content
		const copiedFiles = copyPluginContent(pluginDir, projectRoot, pluginManifest);

		// Update manifest
		const contentManifest = readContentManifest(projectRoot);
		contentManifest.plugins[p.name] = {
			version: pluginManifest.version,
			installed_at: new Date().toISOString(),
			files: copiedFiles,
		};
		writeContentManifest(projectRoot, contentManifest);

		if (copiedFiles.length > 0) {
			console.log(`  Re-synced ${copiedFiles.length} content file(s)`);
		} else {
			console.log(`  No content to sync.`);
		}
	}

	console.log("Refresh complete.");
}

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------

async function cmdDiff(args: string[]): Promise<void> {
	const targetName = args[0];
	const useJson = args.includes("--json");
	const projectRoot = process.cwd();

	const installed = listInstalledPlugins(projectRoot);
	const toDiff = targetName
		? installed.filter((p) => p.name === targetName)
		: installed;

	if (toDiff.length === 0) {
		console.log(targetName ? `Plugin not found: ${targetName}` : "No plugins installed.");
		return;
	}

	const results = [];

	for (const p of toDiff) {
		const pluginManifest = readManifest(p.path);
		const result = diffPluginContent(p.path, projectRoot, pluginManifest);
		results.push(result);
	}

	if (useJson) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}

	// Human-readable output
	let totalModified = 0;
	let totalMissing = 0;
	let totalIdentical = 0;
	let totalOrphaned = 0;

	for (const result of results) {
		console.log(`  ${result.pluginName}:`);

		const allFiles = [
			...result.identical.map((f) => ({ file: f, status: "identical" })),
			...result.modified.map((f) => ({ file: f, status: "MODIFIED" })),
			...result.missing.map((f) => ({ file: f, status: "MISSING" })),
			...result.orphaned.map((f) => ({ file: f, status: "ORPHANED" })),
		];

		if (allFiles.length === 0) {
			console.log("    (no content)");
		} else {
			for (const { file, status } of allFiles) {
				const filename = path.basename(file);
				console.log(`    ${filename}: ${status}`);
			}
		}

		console.log();

		totalIdentical += result.identical.length;
		totalModified += result.modified.length;
		totalMissing += result.missing.length;
		totalOrphaned += result.orphaned.length;
	}

	const parts: string[] = [];
	if (totalModified > 0) parts.push(`${totalModified} modified`);
	if (totalMissing > 0) parts.push(`${totalMissing} missing`);
	if (totalOrphaned > 0) parts.push(`${totalOrphaned} orphaned`);
	if (totalIdentical > 0) parts.push(`${totalIdentical} identical`);

	console.log(`  ${parts.join(", ")}`);
}

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

async function cmdRegistry(args: string[]): Promise<void> {
	const source = args.includes("--official")
		? "official" as const
		: args.includes("--community")
			? "community" as const
			: "all" as const;

	const searchTerm = args.find((a) => !a.startsWith("--"));

	try {
		if (searchTerm) {
			const results = await searchRegistry(searchTerm, source);
			if (results.length === 0) {
				console.log(`No plugins matching "${searchTerm}" found.`);
				return;
			}
			printRegistryResults(results);
		} else {
			const catalog = await fetchRegistry(source);
			if (catalog.plugins.length === 0) {
				console.log("No plugins available yet.");
				return;
			}
			printRegistryResults(catalog.plugins);
		}
	} catch (err) {
		console.error(
			`Failed to fetch registry: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	}
}

function printRegistryResults(
	plugins: Array<{
		name: string;
		displayName: string;
		description: string;
		category: string;
	}>,
): void {
	console.log("Available plugins:\n");
	for (const p of plugins) {
		console.log(`  ${p.displayName} (${p.name})`);
		console.log(`    ${p.description}`);
		console.log(`    Category: ${p.category}`);
		console.log();
	}
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

async function cmdCreate(args: string[]): Promise<void> {
	const template = args[0] ?? "full";
	const validTemplates = ["frontend", "sidecar", "cli-tool", "full"];

	if (!validTemplates.includes(template)) {
		console.error(`Invalid template: ${template}`);
		console.error(`Valid templates: ${validTemplates.join(", ")}`);
		process.exit(1);
	}

	// Phase 8: will scaffold from templates/
	console.log(`Scaffolding plugin from '${template}' template...`);
	console.log("(Template system not yet implemented — coming in Phase 8)");
}
