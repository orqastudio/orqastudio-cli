import type { ArtifactGraph, ArtifactNode, IntegrityFinding, CheckContext } from "../types.js";
import { keysForSemantic } from "../types.js";

/** Canonical terminal statuses — artifacts in these states are excluded from placement checks. */
const TERMINAL_STATUSES = new Set([
  "completed", "surpassed", "archived",
]);

/** Find connected node IDs by outgoing relationship type. */
function outgoingByType(node: ArtifactNode, relType: string): string[] {
  return node.referencesOut
    .filter((r) => r.relationshipType === relType)
    .map((r) => r.targetId);
}

/**
 * Check that planning artifacts are placed — either connected to a milestone
 * or have a planning horizon.
 *
 * - Epics/tasks: require `delivers` to milestone (directly or inherited)
 * - Ideas: require a horizon field OR a lineage relationship (evolves-into/merged-into)
 * - All: terminal statuses are excluded
 */
export function checkPlanningPlacement(graph: ArtifactGraph, ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  // Derive the delivery relationship key from delivery config
  const deliveryRel = ctx.deliveryTypes
    .find((dt) => dt.parent?.relationship)?.parent?.relationship ?? "delivers";

  // Forward lineage keys from semantic config
  const lineageKeys = new Set(
    keysForSemantic(ctx.semantics, "lineage").filter((k) => k.includes("into"))
  );

  for (const node of graph.nodes.values()) {
    if (!["idea", "epic", "task"].includes(node.artifactType)) continue;
    if (node.status && TERMINAL_STATUSES.has(node.status)) continue;

    // Check for horizon field (any artifact type)
    const horizon = node.frontmatter["horizon"];
    if (typeof horizon === "string" && horizon !== "" && horizon !== "null") continue;

    if (node.artifactType === "idea") {
      // Ideas are placed if they have a lineage relationship (they evolve into something)
      const hasLineage = node.referencesOut.some(
        (r) => r.relationshipType != null && lineageKeys.has(r.relationshipType)
      );
      if (hasLineage) continue;

      findings.push({
        category: "PlanningPlacement",
        severity: "warning",
        artifactId: node.id,
        message: `${node.id} (idea) has no horizon and no lineage relationship — untriaged`,
        autoFixable: false,
      });
      continue;
    }

    // Epics and tasks: check delivers to milestone
    const deliversTo = outgoingByType(node, deliveryRel);
    const hasMilestone = deliversTo.some((id) => {
      const target = graph.nodes.get(id);
      return target?.artifactType === "milestone";
    });
    if (hasMilestone) continue;

    // Tasks can inherit milestone through their epic
    if (node.artifactType === "task") {
      const epicIds = deliversTo.filter((id) => {
        const target = graph.nodes.get(id);
        return target?.artifactType === "epic";
      });
      const inherited = epicIds.some((epicId) => {
        const epic = graph.nodes.get(epicId);
        if (!epic) return false;
        return outgoingByType(epic, deliveryRel).some((id) => {
          const target = graph.nodes.get(id);
          return target?.artifactType === "milestone";
        });
      });
      if (inherited) continue;

      // Tasks also inherit through epic's milestone — already checked above
    }

    // Ideas are already handled above, so this is epics/tasks only
    const hasIndirectMilestone = node.artifactType === "task" && deliversTo.some((epicId) => {
      const epic = graph.nodes.get(epicId);
      if (!epic || epic.artifactType !== "epic") return false;
      return outgoingByType(epic, deliveryRel).some((msId) =>
        graph.nodes.get(msId)?.artifactType === "milestone"
      );
    });
    if (hasIndirectMilestone) continue;

    findings.push({
      category: "PlanningPlacement",
      severity: "warning",
      artifactId: node.id,
      message: `${node.id} (${node.artifactType}) has no milestone and no planning horizon — untriaged`,
      autoFixable: false,
    });
  }

  return findings;
}
