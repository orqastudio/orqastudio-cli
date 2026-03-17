/**
 * Integrity validator — absorbed from @orqastudio/integrity-validator.
 *
 * Generic schema-driven validator that evaluates core.json + plugin
 * relationship constraints against the artifact graph. No custom
 * business logic — the schema IS the rule.
 */

export { buildGraph } from "./graph.js";
export { runChecks, runChecksWithSummary, buildCheckContext, ALL_CHECKS } from "./checker.js";
export type {
	IntegrityFinding,
	IntegrityCategory,
	IntegritySeverity,
	ArtifactRef,
	ArtifactNode,
	ArtifactGraph,
	CheckContext,
} from "./types.js";
