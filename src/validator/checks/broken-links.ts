import type { ArtifactGraph, IntegrityFinding, CheckContext } from "../types.js";

/** Check for references to non-existent artifacts. */
export function checkBrokenLinks(graph: ArtifactGraph, _ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  for (const node of graph.nodes.values()) {
    for (const ref of node.referencesOut) {
      if (!graph.nodes.has(ref.targetId)) {
        findings.push({
          category: "BrokenLink",
          severity: "error",
          artifactId: node.id,
          message: `Reference to ${ref.targetId} (field: ${ref.field}) does not resolve to any artifact`,
          autoFixable: false,
        });
      }
    }
  }

  return findings;
}
