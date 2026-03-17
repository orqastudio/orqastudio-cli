import type { ArtifactGraph, IntegrityFinding, CheckContext } from "../types.js";
import { keysForSemantic } from "../types.js";

/**
 * Check that surpassed ideas have lineage relationships showing what they became.
 *
 * Uses the "lineage" semantic from platform config to determine which relationship
 * types count as valid lineage (e.g. evolves-into, merged-into) — no hardcoded keys.
 */
export function checkIdeaPromotionValidity(graph: ArtifactGraph, ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  // Get all forward lineage keys (e.g. evolves-into, merged-into — NOT evolves-from, merged-from)
  const allLineageKeys = keysForSemantic(ctx.semantics, "lineage");
  // Only forward direction counts: filter to keys that are NOT inverses of another lineage key
  const forwardLineageKeys = new Set(
    allLineageKeys.filter((k) => {
      const inverse = ctx.inverseMap.get(k);
      // A key is "forward" if its inverse is also in the lineage set but is different
      // For self-inverse keys, include them. For pairs, include only the "into" direction.
      return inverse !== undefined && (inverse === k || !allLineageKeys.includes(inverse) || k.includes("into"));
    })
  );

  for (const node of graph.nodes.values()) {
    if (node.artifactType !== "idea") continue;
    if (node.status !== "surpassed") continue;

    const hasLineage = node.referencesOut.some(
      (r) => r.relationshipType != null && forwardLineageKeys.has(r.relationshipType)
    );

    if (!hasLineage) {
      const lineageNames = [...forwardLineageKeys].join(" or ");
      findings.push({
        category: "IdeaPromotionValidity",
        severity: "error",
        artifactId: node.id,
        message: `${node.id} has status: surpassed but no lineage relationship (${lineageNames}) — should reference the artifact it became or was consolidated into`,
        autoFixable: false,
      });
    }
  }

  return findings;
}

/**
 * Check that ideas whose evolved targets are completed should themselves
 * be in a terminal state.
 *
 * Uses the "lineage" semantic to find forward lineage relationships.
 */
export function checkIdeaDeliveryTracking(graph: ArtifactGraph, ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const lineageKeys = new Set(
    keysForSemantic(ctx.semantics, "lineage").filter((k) => k.includes("into"))
  );

  for (const node of graph.nodes.values()) {
    if (node.artifactType !== "idea") continue;
    if (node.status === "completed" || node.status === "surpassed" || node.status === "archived") continue;

    const lineageRefs = node.referencesOut.filter(
      (r) => r.relationshipType != null && lineageKeys.has(r.relationshipType)
    );
    if (lineageRefs.length === 0) continue;

    for (const ref of lineageRefs) {
      const target = graph.nodes.get(ref.targetId);
      if (!target || target.status !== "completed") continue;

      findings.push({
        category: "IdeaDeliveryTracking",
        severity: "warning",
        artifactId: node.id,
        message: `${node.id} ${ref.relationshipType} ${ref.targetId} which is completed, but idea is still status: ${node.status ?? "unknown"} — should be surpassed or completed`,
        autoFixable: false,
      });
    }
  }

  return findings;
}

/**
 * Check that ideas with research-needed items have related research artifacts.
 *
 * Uses incoming relationship edges to detect connected research.
 */
export function checkResearchGaps(graph: ArtifactGraph, _ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  for (const node of graph.nodes.values()) {
    if (node.artifactType !== "idea") continue;
    if (node.status !== "completed" && node.status !== "surpassed") continue;

    const researchNeeded = node.frontmatter["research-needed"];
    if (!Array.isArray(researchNeeded) || researchNeeded.length === 0) continue;

    // Check if any artifacts reference this idea via relationships
    const hasRelatedArtifacts = node.referencesIn.some(
      (r) => r.field === "relationships" && graph.nodes.has(r.sourceId)
    );

    if (!hasRelatedArtifacts) {
      findings.push({
        category: "ResearchGap",
        severity: "warning",
        artifactId: node.id,
        message: `${node.id} is ${node.status} with ${researchNeeded.length} research-needed items but no artifacts reference it — research questions may be unresolved`,
        autoFixable: false,
      });
    }
  }

  return findings;
}
