import type { ArtifactGraph, IntegrityFinding, CheckContext } from "../types.js";

/**
 * Check that artifacts with a `priority` field also have a `scoring`
 * field providing justification for the priority assessment.
 *
 * Applies to epics and tasks. A missing or empty `scoring` object
 * produces a warning (not an error) since scoring is recommended but
 * not strictly required by the schema.
 */
export function checkPriorityWithoutJustification(
  graph: ArtifactGraph,
  _ctx: CheckContext,
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const applicableTypes = new Set(["epic", "task"]);

  for (const node of graph.nodes.values()) {
    if (!applicableTypes.has(node.artifactType)) continue;

    const priority = node.frontmatter["priority"];
    if (typeof priority !== "string" || !priority.trim()) continue;

    const scoring = node.frontmatter["scoring"];

    // scoring is present and non-empty object
    if (
      scoring !== null &&
      scoring !== undefined &&
      typeof scoring === "object" &&
      !Array.isArray(scoring) &&
      Object.keys(scoring as Record<string, unknown>).length > 0
    ) {
      continue;
    }

    findings.push({
      category: "PriorityWithoutJustification",
      severity: "warning",
      artifactId: node.id,
      message: `${node.id} has priority ${priority} but no scoring justification — add a scoring field with assessment dimensions`,
      autoFixable: false,
      fixDescription: `Add a scoring field to ${node.id} with dimensions justifying the ${priority} priority`,
    });
  }

  return findings;
}
