/**
 * Plugin content lifecycle — install, remove, diff, and refresh plugin content.
 *
 * Plugins declare content mappings in `orqa-plugin.json`:
 *   { "content": { "rules": { "source": "rules", "target": ".orqa/process/rules" } } }
 *
 * When installed, plugin content is copied from plugin source dirs to `.orqa/` target
 * dirs under the project root. Ownership is tracked in `.orqa/manifest.json`.
 */
import type { PluginManifest } from "@orqastudio/types";
export interface ContentManifest {
    plugins: Record<string, ContentManifestEntry>;
}
export interface ContentManifestEntry {
    version: string;
    installed_at: string;
    /** Relative paths from project root, using forward slashes. */
    files: string[];
}
export interface ContentDiffResult {
    pluginName: string;
    /** Files whose content is identical between plugin source and .orqa/ copy. */
    identical: string[];
    /** Files in .orqa/ that differ from the plugin source. */
    modified: string[];
    /** Files in the manifest but deleted from .orqa/. */
    missing: string[];
    /** Files found in the plugin's target dirs that are not in the manifest. */
    orphaned: string[];
}
/**
 * Read `.orqa/manifest.json` from the project root.
 * Returns an empty manifest if the file does not exist.
 */
export declare function readContentManifest(projectRoot: string): ContentManifest;
/**
 * Write `.orqa/manifest.json` to the project root with pretty-printed JSON.
 */
export declare function writeContentManifest(projectRoot: string, manifest: ContentManifest): void;
/**
 * Copy all `.md` files from the plugin's content source dirs to the project's target dirs.
 *
 * @param pluginDir - Absolute path to the plugin directory.
 * @param projectRoot - Absolute path to the project root.
 * @param manifest - The plugin's `orqa-plugin.json` manifest.
 * @returns Array of relative paths (using forward slashes) of all copied files.
 */
export declare function copyPluginContent(pluginDir: string, projectRoot: string, manifest: PluginManifest): string[];
/**
 * Remove all content files belonging to a plugin and update the manifest.
 *
 * @param pluginName - The plugin's `name` field from its manifest.
 * @param projectRoot - Absolute path to the project root.
 */
export declare function removePluginContent(pluginName: string, projectRoot: string): void;
/**
 * Install plugin dependencies.
 *
 * - If `pluginManifest.dependencies.npm` is non-empty, runs `npm install` in pluginDir.
 * - If `pluginManifest.dependencies.system` is non-empty, checks each binary exists.
 *
 * @throws {Error} If any required system binary is not found on PATH.
 */
export declare function installPluginDeps(pluginDir: string, pluginManifest: PluginManifest): void;
/**
 * Run the plugin's build command, if declared.
 *
 * @param pluginDir - Absolute path to the plugin directory (cwd for the command).
 * @param pluginManifest - The plugin's manifest.
 */
export declare function buildPlugin(pluginDir: string, pluginManifest: PluginManifest): void;
/**
 * Run a plugin lifecycle hook command (`install` or `uninstall`), if declared.
 *
 * @param pluginDir - Absolute path to the plugin directory (cwd for the command).
 * @param pluginManifest - The plugin's manifest.
 * @param hook - Which hook to run.
 */
export declare function runLifecycleHook(pluginDir: string, pluginManifest: PluginManifest, hook: "install" | "uninstall"): void;
/**
 * Compare the plugin's source content against the installed copies in `.orqa/`.
 *
 * For each file tracked in the content manifest:
 * - If it no longer exists in `.orqa/`: listed as `missing`.
 * - If its content matches the plugin source: listed as `identical`.
 * - If its content differs: listed as `modified`.
 *
 * Files found in the plugin's target dirs that are NOT in the manifest are `orphaned`.
 *
 * @param pluginDir - Absolute path to the plugin directory.
 * @param projectRoot - Absolute path to the project root.
 * @param pluginManifest - The plugin's manifest.
 */
export declare function diffPluginContent(pluginDir: string, projectRoot: string, pluginManifest: PluginManifest): ContentDiffResult;
/**
 * Re-install a plugin's dependencies, rebuild, re-copy content, and update the manifest.
 *
 * @param pluginDir - Absolute path to the plugin directory.
 * @param projectRoot - Absolute path to the project root.
 * @param pluginManifest - The plugin's manifest.
 * @returns Relative paths of all files that were (re-)copied.
 */
export declare function refreshPluginContent(pluginDir: string, projectRoot: string, pluginManifest: PluginManifest): string[];
//# sourceMappingURL=content-lifecycle.d.ts.map