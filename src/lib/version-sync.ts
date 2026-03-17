/**
 * Version sync — propagate a canonical version across all package.json,
 * orqa-plugin.json, Cargo.toml, and plugin.json files in a dev environment.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface VersionSyncResult {
	version: string;
	updated: string[];
	skipped: string[];
}

/**
 * Read the canonical version from the VERSION file.
 */
export function readCanonicalVersion(projectRoot: string): string {
	const versionFile = path.join(projectRoot, "VERSION");
	if (!fs.existsSync(versionFile)) {
		throw new Error("VERSION file not found. Create it with: echo '0.1.0-dev' > VERSION");
	}
	return fs.readFileSync(versionFile, "utf-8").trim();
}

/**
 * Write the canonical version to the VERSION file.
 */
export function writeCanonicalVersion(projectRoot: string, version: string): void {
	fs.writeFileSync(path.join(projectRoot, "VERSION"), version + "\n", "utf-8");
}

/**
 * Sync a version across all package.json, orqa-plugin.json, Cargo.toml,
 * and .claude-plugin/plugin.json files found in the dev environment.
 */
export function syncVersions(projectRoot: string, version: string): VersionSyncResult {
	const updated: string[] = [];
	const skipped: string[] = [];

	// Libraries
	const libsDir = path.join(projectRoot, "libs");
	if (fs.existsSync(libsDir)) {
		for (const entry of fs.readdirSync(libsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const pkg = path.join(libsDir, entry.name, "package.json");
			if (updateJsonVersion(pkg, version)) updated.push(pkg);
			else skipped.push(pkg);
			if (updateOrqaDeps(pkg, version)) updated.push(pkg + " (deps)");
		}
	}

	// Connectors
	const connectorsDir = path.join(projectRoot, "connectors");
	if (fs.existsSync(connectorsDir)) {
		for (const entry of fs.readdirSync(connectorsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const dir = path.join(connectorsDir, entry.name);
			updateJsonVersion(path.join(dir, "package.json"), version) && updated.push(path.join(dir, "package.json"));
			updateOrqaDeps(path.join(dir, "package.json"), version);
		}
	}

	// App
	const appUiPkg = path.join(projectRoot, "app", "ui", "package.json");
	if (updateJsonVersion(appUiPkg, version)) updated.push(appUiPkg);
	if (updateOrqaDeps(appUiPkg, version)) updated.push(appUiPkg + " (deps)");

	const cargoToml = path.join(projectRoot, "app", "backend", "src-tauri", "Cargo.toml");
	if (updateCargoVersion(cargoToml, version)) updated.push(cargoToml);

	// Plugins
	const pluginsDir = path.join(projectRoot, "plugins");
	if (fs.existsSync(pluginsDir)) {
		for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const dir = path.join(pluginsDir, entry.name);
			updateJsonVersion(path.join(dir, "orqa-plugin.json"), version) && updated.push(path.join(dir, "orqa-plugin.json"));
			updateJsonVersion(path.join(dir, "package.json"), version) && updated.push(path.join(dir, "package.json"));
			updateJsonVersion(path.join(dir, ".claude-plugin", "plugin.json"), version) && updated.push(path.join(dir, ".claude-plugin/plugin.json"));
			updateOrqaDeps(path.join(dir, "package.json"), version);
		}
	}

	return { version, updated, skipped };
}

/**
 * Check if all packages in the dev environment have the same version.
 */
export function checkVersionDrift(projectRoot: string): Array<{ file: string; version: string }> {
	const canonical = readCanonicalVersion(projectRoot);
	const drift: Array<{ file: string; version: string }> = [];

	const checkJson = (filePath: string) => {
		if (!fs.existsSync(filePath)) return;
		try {
			const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
			if (data.version && data.version !== canonical) {
				drift.push({ file: filePath, version: data.version });
			}
		} catch { /* skip */ }
	};

	// Scan all known locations
	for (const dir of ["libs", "plugins", "connectors"]) {
		const base = path.join(projectRoot, dir);
		if (!fs.existsSync(base)) continue;
		for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			checkJson(path.join(base, entry.name, "package.json"));
			checkJson(path.join(base, entry.name, "orqa-plugin.json"));
		}
	}

	checkJson(path.join(projectRoot, "app", "ui", "package.json"));

	return drift;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateJsonVersion(filePath: string, version: string): boolean {
	if (!fs.existsSync(filePath)) return false;
	try {
		const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		if (data.version === undefined || data.version === version) return false;
		data.version = version;
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
		return true;
	} catch { return false; }
}

function updateOrqaDeps(filePath: string, version: string): boolean {
	if (!fs.existsSync(filePath)) return false;
	try {
		const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		let changed = false;
		for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
			if (!data[section]) continue;
			for (const [key, val] of Object.entries(data[section])) {
				if (key.startsWith("@orqastudio/") && val !== version) {
					(data[section] as Record<string, string>)[key] = version;
					changed = true;
				}
			}
		}
		if (changed) {
			fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
		}
		return changed;
	} catch { return false; }
}

function updateCargoVersion(filePath: string, version: string): boolean {
	if (!fs.existsSync(filePath)) return false;
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const updated = content.replace(/^version = ".*"/m, `version = "${version}"`);
		if (updated === content) return false;
		fs.writeFileSync(filePath, updated, "utf-8");
		return true;
	} catch { return false; }
}
