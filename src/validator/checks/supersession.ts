import type { ArtifactGraph, IntegrityFinding, CheckContext } from "../types.js";
import { keysForSemantic } from "../types.js";

/**
 * Check decision supersession symmetry using evolves-into/evolves-from relationships.
 *
 * Graph-first model: supersession is tracked via `evolves-into`/`evolves-from`
 * relationships instead of standalone `supersedes`/`superseded-by` fields.
 * If A evolves-into B, then B must have evolves-from A.
 *
 * Note: This is now a subset of the general MissingInverse check, but kept
 * as a separate check for clearer categorisation of decision-specific findings.
 */
export function checkSupersessionSymmetry(graph: ArtifactGraph, ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  // Get lineage relationship keys and filter to the evolves-into/evolves-from pair
  const lineageKeys = keysForSemantic(ctx.semantics, "lineage");
  const forwardKey = lineageKeys.find((k) => k === "evolves-into");
  const inverseKey = lineageKeys.find((k) => k === "evolves-from");

  if (!forwardKey || !inverseKey) return findings;

  for (const node of graph.nodes.values()) {
    if (node.artifactType !== "decision") continue;

    // Check forward (evolves-into) has matching inverse (evolves-from)
    const forwardRefs = node.referencesOut.filter(
      (r) => r.relationshipType === forwardKey
    );

    for (const ref of forwardRefs) {
      const target = graph.nodes.get(ref.targetId);
      if (!target) continue; // broken ref, caught elsewhere

      const hasInverse = target.referencesOut.some(
        (r) => r.relationshipType === inverseKey && r.targetId === node.id
      );

      if (!hasInverse) {
        findings.push({
          category: "SupersessionSymmetry",
          severity: "error",
          artifactId: node.id,
          message: `${node.id} ${forwardKey} ${ref.targetId} but ${ref.targetId} does not have ${inverseKey} ${node.id}`,
          autoFixable: true,
          fixDescription: `Add { target: "${node.id}", type: "${inverseKey}" } to ${ref.targetId}'s relationships array`,
        });
      }
    }

    // Check inverse (evolves-from) has matching forward (evolves-into)
    const inverseRefs = node.referencesOut.filter(
      (r) => r.relationshipType === inverseKey
    );

    for (const ref of inverseRefs) {
      const target = graph.nodes.get(ref.targetId);
      if (!target) continue;

      const hasForward = target.referencesOut.some(
        (r) => r.relationshipType === forwardKey && r.targetId === node.id
      );

      if (!hasForward) {
        findings.push({
          category: "SupersessionSymmetry",
          severity: "error",
          artifactId: node.id,
          message: `${node.id} ${inverseKey} ${ref.targetId} but ${ref.targetId} does not have ${forwardKey} ${node.id}`,
          autoFixable: true,
          fixDescription: `Add { target: "${node.id}", type: "${forwardKey}" } to ${ref.targetId}'s relationships array`,
        });
      }
    }
  }

  return findings;
}
