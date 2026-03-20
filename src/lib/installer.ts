/**
 * Plugin installer — download, extract, and manage plugin installations.
 *
 * Plugins are distributed as .tar.gz archives from GitHub Releases.
 * Local path installs are also supported for development.
 *
 * Post-install setup (runPostInstallSetup):
 * - Creates .claude/agents/ as a merged directory of core + plugin agents
 *   Core agents are symlinked from app/.orqa/process/agents/ (or .orqa/process/agents/).
 *   Plugin agents declared via provides.agents in orqa-plugin.json are symlinked alongside.
 * - Creates .claude/rules → .orqa/process/rules/ symlink
 * - Aggregates lspServers/mcpServers from all plugin manifests → .lsp.json/.mcp.json
 * NOTE: .claude/CLAUDE.md is NOT managed here — it is a Claude Code project artifact
 * maintained directly, not derived from any source file.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { readLockfile, writeLockfile, type LockfileData } from "./lockfile.js";
import { readManifest, validateManifest } from "./manifest.js";
import { PLATFORM_CONFIG } from "@orqastudio/types";
import type { RelationshipType, PluginManifest } from "@orqastudio/types";

export interface InstallOptions {
	/** GitHub owner/repo or local filesystem path. */
	source: string;
	/** Specific version tag (e.g. "v0.2.0"). Defaults to latest release. */
	version?: string;
	/** Project root directory (defaults to cwd). */
	projectRoot?: string;
}

export interface InstallResult {
	name: string;
	version: string;
	path: string;
	source: "github" | "local";
	/** Key collisions detected during installation. Empty when none. */
	collisions: KeyCollisionResult[];
}

export interface KeyCollisionResult {
	key: string;
	existingSource: string;
	existingDescription: string;
	existingSemantic?: string;
	existingFrom: string[];
	existingTo: string[];
	incomingDescription: string;
	incomingSemantic?: string;
	incomingFrom: string[];
	incomingTo: string[];
	semanticMatch: boolean;
}

/**
 * Detect relationship key collisions between an incoming plugin and
 * existing definitions (core.json + already-installed plugins).
 */
function detectCollisions(
	manifest: PluginManifest,
	projectRoot: string,
): KeyCollisionResult[] {
	const collisions: KeyCollisionResult[] = [];

	// Build existing relationship map: key → { source, rel }
	const existing: Array<{ source: string; rel: RelationshipType }> = [];

	// Core relationships
	for (const rel of PLATFORM_CONFIG.relationships) {
		existing.push({ source: "core", rel });
	}

	// Already-installed plugin relationships
	const dir = path.join(projectRoot, "plugins");
	if (fs.existsSync(dir)) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
			try {
				const installed = readManifest(path.join(dir, entry.name));
				if (installed.name === manifest.name) continue; // Skip self
				for (const rel of installed.provides.relationships) {
					existing.push({ source: installed.name, rel });
				}
			} catch { /* skip invalid */ }
		}
	}

	// Check incoming relationships against existing
	for (const incoming of manifest.provides.relationships) {
		const match = existing.find((e) => e.rel.key === incoming.key);
		if (match) {
			collisions.push({
				key: incoming.key,
				existingSource: match.source,
				existingDescription: match.rel.description ?? "",
				existingSemantic: match.rel.semantic,
				existingFrom: match.rel.from ?? [],
				existingTo: match.rel.to ?? [],
				incomingDescription: incoming.description ?? "",
				incomingSemantic: incoming.semantic,
				incomingFrom: incoming.from ?? [],
				incomingTo: incoming.to ?? [],
				semanticMatch: match.rel.semantic === incoming.semantic,
			});
		}
	}

	return collisions;
}

/** Resolve the plugins directory for a project. */
function pluginsDir(projectRoot: string): string {
	return path.join(projectRoot, "plugins");
}

/**
 * Install a plugin from a GitHub release archive or local path.
 */
export async function installPlugin(options: InstallOptions): Promise<InstallResult> {
	const root = options.projectRoot ?? process.cwd();
	const dir = pluginsDir(root);

	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	// Detect source type
	if (fs.existsSync(options.source)) {
		return installFromLocalPath(options.source, dir);
	}

	// GitHub owner/repo format
	if (options.source.includes("/") && !options.source.includes(path.sep)) {
		return installFromGitHub(options.source, options.version, dir, root);
	}

	throw new Error(
		`Invalid source: ${options.source}. Use owner/repo for GitHub or a local path.`,
	);
}

async function installFromLocalPath(source: string, pluginsDirectory: string): Promise<InstallResult> {
	const projectRoot = path.dirname(pluginsDirectory);
	const manifest = readManifest(source);
	const errors = validateManifest(manifest);
	if (errors.length > 0) {
		throw new Error(`Invalid plugin manifest:\n  ${errors.join("\n  ")}`);
	}

	const collisions = detectCollisions(manifest, projectRoot);

	const targetDir = path.join(pluginsDirectory, manifest.name.replace(/^@[^/]+\//, ""));

	if (fs.existsSync(targetDir)) {
		fs.rmSync(targetDir, { recursive: true });
	}

	fs.cpSync(source, targetDir, { recursive: true });

	// Run post-install setup for connector plugins (those that declare lspServers or mcpServers)
	const provides = manifest.provides as {
		lspServers?: Record<string, unknown>;
		mcpServers?: Record<string, unknown>;
	};
	if (provides.lspServers || provides.mcpServers) {
		runPostInstallSetup(projectRoot, targetDir);
	}

	return {
		name: manifest.name,
		version: manifest.version,
		path: targetDir,
		source: "local",
		collisions,
	};
}

async function installFromGitHub(
	repo: string,
	version: string | undefined,
	pluginsDirectory: string,
	projectRoot: string,
): Promise<InstallResult> {
	// Resolve latest version if not specified
	const tag = version ?? (await fetchLatestTag(repo));
	const archiveUrl = `https://github.com/${repo}/releases/download/${tag}/${repo.split("/")[1]}-${tag}.tar.gz`;

	console.log(`Downloading ${repo}@${tag}...`);

	const response = await fetch(archiveUrl);
	if (!response.ok) {
		throw new Error(
			`Failed to download ${archiveUrl}: ${response.status} ${response.statusText}`,
		);
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

	// Extract to temp, then move to plugins/
	const tmpDir = path.join(pluginsDirectory, `.tmp-${Date.now()}`);
	fs.mkdirSync(tmpDir, { recursive: true });

	try {
		await extractTarGz(buffer, tmpDir);

		// Find the manifest in extracted contents
		const entries = fs.readdirSync(tmpDir);
		const extractedDir = entries.length === 1
			? path.join(tmpDir, entries[0])
			: tmpDir;

		const manifest = readManifest(extractedDir);
		const errors = validateManifest(manifest);
		if (errors.length > 0) {
			throw new Error(`Invalid plugin manifest:\n  ${errors.join("\n  ")}`);
		}

		const pluginDir = path.join(pluginsDirectory, manifest.name.replace(/^@[^/]+\//, ""));
		if (fs.existsSync(pluginDir)) {
			fs.rmSync(pluginDir, { recursive: true });
		}
		fs.renameSync(extractedDir, pluginDir);

		// Update lockfile
		const lockfile = readLockfile(projectRoot);
		lockfile.plugins = lockfile.plugins.filter((p) => p.name !== manifest.name);
		lockfile.plugins.push({
			name: manifest.name,
			version: manifest.version,
			repo,
			sha256,
			installedAt: new Date().toISOString(),
		});
		writeLockfile(projectRoot, lockfile);

		const collisions = detectCollisions(manifest, projectRoot);

		// Run post-install setup for connector plugins (those that declare lspServers or mcpServers)
		const provides = manifest.provides as {
			lspServers?: Record<string, unknown>;
			mcpServers?: Record<string, unknown>;
		};
		if (provides.lspServers || provides.mcpServers) {
			runPostInstallSetup(projectRoot, pluginDir);
		}

		console.log(`Installed ${manifest.name}@${manifest.version}`);

		return {
			name: manifest.name,
			version: manifest.version,
			path: pluginDir,
			source: "github",
			collisions,
		};
	} finally {
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true });
		}
	}
}

async function fetchLatestTag(repo: string): Promise<string> {
	const response = await fetch(
		`https://api.github.com/repos/${repo}/releases/latest`,
		{ headers: { Accept: "application/vnd.github.v3+json" } },
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch latest release for ${repo}: ${response.status}`);
	}

	const data = (await response.json()) as { tag_name: string };
	return data.tag_name;
}

async function extractTarGz(buffer: Buffer, targetDir: string): Promise<void> {
	// Use tar CLI for extraction (available on all platforms)
	const { execSync } = await import("node:child_process");
	const tmpArchive = path.join(targetDir, "archive.tar.gz");
	fs.writeFileSync(tmpArchive, buffer);
	execSync(`tar -xzf "${tmpArchive}" -C "${targetDir}"`);
	fs.unlinkSync(tmpArchive);
}

/**
 * Uninstall a plugin by name.
 */
export function uninstallPlugin(name: string, projectRoot?: string): void {
	const root = projectRoot ?? process.cwd();
	const dir = pluginsDir(root);

	const shortName = name.replace(/^@[^/]+\//, "");
	const pluginDir = path.join(dir, shortName);

	if (!fs.existsSync(pluginDir)) {
		throw new Error(`Plugin not found: ${name} (expected at ${pluginDir})`);
	}

	fs.rmSync(pluginDir, { recursive: true });

	// Update lockfile
	const lockfile = readLockfile(root);
	lockfile.plugins = lockfile.plugins.filter((p) => p.name !== name);
	writeLockfile(root, lockfile);

	console.log(`Uninstalled ${name}`);
}

/**
 * List all installed plugins by scanning the plugins/ directory.
 */
export function listInstalledPlugins(projectRoot?: string): InstallResult[] {
	const root = projectRoot ?? process.cwd();
	const dir = pluginsDir(root);

	if (!fs.existsSync(dir)) return [];

	const results: InstallResult[] = [];

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

		const pluginPath = path.join(dir, entry.name);
		const manifestPath = path.join(pluginPath, "orqa-plugin.json");

		if (!fs.existsSync(manifestPath)) continue;

		try {
			const manifest = readManifest(pluginPath);
			const lockfile = readLockfile(root);
			const locked = lockfile.plugins.find((p) => p.name === manifest.name);

			results.push({
				name: manifest.name,
				version: manifest.version,
				path: pluginPath,
				source: locked ? "github" : "local",
				collisions: [],
			});
		} catch {
			// Skip invalid plugins
		}
	}

	return results;
}

export interface PostInstallResult {
	symlinkAgents: "created" | "skipped" | "exists";
	symlinkRules: "created" | "skipped" | "exists";
	pluginAgentCount: number;
	lspCount: number;
	mcpCount: number;
}

/**
 * Run post-install setup for the Claude Code connector:
 * 1. Build .claude/agents/ as a merged directory containing symlinks to:
 *    - All core agents from app/.orqa/process/agents/ (or .orqa/process/agents/)
 *    - All plugin agents declared via provides.agents in installed plugin manifests
 *    Plugin agents are keyed by their manifest `key` field (e.g. "rust-specialist").
 *    Core agents take precedence: a plugin cannot shadow a core agent filename.
 * 2. Create .claude/rules → .orqa/process/rules/ symlink
 * 3. Aggregate lspServers/mcpServers from all plugins/connectors → .lsp.json/.mcp.json
 *    written into the connector's plugin directory.
 *
 * Called automatically by installPlugin when the installed plugin is the Claude Code connector.
 * Can also be called standalone to repair a broken install.
 *
 * NOTE: .claude/CLAUDE.md is NOT managed here — it is a Claude Code project artifact
 * maintained directly.
 */
export function runPostInstallSetup(
	projectRoot: string,
	connectorPluginDir: string,
): PostInstallResult {
	const orqaDir = path.join(projectRoot, ".orqa");
	const appOrqaDir = path.join(projectRoot, "app", ".orqa");
	const claudeDir = path.join(projectRoot, ".claude");

	// Ensure .claude/ exists
	if (!fs.existsSync(claudeDir)) {
		fs.mkdirSync(claudeDir, { recursive: true });
	}

	// Agents live in app/.orqa/process/agents/ (OrqaStudio monorepo structure).
	// Fall back to .orqa/process/agents/ for non-monorepo projects.
	const agentsSource = fs.existsSync(path.join(appOrqaDir, "process", "agents"))
		? path.join(appOrqaDir, "process", "agents")
		: path.join(orqaDir, "process", "agents");

	// Build the merged .claude/agents/ directory with core + plugin agent symlinks.
	const symlinkAgents = setupMergedAgentsDir(
		path.join(claudeDir, "agents"),
		agentsSource,
		projectRoot,
	);

	const symlinkRules = setupSymlink(
		path.join(claudeDir, "rules"),
		path.join(orqaDir, "process", "rules"),
	);

	const { lsp, mcp } = aggregateServers(projectRoot);
	const pluginAgentCount = countPluginAgents(projectRoot);

	const lspPath = path.join(connectorPluginDir, ".lsp.json");
	const mcpPath = path.join(projectRoot, ".mcp.json");

	const newLsp = JSON.stringify(lsp, null, 2);
	const existingLsp = fs.existsSync(lspPath) ? fs.readFileSync(lspPath, "utf-8") : "";
	if (newLsp !== existingLsp) {
		fs.writeFileSync(lspPath, newLsp);
	}

	const newMcp = JSON.stringify({ mcpServers: mcp }, null, 2);
	const existingMcp = fs.existsSync(mcpPath) ? fs.readFileSync(mcpPath, "utf-8") : "";
	if (newMcp !== existingMcp) {
		fs.writeFileSync(mcpPath, newMcp);
	}

	return {
		symlinkAgents,
		symlinkRules,
		pluginAgentCount,
		lspCount: Object.keys(lsp).length,
		mcpCount: Object.keys(mcp).length,
	};
}

/**
 * Build or repair the .claude/agents/ merged directory.
 *
 * Strategy:
 * - If the path is an old-style symlink pointing to a directory, remove it and
 *   recreate as a real directory. This migrates existing installs transparently.
 * - Create the directory if it doesn't exist.
 * - Symlink every core agent .md file from agentsSource into the directory.
 * - Symlink every plugin agent declared in provides.agents from installed plugins.
 *   Plugin agents are skipped if a core agent with the same filename already exists.
 *
 * Returns:
 * - "created": directory was newly created (or migrated from a symlink)
 * - "exists": directory already existed and was updated in-place
 * - "skipped": agentsSource does not exist — nothing to link
 */
function setupMergedAgentsDir(
	agentsDirPath: string,
	coreAgentsSource: string,
	projectRoot: string,
): "created" | "skipped" | "exists" {
	if (!fs.existsSync(coreAgentsSource)) {
		return "skipped";
	}

	let wasCreated = false;

	// Migrate: if it's a symlink, remove it so we can create a real directory
	try {
		const stat = fs.lstatSync(agentsDirPath);
		if (stat.isSymbolicLink()) {
			fs.unlinkSync(agentsDirPath);
			wasCreated = true;
		}
	} catch {
		// Path does not exist — will be created below
		wasCreated = true;
	}

	if (!fs.existsSync(agentsDirPath)) {
		fs.mkdirSync(agentsDirPath, { recursive: true });
		wasCreated = true;
	}

	// Collect core agent filenames so we can detect conflicts
	const coreAgentFiles = new Set<string>();
	for (const entry of fs.readdirSync(coreAgentsSource)) {
		if (!entry.endsWith(".md")) continue;
		coreAgentFiles.add(entry);
		const linkPath = path.join(agentsDirPath, entry);
		const targetPath = path.join(coreAgentsSource, entry);
		ensureAgentSymlink(linkPath, targetPath);
	}

	// Link plugin agents
	const pluginsDir = path.join(projectRoot, "plugins");
	if (fs.existsSync(pluginsDir)) {
		for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

			const pluginDir = path.join(pluginsDir, entry.name);
			const manifestPath = path.join(pluginDir, "orqa-plugin.json");
			if (!fs.existsSync(manifestPath)) continue;

			try {
				const raw = fs.readFileSync(manifestPath, "utf-8");
				const manifest = JSON.parse(raw) as {
					provides?: {
						agents?: Array<{ key: string; path: string }>;
					};
				};
				const agentEntries = manifest.provides?.agents ?? [];

				for (const agentEntry of agentEntries) {
					const agentFile = path.basename(agentEntry.path);
					// Core agents take precedence — never shadow them
					if (coreAgentFiles.has(agentFile)) continue;

					const targetPath = path.join(pluginDir, agentEntry.path);
					if (!fs.existsSync(targetPath)) continue;

					const linkPath = path.join(agentsDirPath, agentFile);
					ensureAgentSymlink(linkPath, targetPath);
				}
			} catch {
				// Skip plugins with invalid manifests
			}
		}
	}

	return wasCreated ? "created" : "exists";
}

/**
 * Create or verify a symlink at linkPath pointing to targetPath.
 * If a symlink already exists at linkPath pointing to the correct target, leave it.
 * If a stale symlink or file exists, replace it.
 */
function ensureAgentSymlink(linkPath: string, targetPath: string): void {
	try {
		const stat = fs.lstatSync(linkPath);
		if (stat.isSymbolicLink()) {
			const current = fs.readlinkSync(linkPath);
			if (current === targetPath) return; // Already correct
			fs.unlinkSync(linkPath);
		} else {
			// Regular file — leave it (manual override)
			return;
		}
	} catch {
		// Does not exist — fall through to create
	}

	fs.symlinkSync(targetPath, linkPath, "file");
}

/**
 * Count the total number of plugin agent entries across all installed plugins.
 */
function countPluginAgents(projectRoot: string): number {
	let count = 0;
	const pluginsDir = path.join(projectRoot, "plugins");
	if (!fs.existsSync(pluginsDir)) return count;

	for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
		const manifestPath = path.join(pluginsDir, entry.name, "orqa-plugin.json");
		if (!fs.existsSync(manifestPath)) continue;
		try {
			const raw = fs.readFileSync(manifestPath, "utf-8");
			const manifest = JSON.parse(raw) as {
				provides?: { agents?: unknown[] };
			};
			count += manifest.provides?.agents?.length ?? 0;
		} catch {
			// Skip invalid
		}
	}

	return count;
}

/**
 * Create a symlink from linkPath → targetPath.
 * - "created": symlink was created
 * - "skipped": target does not exist, nothing to link
 * - "exists": already a symlink (correct or not — caller can verify if needed)
 */
function setupSymlink(
	linkPath: string,
	targetPath: string,
): "created" | "skipped" | "exists" {
	if (!fs.existsSync(targetPath)) {
		return "skipped";
	}

	// lstatSync sees symlinks without following them
	try {
		const stat = fs.lstatSync(linkPath);
		if (stat.isSymbolicLink() || stat.isDirectory() || stat.isFile()) {
			return "exists";
		}
	} catch {
		// Path does not exist — fall through to create
	}

	fs.symlinkSync(targetPath, linkPath, "junction");
	return "created";
}

interface ServerMap {
	[name: string]: unknown;
}

/**
 * Scan plugins/ and connectors/ directories for orqa-plugin.json manifests
 * and aggregate their lspServers/mcpServers declarations.
 * First declaration wins (plugins/ is scanned before connectors/).
 */
function aggregateServers(projectRoot: string): { lsp: ServerMap; mcp: ServerMap } {
	const lsp: ServerMap = {};
	const mcp: ServerMap = {};

	const scanDirs = [
		path.join(projectRoot, "plugins"),
		path.join(projectRoot, "connectors"),
	];

	for (const scanDir of scanDirs) {
		if (!fs.existsSync(scanDir)) continue;

		for (const entry of fs.readdirSync(scanDir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

			const manifestPath = path.join(scanDir, entry.name, "orqa-plugin.json");
			if (!fs.existsSync(manifestPath)) continue;

			try {
				const raw = fs.readFileSync(manifestPath, "utf-8");
				const manifest = JSON.parse(raw) as {
					provides?: {
						lspServers?: Record<string, unknown>;
						mcpServers?: Record<string, unknown>;
					};
				};
				const provides = manifest.provides ?? {};

				if (provides.lspServers && typeof provides.lspServers === "object") {
					for (const [name, config] of Object.entries(provides.lspServers)) {
						if (!(name in lsp)) {
							lsp[name] = config;
						}
					}
				}

				if (provides.mcpServers && typeof provides.mcpServers === "object") {
					for (const [name, config] of Object.entries(provides.mcpServers)) {
						if (!(name in mcp)) {
							// Strip "type" field — Claude Code doesn't use it
							const { type, ...mcpConfig } = config as Record<string, unknown>;
							mcp[name] = mcpConfig;
						}
					}
				}
			} catch {
				// Skip invalid manifests
			}
		}
	}

	return { lsp, mcp };
}
