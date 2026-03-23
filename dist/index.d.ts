/**
 * @orqastudio/cli — library exports for programmatic use.
 *
 * Used by connectors, plugins, and other consumers that need
 * plugin management, validation, graph browsing, or version management
 * without spawning a subprocess.
 */
export { createSymlink, ensureSymlink, verifySymlink, removeSymlink, type SymlinkOptions, type SymlinkResult, type SymlinkVerification, } from "./lib/symlink.js";
export { installPlugin, uninstallPlugin, listInstalledPlugins } from "./lib/installer.js";
export { fetchRegistry } from "./lib/registry.js";
export { readLockfile, writeLockfile } from "./lib/lockfile.js";
export { readManifest, validateManifest } from "./lib/manifest.js";
export { scanArtifactGraph, queryGraph, getGraphStats, type GraphNode, type GraphQueryOptions } from "./lib/graph.js";
export { readCanonicalVersion, writeCanonicalVersion, syncVersions, checkVersionDrift, } from "./lib/version-sync.js";
export { auditLicenses, DEFAULT_LICENSE_POLICY, type LicenseAuditResult, type LicensePolicy } from "./lib/license.js";
export { auditReadmes, generateReadmeTemplate, type ReadmeAuditResult } from "./lib/readme.js";
//# sourceMappingURL=index.d.ts.map