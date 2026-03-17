/**
 * @orqastudio/cli — library exports for programmatic use.
 *
 * Used by connectors, plugins, and other consumers that need
 * plugin management, validation, graph browsing, or version management
 * without spawning a subprocess.
 */

// Plugin management
export { installPlugin, uninstallPlugin, listInstalledPlugins } from "./lib/installer.js";
export { fetchRegistry } from "./lib/registry.js";
export { readLockfile, writeLockfile } from "./lib/lockfile.js";
export { readManifest, validateManifest } from "./lib/manifest.js";

// Graph browsing
export { scanArtifactGraph, queryGraph, getGraphStats, type GraphNode, type GraphQueryOptions } from "./lib/graph.js";

// Version management
export {
	readCanonicalVersion,
	writeCanonicalVersion,
	syncVersions,
	checkVersionDrift,
} from "./lib/version-sync.js";

// Repo maintenance
export { auditLicenses, DEFAULT_LICENSE_POLICY, type LicenseAuditResult, type LicensePolicy } from "./lib/license.js";
export { auditReadmes, generateReadmeTemplate, type ReadmeAuditResult } from "./lib/readme.js";

// Integrity validation (absorbed from @orqastudio/integrity-validator)
export { buildGraph } from "./validator/graph.js";
export { runChecks, runChecksWithSummary, buildCheckContext, ALL_CHECKS } from "./validator/checker.js";
export type { IntegrityFinding, IntegrityCategory, IntegritySeverity, ArtifactNode, ArtifactGraph, CheckContext } from "./validator/types.js";
