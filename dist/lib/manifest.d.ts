/**
 * Plugin manifest reader and validator.
 *
 * Reads `orqa-plugin.json` from a plugin directory and validates its structure.
 */
import type { PluginManifest } from "@orqastudio/types";
/**
 * Read a plugin manifest from a directory.
 */
export declare function readManifest(pluginDir: string): PluginManifest;
/**
 * Validate a plugin manifest, returning an array of error messages.
 * Empty array means valid.
 */
export declare function validateManifest(manifest: PluginManifest): string[];
/**
 * Check that a plugin manifest contributes at least one capability or content mapping.
 * A plugin that provides nothing is invalid.
 */
export declare function isPluginManifestNonEmpty(manifest: PluginManifest): boolean;
//# sourceMappingURL=manifest.d.ts.map