import type { ArtifactGraph, IntegrityFinding, CheckContext } from "../types.js";

/**
 * Validate that relationships respect their type constraints.
 *
 * Each relationship definition in core.json declares:
 * - `from`: artifact types allowed as the source of the FORWARD key (empty = any)
 * - `to`: artifact types allowed as the target of the FORWARD key (empty = any)
 *
 * Only forward-direction constraints are checked. Inverse relationships are
 * validated through the forward definition on the other end (via MissingInverse).
 *
 * Example: `enforces` has `from: ["rule"], to: ["decision"]`
 *   - "RULE-001 --enforces--> AD-001" → source=rule (ok), target=decision (ok)
 *   - "AD-001 --enforced-by--> RULE-001" → not checked here (inverse direction)
 */
export function checkRelationshipConstraints(
  graph: ArtifactGraph,
  ctx: CheckContext,
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  // Build lookup for forward keys only (inverse constraints are implicit)
  const forwardKeys = new Set<string>();
  const constraints = new Map<string, { fromTypes: string[]; toTypes: string[] }>();

  for (const rel of ctx.relationships) {
    const r = rel as { key: string; inverse: string; from?: string[]; to?: string[] };
    const from = r.from ?? [];
    const to = r.to ?? [];
    if (from.length === 0 && to.length === 0) continue;

    forwardKeys.add(r.key);
    constraints.set(r.key, { fromTypes: from, toTypes: to });
  }

  for (const node of graph.nodes.values()) {
    for (const ref of node.referencesOut) {
      if (!ref.relationshipType) continue;

      // Only check forward-direction keys
      if (!forwardKeys.has(ref.relationshipType)) continue;

      const constraint = constraints.get(ref.relationshipType);
      if (!constraint) continue;

      // Source type check
      if (
        constraint.fromTypes.length > 0 &&
        !constraint.fromTypes.includes(node.artifactType)
      ) {
        findings.push({
          category: "RelationshipConstraint",
          severity: "warning",
          artifactId: node.id,
          message: `${node.id} (${node.artifactType}) uses "${ref.relationshipType}" but only ${constraint.fromTypes.join(", ")} types should use this relationship`,
          autoFixable: false,
        });
      }

      // Target type check — skip when the source is itself a `to` type
      // (this means the forward key is being used as an inverse backlink,
      // e.g., PILLAR-001 --grounded--> EPIC-001 is the pillar's inverse)
      const isInverseBacklink =
        constraint.toTypes.length > 0 &&
        constraint.toTypes.includes(node.artifactType);

      const target = graph.nodes.get(ref.targetId);
      if (
        target &&
        !isInverseBacklink &&
        constraint.toTypes.length > 0 &&
        !constraint.toTypes.includes(target.artifactType)
      ) {
        findings.push({
          category: "RelationshipConstraint",
          severity: "warning",
          artifactId: node.id,
          message: `${node.id} --${ref.relationshipType}--> ${ref.targetId} (${target.artifactType}) but target should be: ${constraint.toTypes.join(", ")}`,
          autoFixable: false,
        });
      }
    }
  }

  return findings;
}
