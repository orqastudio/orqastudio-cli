/**
 * @orqastudio/cli — library exports for programmatic use.
 *
 * Used by connectors, plugins, and other consumers that need
 * plugin management, validation, graph browsing, or version management
 * without spawning a subprocess.
 */
// Symlink utilities
export { createSymlink, ensureSymlink, verifySymlink, removeSymlink, } from "./lib/symlink.js";
// Plugin management
export { installPlugin, uninstallPlugin, listInstalledPlugins } from "./lib/installer.js";
export { fetchRegistry } from "./lib/registry.js";
export { readLockfile, writeLockfile } from "./lib/lockfile.js";
export { readManifest, validateManifest } from "./lib/manifest.js";
// Graph browsing
export { scanArtifactGraph, queryGraph, getGraphStats } from "./lib/graph.js";
// Version management
export { readCanonicalVersion, writeCanonicalVersion, syncVersions, checkVersionDrift, } from "./lib/version-sync.js";
// Repo maintenance
export { auditLicenses, DEFAULT_LICENSE_POLICY } from "./lib/license.js";
export { auditReadmes, generateReadmeTemplate } from "./lib/readme.js";
//# sourceMappingURL=index.js.map