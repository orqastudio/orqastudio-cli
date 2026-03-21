/**
 * Injector-config generator — aggregates plugin hook injection contributions.
 *
 * Scans plugins/ and connectors/ for behavioral_rules, mode_templates, and
 * session_reminders declared in orqa-plugin.json manifests. Writes the
 * aggregated result to .orqa/connectors/claude-code/injector-config.json
 * so the prompt-injector can merge plugin contributions without rescanning
 * on every hook invocation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { readManifest } from "./manifest.js";

export interface InjectorConfig {
	/** ISO 8601 timestamp of when this config was generated. */
	generated: string;
	/** Space-joined behavioral rules from all plugins. */
	behavioral_rules: string;
	/** Merged mode templates from all plugins. Built-ins win on collision. */
	mode_templates: Record<string, string>;
	/** Space-joined session reminders from all plugins. */
	session_reminders: string;
}

/** Path where the generated config is written, relative to project root. */
const CONFIG_RELATIVE_PATH = ".orqa/connectors/claude-code/injector-config.json";

/**
 * Scan all plugin manifests in plugins/ and connectors/ and aggregate
 * their behavioral_rules, mode_templates, and session_reminders.
 *
 * Returns the aggregated config without writing to disk.
 */
export function aggregateInjectorConfig(projectRoot: string): InjectorConfig {
	const allBehavioralRules: string[] = [];
	const mergedModeTemplates: Record<string, string> = {};
	const allSessionReminders: string[] = [];

	const scanDirs = [
		path.join(projectRoot, "plugins"),
		path.join(projectRoot, "connectors"),
	];

	for (const dir of scanDirs) {
		if (!fs.existsSync(dir)) continue;

		// Sort alphabetically so first-declaration-wins is deterministic.
		const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		);

		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

			const pluginDir = path.join(dir, entry.name);
			let manifest;
			try {
				manifest = readManifest(pluginDir);
			} catch {
				continue;
			}

			const provides = manifest.provides;
			if (!provides) continue;

			if (provides.behavioral_rules && provides.behavioral_rules.length > 0) {
				allBehavioralRules.push(...provides.behavioral_rules);
			}

			if (provides.mode_templates) {
				for (const [key, value] of Object.entries(provides.mode_templates)) {
					// First declaration wins — skip if already set.
					if (!(key in mergedModeTemplates)) {
						mergedModeTemplates[key] = value;
					}
				}
			}

			if (provides.session_reminders && provides.session_reminders.length > 0) {
				allSessionReminders.push(...provides.session_reminders);
			}
		}
	}

	return {
		generated: new Date().toISOString(),
		behavioral_rules: allBehavioralRules.join(" "),
		mode_templates: mergedModeTemplates,
		session_reminders: allSessionReminders.join(" "),
	};
}

/**
 * Generate the injector config and write it to
 * .orqa/connectors/claude-code/injector-config.json.
 *
 * Creates the directory if it does not exist.
 * Returns the written config.
 */
export function generateInjectorConfig(projectRoot: string): InjectorConfig {
	const config = aggregateInjectorConfig(projectRoot);

	const outputPath = path.join(projectRoot, CONFIG_RELATIVE_PATH);
	const outputDir = path.dirname(outputPath);

	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(outputPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

	return config;
}
