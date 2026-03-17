import type { ArtifactGraph, IntegrityFinding, CheckContext } from "../types.js";

/**
 * Check for active tasks whose dependencies aren't completed.
 *
 * Graph-first model: dependencies use `depends-on` relationship type
 * in the relationships array, not a standalone `depends-on` field.
 */
export function checkDependencyViolations(graph: ArtifactGraph, _ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  for (const node of graph.nodes.values()) {
    if (node.artifactType !== "task") continue;
    if (node.status !== "active") continue;

    const deps = node.referencesOut.filter(
      (r) => r.relationshipType === "depends-on"
    );

    for (const dep of deps) {
      const target = graph.nodes.get(dep.targetId);
      if (!target) continue; // broken ref, caught elsewhere
      if (target.status !== "completed") {
        findings.push({
          category: "DependencyViolation",
          severity: "error",
          artifactId: node.id,
          message: `${node.id} is active but dependency ${dep.targetId} is ${target.status ?? "unknown"} — dependency gate violated`,
          autoFixable: false,
        });
      }
    }
  }

  return findings;
}

/**
 * Check for circular dependencies in depends-on chains.
 *
 * Graph-first model: traverses `depends-on` relationship edges.
 */
export function checkCircularDependencies(graph: ArtifactGraph, _ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const visited = new Set<string>();
  const reported = new Set<string>();

  function dfs(nodeId: string, path: string[]): void {
    if (path.includes(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart).concat(nodeId);
      const key = [...cycle].sort().join(",");
      if (!reported.has(key)) {
        reported.add(key);
        findings.push({
          category: "CircularDependency",
          severity: "error",
          artifactId: nodeId,
          message: `Circular dependency: ${cycle.join(" → ")}`,
          autoFixable: false,
        });
      }
      return;
    }
    if (visited.has(nodeId)) return;

    const node = graph.nodes.get(nodeId);
    if (!node) return;

    const deps = node.referencesOut.filter(
      (r) => r.relationshipType === "depends-on"
    );

    path.push(nodeId);
    for (const dep of deps) {
      dfs(dep.targetId, path);
    }
    path.pop();
    visited.add(nodeId);
  }

  for (const node of graph.nodes.values()) {
    if (node.artifactType === "task") {
      dfs(node.id, []);
    }
  }

  return findings;
}
