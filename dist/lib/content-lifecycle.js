/**
 * Plugin content lifecycle — install, remove, diff, and refresh plugin content.
 *
 * Plugins declare content mappings in `orqa-plugin.json`:
 *   { "content": { "rules": { "source": "rules", "target": ".orqa/process/rules" } } }
 *
 * When installed, plugin content is copied from plugin source dirs to `.orqa/` target
 * dirs under the project root. Ownership is tracked in `.orqa/manifest.json`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MANIFEST_FILENAME = ".orqa/manifest.json";
// ---------------------------------------------------------------------------
// Manifest I/O
// ---------------------------------------------------------------------------
/**
 * Read `.orqa/manifest.json` from the project root.
 * Returns an empty manifest if the file does not exist.
 */
export function readContentManifest(projectRoot) {
    const manifestPath = path.join(projectRoot, MANIFEST_FILENAME);
    if (!fs.existsSync(manifestPath)) {
        return { plugins: {} };
    }
    const raw = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw);
}
/**
 * Write `.orqa/manifest.json` to the project root with pretty-printed JSON.
 */
export function writeContentManifest(projectRoot, manifest) {
    const manifestPath = path.join(projectRoot, MANIFEST_FILENAME);
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}
// ---------------------------------------------------------------------------
// Content Copy & Removal
// ---------------------------------------------------------------------------
/**
 * Copy all `.md` files from the plugin's content source dirs to the project's target dirs.
 *
 * @param pluginDir - Absolute path to the plugin directory.
 * @param projectRoot - Absolute path to the project root.
 * @param manifest - The plugin's `orqa-plugin.json` manifest.
 * @returns Array of relative paths (using forward slashes) of all copied files.
 */
export function copyPluginContent(pluginDir, projectRoot, manifest) {
    if (!manifest.content || Object.keys(manifest.content).length === 0) {
        return [];
    }
    const copiedFiles = [];
    for (const [, mapping] of Object.entries(manifest.content)) {
        const sourceDir = path.join(pluginDir, mapping.source);
        const targetDir = path.join(projectRoot, mapping.target);
        if (!fs.existsSync(sourceDir)) {
            continue;
        }
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".md")) {
                continue;
            }
            const srcFile = path.join(sourceDir, entry.name);
            const dstFile = path.join(targetDir, entry.name);
            fs.copyFileSync(srcFile, dstFile);
            // Store with forward slashes for cross-platform consistency
            const relativePath = path
                .join(mapping.target, entry.name)
                .replace(/\\/g, "/");
            copiedFiles.push(relativePath);
        }
    }
    return copiedFiles;
}
/**
 * Remove all content files belonging to a plugin and update the manifest.
 *
 * @param pluginName - The plugin's `name` field from its manifest.
 * @param projectRoot - Absolute path to the project root.
 */
export function removePluginContent(pluginName, projectRoot) {
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
    const updated = {
        plugins: { ...contentManifest.plugins },
    };
    delete updated.plugins[pluginName];
    writeContentManifest(projectRoot, updated);
}
// ---------------------------------------------------------------------------
// Dependencies & Build
// ---------------------------------------------------------------------------
/**
 * Install plugin dependencies.
 *
 * - If `pluginManifest.dependencies.npm` is non-empty, runs `npm install` in pluginDir.
 * - If `pluginManifest.dependencies.system` is non-empty, checks each binary exists.
 *
 * @throws {Error} If any required system binary is not found on PATH.
 */
export function installPluginDeps(pluginDir, pluginManifest) {
    const deps = pluginManifest.dependencies;
    if (!deps) {
        return;
    }
    if (Array.isArray(deps.npm) && deps.npm.length > 0) {
        // Skip npm install if node_modules exists and a package.json is present —
        // in dev environments deps are typically already linked.
        const hasNodeModules = fs.existsSync(path.join(pluginDir, "node_modules"));
        const hasPackageJson = fs.existsSync(path.join(pluginDir, "package.json"));
        if (!hasNodeModules && hasPackageJson) {
            execSync("npm install", { cwd: pluginDir, stdio: "inherit" });
        }
        else if (!hasPackageJson) {
            // No package.json — nothing to install
        }
        // If node_modules exists, assume deps are already satisfied
    }
    if (Array.isArray(deps.system) && deps.system.length > 0) {
        const missing = [];
        for (const req of deps.system) {
            if (!isBinaryAvailable(req.binary)) {
                missing.push(req.binary);
            }
        }
        if (missing.length > 0) {
            throw new Error(`Plugin "${pluginManifest.name}" requires system binaries that were not found: ${missing.join(", ")}`);
        }
    }
}
/**
 * Run the plugin's build command, if declared.
 *
 * @param pluginDir - Absolute path to the plugin directory (cwd for the command).
 * @param pluginManifest - The plugin's manifest.
 */
export function buildPlugin(pluginDir, pluginManifest) {
    if (!pluginManifest.build) {
        return;
    }
    execSync(pluginManifest.build, { cwd: pluginDir, stdio: "inherit" });
}
// ---------------------------------------------------------------------------
// Lifecycle Hooks
// ---------------------------------------------------------------------------
/**
 * Run a plugin lifecycle hook command (`install` or `uninstall`), if declared.
 *
 * @param pluginDir - Absolute path to the plugin directory (cwd for the command).
 * @param pluginManifest - The plugin's manifest.
 * @param hook - Which hook to run.
 */
export function runLifecycleHook(pluginDir, pluginManifest, hook) {
    const command = pluginManifest.lifecycle?.[hook];
    if (!command) {
        return;
    }
    execSync(command, { cwd: pluginDir, stdio: "inherit" });
}
// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------
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
export function diffPluginContent(pluginDir, projectRoot, pluginManifest) {
    const result = {
        pluginName: pluginManifest.name,
        identical: [],
        modified: [],
        missing: [],
        orphaned: [],
    };
    const contentManifest = readContentManifest(projectRoot);
    const entry = contentManifest.plugins[pluginManifest.name];
    const trackedFiles = new Set(entry?.files ?? []);
    // Categorise each tracked file
    for (const relPath of trackedFiles) {
        const installedPath = path.join(projectRoot, relPath);
        if (!fs.existsSync(installedPath)) {
            result.missing.push(relPath);
            continue;
        }
        // Find the corresponding source file in the plugin
        const sourceFile = findSourceFile(pluginDir, pluginManifest, relPath);
        if (!sourceFile || !fs.existsSync(sourceFile)) {
            // Source no longer exists — treat as modified (stale install)
            result.modified.push(relPath);
            continue;
        }
        const installedContent = fs.readFileSync(installedPath);
        const sourceContent = fs.readFileSync(sourceFile);
        if (installedContent.equals(sourceContent)) {
            result.identical.push(relPath);
        }
        else {
            result.modified.push(relPath);
        }
    }
    // Find orphaned files in target dirs — files not tracked by ANY plugin
    if (pluginManifest.content) {
        // Build set of ALL tracked files across ALL plugins
        const allTrackedFiles = new Set();
        for (const [, pluginEntry] of Object.entries(contentManifest.plugins)) {
            for (const f of pluginEntry.files) {
                allTrackedFiles.add(f);
            }
        }
        for (const [, mapping] of Object.entries(pluginManifest.content)) {
            const targetDir = path.join(projectRoot, mapping.target);
            if (!fs.existsSync(targetDir)) {
                continue;
            }
            const entries = fs.readdirSync(targetDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isFile() || !entry.name.endsWith(".md")) {
                    continue;
                }
                const relPath = path.join(mapping.target, entry.name).replace(/\\/g, "/");
                // Only orphaned if not tracked by ANY plugin
                if (!allTrackedFiles.has(relPath)) {
                    result.orphaned.push(relPath);
                }
            }
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------
/**
 * Re-install a plugin's dependencies, rebuild, re-copy content, and update the manifest.
 *
 * @param pluginDir - Absolute path to the plugin directory.
 * @param projectRoot - Absolute path to the project root.
 * @param pluginManifest - The plugin's manifest.
 * @returns Relative paths of all files that were (re-)copied.
 */
export function refreshPluginContent(pluginDir, projectRoot, pluginManifest) {
    installPluginDeps(pluginDir, pluginManifest);
    buildPlugin(pluginDir, pluginManifest);
    const copiedFiles = copyPluginContent(pluginDir, projectRoot, pluginManifest);
    // Update the content manifest
    const contentManifest = readContentManifest(projectRoot);
    contentManifest.plugins[pluginManifest.name] = {
        version: pluginManifest.version,
        installed_at: new Date().toISOString(),
        files: copiedFiles,
    };
    writeContentManifest(projectRoot, contentManifest);
    return copiedFiles;
}
// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------
/**
 * Check whether a binary is available on the system PATH.
 * Tries `which` (Unix) and `where` (Windows) — handles both.
 */
function isBinaryAvailable(binary) {
    for (const checker of [`which ${binary}`, `where ${binary}`]) {
        try {
            execSync(checker, { stdio: ["pipe", "pipe", "pipe"] });
            return true;
        }
        catch {
            // Not found via this checker — try the next
        }
    }
    return false;
}
/**
 * Given a relative path from the project root (e.g. `.orqa/process/rules/RULE-abc.md`),
 * find the corresponding source file in the plugin directory by matching target mappings.
 *
 * Returns the absolute path to the source file, or null if no mapping covers this path.
 */
function findSourceFile(pluginDir, pluginManifest, relPath) {
    if (!pluginManifest.content) {
        return null;
    }
    // Normalise to forward slashes for comparison
    const normRelPath = relPath.replace(/\\/g, "/");
    for (const [, mapping] of Object.entries(pluginManifest.content)) {
        const normTarget = mapping.target.replace(/\\/g, "/").replace(/\/$/, "");
        if (!normRelPath.startsWith(`${normTarget}/`)) {
            continue;
        }
        const filename = normRelPath.slice(normTarget.length + 1);
        return path.join(pluginDir, mapping.source, filename);
    }
    return null;
}
//# sourceMappingURL=content-lifecycle.js.map