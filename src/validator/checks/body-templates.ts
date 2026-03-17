import type { ArtifactGraph, IntegrityFinding, CheckContext } from "../types.js";

/**
 * Extract ## headings and their content from a markdown body.
 * Returns a map from heading text to the content below it (trimmed).
 */
function extractSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = body.split("\n");
  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line);
    if (match) {
      // Save previous section
      if (currentHeading !== null) {
        sections.set(currentHeading, currentContent.join("\n").trim());
      }
      currentHeading = match[1].trim();
      currentContent = [];
    } else if (currentHeading !== null) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentHeading !== null) {
    sections.set(currentHeading, currentContent.join("\n").trim());
  }

  return sections;
}

/** Check that artifacts contain required body sections from their schema's bodyTemplate. */
export function checkBodyTemplates(graph: ArtifactGraph, _ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  for (const node of graph.nodes.values()) {
    const template = graph.bodyTemplates.get(node.artifactType);
    if (!template) continue;

    const requiredSections = template.sections.filter((s) => s.required);
    if (requiredSections.length === 0) continue;

    const bodySections = extractSections(node.body);

    for (const section of requiredSections) {
      const content = bodySections.get(section.heading);
      if (content === undefined) {
        findings.push({
          category: "BodyTemplate",
          severity: "warning",
          artifactId: node.id,
          message: `Missing required body section "## ${section.heading}" (expected by ${node.artifactType} schema)`,
          autoFixable: false,
        });
      } else if (content.length === 0) {
        findings.push({
          category: "BodyTemplate",
          severity: "warning",
          artifactId: node.id,
          message: `Required body section "## ${section.heading}" is empty (expected non-empty content)`,
          autoFixable: false,
        });
      }
    }
  }

  return findings;
}
