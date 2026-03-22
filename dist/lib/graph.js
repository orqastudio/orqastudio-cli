/**
 * Artifact graph scanner and query engine for CLI usage.
 *
 * Scans the `.orqa/` directory to build a lightweight in-memory graph,
 * then supports queries by type, status, relationships, and text search.
 *
 * This allows CLI users (including Claude Code) to browse the artifact graph
 * without needing the Tauri app running.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------
/**
 * Scan the `.orqa/` directory and build an in-memory artifact graph.
 */
export function scanArtifactGraph(projectRoot) {
    const root = projectRoot ?? process.cwd();
    const orqaDir = path.join(root, ".orqa");
    if (!fs.existsSync(orqaDir)) {
        return [];
    }
    const nodes = [];
    scanDirectory(orqaDir, root, nodes);
    return nodes;
}
function scanDirectory(dir, projectRoot, nodes) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "tmp" || entry.name === "node_modules" || entry.name.startsWith(".")) {
                continue;
            }
            scanDirectory(fullPath, projectRoot, nodes);
        }
        else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
            const node = parseArtifact(fullPath, projectRoot);
            if (node)
                nodes.push(node);
        }
    }
}
function parseArtifact(filePath, projectRoot) {
    const content = fs.readFileSync(filePath, "utf-8");
    // Extract and parse YAML frontmatter
    if (!content.startsWith("---\n"))
        return null;
    const fmEnd = content.indexOf("\n---", 4);
    if (fmEnd === -1)
        return null;
    let frontmatter;
    try {
        frontmatter = parseYaml(content.slice(4, fmEnd));
    }
    catch {
        return null;
    }
    if (!frontmatter.id)
        return null;
    // Extract title from first heading after frontmatter
    const afterFm = content.slice(fmEnd + 5);
    const titleMatch = afterFm.match(/^#\s+(.+)/m);
    const title = frontmatter.title ?? titleMatch?.[1] ?? frontmatter.id;
    // Parse relationships
    const relationships = [];
    if (Array.isArray(frontmatter.relationships)) {
        for (const rel of frontmatter.relationships) {
            if (typeof rel === "object" && rel !== null && "target" in rel && "type" in rel) {
                relationships.push({
                    target: String(rel.target),
                    type: String(rel.type),
                });
            }
        }
    }
    return {
        id: String(frontmatter.id),
        type: String(frontmatter.type ?? inferType(filePath)),
        title: String(title),
        status: String(frontmatter.status ?? "unknown"),
        path: path.relative(projectRoot, filePath).replace(/\\/g, "/"),
        relationships,
        frontmatter,
    };
}
function inferType(filePath) {
    const parts = filePath.replace(/\\/g, "/").split("/");
    // Look for type clues in the path: .orqa/delivery/epics/ → "epic"
    for (const part of parts) {
        const singular = part.replace(/s$/, "");
        if (["epic", "task", "milestone", "idea", "decision", "rule", "lesson", "knowledge", "agent", "pillar", "persona", "research", "wireframe"].includes(singular)) {
            return singular;
        }
    }
    return "artifact";
}
// ---------------------------------------------------------------------------
// Querying
// ---------------------------------------------------------------------------
/**
 * Query the artifact graph with filters.
 */
export function queryGraph(nodes, options) {
    let results = [...nodes];
    if (options.type) {
        const types = Array.isArray(options.type) ? options.type : [options.type];
        results = results.filter((n) => types.includes(n.type));
    }
    if (options.status) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        results = results.filter((n) => statuses.includes(n.status));
    }
    if (options.relatedTo) {
        const target = options.relatedTo;
        results = results.filter((n) => n.relationships.some((r) => r.target === target));
    }
    if (options.relationshipType) {
        const relType = options.relationshipType;
        results = results.filter((n) => n.relationships.some((r) => r.type === relType));
    }
    if (options.search) {
        const lower = options.search.toLowerCase();
        results = results.filter((n) => n.title.toLowerCase().includes(lower) ||
            n.id.toLowerCase().includes(lower));
    }
    if (options.limit) {
        results = results.slice(0, options.limit);
    }
    return results;
}
/**
 * Get aggregate statistics for the graph.
 */
export function getGraphStats(nodes) {
    const byType = {};
    const byStatus = {};
    let totalRelationships = 0;
    for (const node of nodes) {
        byType[node.type] = (byType[node.type] ?? 0) + 1;
        byStatus[node.status] = (byStatus[node.status] ?? 0) + 1;
        totalRelationships += node.relationships.length;
    }
    return {
        totalNodes: nodes.length,
        totalRelationships,
        byType,
        byStatus,
    };
}
//# sourceMappingURL=graph.js.map