/**
 * Plugin manifest reader and validator.
 *
 * Reads `orqa-plugin.json` from a plugin directory and validates its structure.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { PluginManifest } from "@orqastudio/types";

const MANIFEST_FILENAME = "orqa-plugin.json";

/**
 * Read a plugin manifest from a directory.
 */
export function readManifest(pluginDir: string): PluginManifest {
	const manifestPath = path.join(pluginDir, MANIFEST_FILENAME);

	if (!fs.existsSync(manifestPath)) {
		throw new Error(`Plugin manifest not found: ${manifestPath}`);
	}

	const contents = fs.readFileSync(manifestPath, "utf-8");
	return JSON.parse(contents) as PluginManifest;
}

/**
 * Validate a plugin manifest, returning an array of error messages.
 * Empty array means valid.
 */
export function validateManifest(manifest: PluginManifest): string[] {
	const errors: string[] = [];

	if (!manifest.name) {
		errors.push("Missing required field: name");
	} else if (!/^@?[\w-]+\/[\w-]+$/.test(manifest.name) && !/^[\w-]+$/.test(manifest.name)) {
		errors.push(`Invalid name format: ${manifest.name}`);
	}

	if (!manifest.version) {
		errors.push("Missing required field: version");
	}

	if (!manifest.provides) {
		errors.push("Missing required field: provides");
	} else {
		if (!Array.isArray(manifest.provides.schemas)) {
			errors.push("provides.schemas must be an array");
		}
		if (!Array.isArray(manifest.provides.views)) {
			errors.push("provides.views must be an array");
		}
		if (!Array.isArray(manifest.provides.widgets)) {
			errors.push("provides.widgets must be an array");
		}
		if (!Array.isArray(manifest.provides.relationships)) {
			errors.push("provides.relationships must be an array");
		}

		if (!isPluginManifestNonEmpty(manifest)) {
			errors.push(
				"Plugin provides nothing: at least one of provides.schemas, provides.relationships, " +
					"provides.views, provides.widgets, provides.hooks, provides.cliTools, " +
					"provides.enforcement_mechanisms, provides.agents, provides.knowledge, " +
					"or content must be non-empty",
			);
		}
	}

	return errors;
}

/**
 * Check that a plugin manifest contributes at least one capability or content mapping.
 * A plugin that provides nothing is invalid.
 */
export function isPluginManifestNonEmpty(manifest: PluginManifest): boolean {
	const p = manifest.provides;
	return (
		(Array.isArray(p.schemas) && p.schemas.length > 0) ||
		(Array.isArray(p.relationships) && p.relationships.length > 0) ||
		(Array.isArray(p.views) && p.views.length > 0) ||
		(Array.isArray(p.widgets) && p.widgets.length > 0) ||
		(Array.isArray(p.hooks) && p.hooks.length > 0) ||
		(Array.isArray(p.cliTools) && p.cliTools.length > 0) ||
		(Array.isArray(p.enforcement_mechanisms) && p.enforcement_mechanisms.length > 0) ||
		(Array.isArray(p.agents) && p.agents.length > 0) ||
		(Array.isArray(p.knowledge) && p.knowledge.length > 0) ||
		(manifest.content !== undefined && Object.keys(manifest.content).length > 0)
	);
}
