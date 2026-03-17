import type { ArtifactGraph, IntegrityFinding, CheckContext } from "../types.js";

/** Check for relationship edges missing their bidirectional inverse. */
export function checkMissingInverses(graph: ArtifactGraph, ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  for (const node of graph.nodes.values()) {
    for (const ref of node.referencesOut) {
      if (ref.field !== "relationships" || !ref.relationshipType) continue;

      const expectedInverse = ctx.inverseMap.get(ref.relationshipType);
      if (!expectedInverse) continue;

      const target = graph.nodes.get(ref.targetId);
      if (!target) continue; // broken ref, caught elsewhere

      const hasInverse = target.referencesOut.some(
        (r) =>
          r.field === "relationships" &&
          r.relationshipType === expectedInverse &&
          r.targetId === node.id
      );

      if (!hasInverse) {
        findings.push({
          category: "MissingInverse",
          severity: "warning",
          artifactId: node.id,
          message: `${node.id} --${ref.relationshipType}--> ${ref.targetId} but ${ref.targetId} has no ${expectedInverse} edge back to ${node.id}`,
          autoFixable: true,
          fixDescription: `Add { target: "${node.id}", type: "${expectedInverse}" } to ${ref.targetId}'s relationships array`,
        });
      }
    }
  }

  return findings;
}
