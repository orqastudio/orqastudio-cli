/**
 * ID management command — generate, check, and migrate artifact IDs.
 *
 * orqa id generate <type>        Generate a new hex ID
 * orqa id check                  Scan graph for duplicate IDs
 * orqa id migrate <old> <new>    Rename an ID across the entire graph
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
const USAGE = `
Usage: orqa id <subcommand> [options]

Subcommands:
  generate <TYPE>       Generate a new hex ID (e.g. orqa id generate TASK)
  check                 Scan the graph for duplicate IDs
  migrate <old> <new>   Rename an artifact ID across the entire graph (updates all references)

Options:
  --fix                 With 'check': prompt to regenerate duplicate IDs
  -y                    With 'check --fix': auto-regenerate without prompting (for CI/tooling)
  --help, -h            Show this help message
`.trim();
/**
 * Generate an 8-char hex ID with the given prefix.
 */
function generateId(prefix) {
    const hex = randomBytes(4).toString("hex");
    return `${prefix.toUpperCase()}-${hex}`;
}
/**
 * Parse frontmatter from content. Returns [yaml, body] or null.
 */
function parseFrontmatter(content) {
    if (!content.startsWith("---\n"))
        return null;
    const fmEnd = content.indexOf("\n---", 4);
    if (fmEnd === -1)
        return null;
    try {
        const fm = parseYaml(content.substring(4, fmEnd));
        if (!fm || typeof fm !== "object")
            return null;
        return [fm, content.substring(fmEnd + 4)];
    }
    catch {
        return null;
    }
}
/**
 * Write frontmatter back to a file using proper YAML serialisation.
 */
function writeFrontmatter(filePath, fm, body) {
    const yamlText = stringifyYaml(fm, { lineWidth: 0 }).trimEnd();
    writeFileSync(filePath, `---\n${yamlText}\n---${body}`);
}
/**
 * Walk all markdown files in scan directories.
 */
function walkFiles(dir, results = []) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return results;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "target")
            continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory())
            walkFiles(full, results);
        else if (entry.name.endsWith(".md"))
            results.push(full);
    }
    return results;
}
/**
 * Scan for duplicate IDs in the graph.
 */
function checkDuplicates(projectRoot, autoFix) {
    // Build ID → paths map by scanning files directly
    const idToFiles = new Map();
    const scanDirs = [
        join(projectRoot, ".orqa"),
        join(projectRoot, "app", ".orqa"),
        join(projectRoot, "plugins"),
        join(projectRoot, "connectors"),
    ];
    const allFiles = scanDirs.flatMap((d) => walkFiles(d));
    for (const file of allFiles) {
        const content = readFileSync(file, "utf-8");
        const parsed = parseFrontmatter(content);
        if (!parsed)
            continue;
        const [fm] = parsed;
        const id = typeof fm.id === "string" ? fm.id.trim() : "";
        if (!id)
            continue;
        const list = idToFiles.get(id) ?? [];
        list.push(file);
        idToFiles.set(id, list);
    }
    // Find duplicates
    const duplicates = [...idToFiles.entries()].filter(([, files]) => files.length > 1);
    if (duplicates.length === 0) {
        console.log("No duplicate IDs found.");
        return;
    }
    console.log(`Found ${duplicates.length} duplicate ID(s):\n`);
    let fixed = 0;
    for (const [id, files] of duplicates) {
        console.log(`  ${id} (${files.length} files):`);
        for (const file of files) {
            const rel = file.replace(projectRoot + "/", "").replace(projectRoot + "\\", "");
            console.log(`    - ${rel}`);
        }
        if (autoFix) {
            // Keep the first file's ID, regenerate for the rest
            const prefix = id.split("-")[0];
            for (let i = 1; i < files.length; i++) {
                const file = files[i];
                const content = readFileSync(file, "utf-8");
                const parsed = parseFrontmatter(content);
                if (!parsed)
                    continue;
                const [fm, body] = parsed;
                const newId = generateId(prefix);
                const oldId = fm.id;
                fm.id = newId;
                writeFrontmatter(file, fm, body);
                // Update all references to the old ID in all files
                const refsUpdated = updateReferences(allFiles, oldId, newId);
                const rel = file.replace(projectRoot + "/", "").replace(projectRoot + "\\", "");
                console.log(`    FIXED: ${rel} → ${newId} (${refsUpdated} references updated)`);
                fixed++;
            }
        }
        console.log();
    }
    if (autoFix && fixed > 0) {
        console.log(`Regenerated ${fixed} duplicate ID(s).`);
    }
    else if (!autoFix && duplicates.length > 0) {
        console.log("Run with --fix to auto-regenerate duplicate IDs.");
        process.exit(1);
    }
}
/**
 * Migrate a single ID across the entire graph.
 * Updates the artifact's own frontmatter and all relationship references.
 */
function migrateId(projectRoot, oldId, newId) {
    const scanDirs = [
        join(projectRoot, ".orqa"),
        join(projectRoot, "app", ".orqa"),
        join(projectRoot, "plugins"),
        join(projectRoot, "connectors"),
    ];
    const allFiles = scanDirs.flatMap((d) => walkFiles(d));
    // Find the source artifact
    let sourceFile = null;
    for (const file of allFiles) {
        const content = readFileSync(file, "utf-8");
        const parsed = parseFrontmatter(content);
        if (!parsed)
            continue;
        const [fm] = parsed;
        if (fm.id === oldId) {
            sourceFile = file;
            break;
        }
    }
    if (!sourceFile) {
        console.error(`Artifact with ID "${oldId}" not found.`);
        process.exit(1);
    }
    // Update the source artifact's ID
    const content = readFileSync(sourceFile, "utf-8");
    const parsed = parseFrontmatter(content);
    if (!parsed) {
        console.error(`Failed to parse frontmatter in ${sourceFile}`);
        process.exit(1);
    }
    const [fm, body] = parsed;
    fm.id = newId;
    writeFrontmatter(sourceFile, fm, body);
    const rel = sourceFile.replace(projectRoot + "/", "").replace(projectRoot + "\\", "");
    console.log(`Updated: ${rel} (${oldId} → ${newId})`);
    // Update all references
    const refsUpdated = updateReferences(allFiles, oldId, newId);
    console.log(`Updated ${refsUpdated} reference(s) across the graph.`);
}
/**
 * Update all relationship target references from oldId to newId.
 * Uses YAML parser for frontmatter, preserves body content.
 */
function updateReferences(allFiles, oldId, newId) {
    let count = 0;
    for (const file of allFiles) {
        const content = readFileSync(file, "utf-8");
        // Quick check: skip files that don't contain the old ID at all
        if (!content.includes(oldId))
            continue;
        const parsed = parseFrontmatter(content);
        if (!parsed)
            continue;
        const [fm, body] = parsed;
        let modified = false;
        // Update relationship targets
        if (Array.isArray(fm.relationships)) {
            for (const rel of fm.relationships) {
                if (rel.target === oldId) {
                    rel.target = newId;
                    modified = true;
                    count++;
                }
            }
        }
        // Update body text references (outside frontmatter)
        const updatedBody = body.replaceAll(oldId, newId);
        if (updatedBody !== body) {
            modified = true;
            count++;
        }
        if (modified) {
            writeFrontmatter(file, fm, updatedBody);
        }
    }
    return count;
}
export async function runIdCommand(args) {
    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
        console.log(USAGE);
        return;
    }
    const subcommand = args[0];
    const subArgs = args.slice(1);
    switch (subcommand) {
        case "generate": {
            const typePrefix = subArgs.find((a) => !a.startsWith("--"));
            if (!typePrefix) {
                console.error("Usage: orqa id generate <TYPE>");
                console.error("Example: orqa id generate TASK");
                process.exit(1);
            }
            console.log(generateId(typePrefix));
            break;
        }
        case "check": {
            const autoFix = subArgs.includes("--fix") || subArgs.includes("-y");
            const targetPath = subArgs.find((a) => !a.startsWith("--") && a !== "-y") ?? process.cwd();
            checkDuplicates(resolve(targetPath), autoFix);
            break;
        }
        case "migrate": {
            const ids = subArgs.filter((a) => !a.startsWith("--"));
            if (ids.length < 2) {
                console.error("Usage: orqa id migrate <old-id> <new-id>");
                process.exit(1);
            }
            const [oldId, newId] = ids;
            const targetPath = resolve(subArgs.find((a) => a.startsWith("--path="))?.replace("--path=", "") ?? process.cwd());
            migrateId(targetPath, oldId, newId);
            break;
        }
        default:
            console.error(`Unknown subcommand: ${subcommand}`);
            console.log(USAGE);
            process.exit(1);
    }
}
//# sourceMappingURL=id.js.map