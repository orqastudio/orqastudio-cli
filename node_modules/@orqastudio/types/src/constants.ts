import type { RelationshipType } from "./plugin.js";

/**
 * Build a bidirectional inverse map from an array of relationship definitions.
 *
 * This replaces the hardcoded INVERSE_MAP constant. Both platform relationships
 * and project/plugin relationships use the same `RelationshipType` shape, so
 * callers merge them before calling this function.
 */
export function buildInverseMap(
	relationships: ReadonlyArray<Pick<RelationshipType, "key" | "inverse">>,
): ReadonlyMap<string, string> {
	const map = new Map<string, string>();
	for (const rel of relationships) {
		map.set(rel.key, rel.inverse);
		if (rel.inverse !== rel.key) {
			map.set(rel.inverse, rel.key);
		}
	}
	return map;
}

/**
 * Check whether a relationship key has a given semantic in the semantics map.
 *
 * Usage: `hasSemanticRole(semantics, "evolves-into", "lineage")` → true
 * This allows checks to query intent ("is this a lineage relationship?")
 * without hardcoding specific relationship keys.
 */
export function hasSemantic(
	semantics: Record<string, { keys: string[] }>,
	relationshipKey: string,
	semanticName: string,
): boolean {
	return semantics[semanticName]?.keys.includes(relationshipKey) ?? false;
}

/**
 * Get all relationship keys for a given semantic category.
 *
 * Usage: `keysForSemantic(semantics, "lineage")` → ["evolves-into", "evolves-from", "merged-into", "merged-from"]
 */
export function keysForSemantic(
	semantics: Record<string, { keys: string[] }>,
	semanticName: string,
): string[] {
	return semantics[semanticName]?.keys ?? [];
}

