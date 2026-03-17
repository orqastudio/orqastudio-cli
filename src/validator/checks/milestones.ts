import type { ArtifactGraph, IntegrityFinding, CheckContext } from "../types.js";

/**
 * Check that completed milestones have all P1 epics completed.
 *
 * Graph-first model: epics connect to milestones via `delivers` relationships.
 * We find epics by looking at the milestone's incoming `delivers` edges.
 */
export function checkMilestoneGate(graph: ArtifactGraph, ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  // Derive the delivery relationship key from ctx.deliveryTypes hierarchy
  const deliveryRel = ctx.deliveryTypes.find((dt) => dt.parent?.relationship)?.parent?.relationship ?? "delivers";

  for (const node of graph.nodes.values()) {
    if (node.artifactType !== "milestone") continue;
    if (node.status !== "completed") continue;

    // Find all epics that deliver to this milestone (incoming delivery edges)
    const incompleteP1: string[] = [];
    for (const ref of node.referencesIn) {
      if (ref.relationshipType !== deliveryRel) continue;
      const epic = graph.nodes.get(ref.sourceId);
      if (!epic || epic.artifactType !== "epic") continue;

      const priority = typeof epic.frontmatter["priority"] === "string"
        ? epic.frontmatter["priority"]
        : "";
      if (priority !== "P1") continue;
      if (epic.status !== "completed") {
        incompleteP1.push(epic.id);
      }
    }

    if (incompleteP1.length > 0) {
      findings.push({
        category: "MilestoneGate",
        severity: "error",
        artifactId: node.id,
        message: `${node.id} is completed but has ${incompleteP1.length} incomplete P1 epic(s): ${incompleteP1.join(", ")}`,
        autoFixable: false,
      });
    }
  }

  return findings;
}
