/**
 * Schema validation command — validates project.json and orqa-plugin.json
 * against their known schemas.
 *
 * orqa enforce schema [path] [--json]
 *
 * Called as a subcommand of `orqa enforce`.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
const REQUIRED_PLUGIN_CATEGORIES = ["language", "framework"];
function checkRequiredCategories(plugins) {
    const categories = new Set(plugins.map((p) => p.category).filter(Boolean));
    return REQUIRED_PLUGIN_CATEGORIES
        .filter((cat) => !categories.has(cat))
        .map((cat) => ({
        plugin: "(project)",
        severity: "warning",
        message: `No plugin provides the "${cat}" category — consider installing one`,
    }));
}
function checkPluginDependencies(plugins) {
    const installed = new Set(plugins.map((p) => p.name));
    const findings = [];
    for (const plugin of plugins) {
        for (const dep of plugin.requires) {
            if (!installed.has(dep)) {
                findings.push({
                    plugin: plugin.name,
                    severity: "error",
                    message: `Plugin "${plugin.name}" requires "${dep}" which is not installed`,
                });
            }
        }
    }
    return findings;
}
const USAGE = `
Usage: orqa enforce schema [path] [options]

Validate project.json and plugin manifests against their schemas.

Options:
  --json              Output results as JSON
  --help, -h          Show this help message
`.trim();
/** Known fields for project.json — must match the Rust ProjectSettings struct. */
const PROJECT_JSON_KNOWN_FIELDS = {
    name: "string",
    description: "string|null",
    organisation: "boolean",
    dogfood: "boolean",
    projects: "array",
    default_model: "string",
    excluded_paths: "array",
    stack: "object|null",
    governance: "object|null",
    icon: "string|null",
    show_thinking: "boolean",
    custom_system_prompt: "string|null",
    artifacts: "array",
    artifactLinks: "object",
    statuses: "array",
    delivery: "object",
    relationships: "array",
    navigation: "array",
    plugins: "object",
};
/** Known fields for plugin entries in project.json plugins block. */
const PLUGIN_CONFIG_KNOWN_FIELDS = {
    installed: "boolean",
    enabled: "boolean",
    path: "string",
    relationships: "object",
    schemaAliases: "object",
    relationshipAliases: "object",
    config: "object",
};
/** Required fields for project.json. */
const PROJECT_JSON_REQUIRED = ["name"];
/** Known fields for orqa-plugin.json provides block. */
const PLUGIN_PROVIDES_KNOWN_FIELDS = [
    "schemas", "views", "widgets", "relationships",
    "artifactTypes", "defaultNavigation", "delivery",
];
function validateProjectJson(filePath) {
    const findings = [];
    const relPath = relative(process.cwd(), filePath);
    let data;
    try {
        data = JSON.parse(readFileSync(filePath, "utf-8"));
    }
    catch (err) {
        findings.push({
            file: relPath,
            field: "(root)",
            severity: "error",
            message: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
        return findings;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        findings.push({
            file: relPath,
            field: "(root)",
            severity: "error",
            message: "project.json must be a JSON object",
        });
        return findings;
    }
    // Check required fields
    for (const field of PROJECT_JSON_REQUIRED) {
        if (!(field in data)) {
            findings.push({
                file: relPath,
                field,
                severity: "error",
                message: `Required field "${field}" is missing`,
            });
        }
    }
    // Check for unknown fields
    for (const key of Object.keys(data)) {
        if (!(key in PROJECT_JSON_KNOWN_FIELDS)) {
            findings.push({
                file: relPath,
                field: key,
                severity: "error",
                message: `Unknown field "${key}" — not in ProjectSettings schema`,
            });
        }
    }
    // Basic type checks
    for (const [key, value] of Object.entries(data)) {
        const expectedType = PROJECT_JSON_KNOWN_FIELDS[key];
        if (!expectedType)
            continue;
        const types = expectedType.split("|");
        const actualType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
        if (!types.includes(actualType)) {
            findings.push({
                file: relPath,
                field: key,
                severity: "error",
                message: `Field "${key}" has type "${actualType}", expected ${expectedType}`,
            });
        }
    }
    // Validate plugin entries
    const plugins = data["plugins"];
    if (plugins && typeof plugins === "object" && !Array.isArray(plugins)) {
        for (const [pluginName, pluginConfig] of Object.entries(plugins)) {
            if (typeof pluginConfig !== "object" || pluginConfig === null || Array.isArray(pluginConfig)) {
                findings.push({
                    file: relPath,
                    field: `plugins.${pluginName}`,
                    severity: "error",
                    message: `Plugin config for "${pluginName}" must be an object`,
                });
                continue;
            }
            const pc = pluginConfig;
            // Check for unknown fields in plugin config
            for (const field of Object.keys(pc)) {
                if (!(field in PLUGIN_CONFIG_KNOWN_FIELDS)) {
                    findings.push({
                        file: relPath,
                        field: `plugins.${pluginName}.${field}`,
                        severity: "error",
                        message: `Unknown plugin config field "${field}"`,
                    });
                }
            }
            // Check required fields
            for (const required of ["installed", "enabled", "path"]) {
                if (!(required in pc)) {
                    findings.push({
                        file: relPath,
                        field: `plugins.${pluginName}`,
                        severity: "error",
                        message: `Plugin "${pluginName}" missing required field "${required}"`,
                    });
                }
            }
        }
    }
    return findings;
}
function validatePluginManifest(filePath) {
    const findings = [];
    const relPath = relative(process.cwd(), filePath);
    let data;
    try {
        data = JSON.parse(readFileSync(filePath, "utf-8"));
    }
    catch (err) {
        findings.push({
            file: relPath,
            field: "(root)",
            severity: "error",
            message: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
        return findings;
    }
    // Check required fields
    for (const field of ["name", "version", "provides"]) {
        if (!(field in data)) {
            findings.push({
                file: relPath,
                field,
                severity: "error",
                message: `Required field "${field}" is missing`,
            });
        }
    }
    // Validate name format
    if (typeof data["name"] === "string") {
        if (!/^@?[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(data["name"])) {
            findings.push({
                file: relPath,
                field: "name",
                severity: "error",
                message: `Plugin name "${data["name"]}" must be lowercase kebab-case (optionally scoped)`,
            });
        }
    }
    // Validate version format
    if (typeof data["version"] === "string") {
        if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(data["version"])) {
            findings.push({
                file: relPath,
                field: "version",
                severity: "error",
                message: `Version "${data["version"]}" must be valid semver`,
            });
        }
    }
    return findings;
}
function discoverAndValidate(projectRoot) {
    const findings = [];
    // Validate project.json
    const projectJsonPath = join(projectRoot, ".orqa", "project.json");
    if (existsSync(projectJsonPath)) {
        findings.push(...validateProjectJson(projectJsonPath));
    }
    else {
        findings.push({
            file: ".orqa/project.json",
            field: "(root)",
            severity: "error",
            message: "project.json not found",
        });
    }
    // Validate all plugin manifests
    for (const container of ["plugins", "connectors"]) {
        const containerDir = join(projectRoot, container);
        let entries;
        try {
            entries = readdirSync(containerDir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules")
                continue;
            const manifestPath = join(containerDir, entry.name, "orqa-plugin.json");
            if (existsSync(manifestPath)) {
                findings.push(...validatePluginManifest(manifestPath));
            }
        }
    }
    // Plugin integrity checks: required categories + dependency resolution
    const loadedPlugins = [];
    for (const container of ["plugins", "connectors"]) {
        const containerDir = join(projectRoot, container);
        let entries;
        try {
            entries = readdirSync(containerDir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules")
                continue;
            const manifestPath = join(containerDir, entry.name, "orqa-plugin.json");
            if (!existsSync(manifestPath))
                continue;
            try {
                const data = JSON.parse(readFileSync(manifestPath, "utf-8"));
                if (typeof data["name"] === "string") {
                    loadedPlugins.push({
                        name: data["name"],
                        path: relative(process.cwd(), manifestPath),
                        category: typeof data["category"] === "string" ? data["category"] : null,
                        requires: Array.isArray(data["requires"])
                            ? data["requires"].filter((r) => typeof r === "string")
                            : [],
                    });
                }
            }
            catch {
                continue;
            }
        }
    }
    for (const finding of checkRequiredCategories(loadedPlugins)) {
        findings.push({
            file: "(project)",
            field: "category",
            severity: finding.severity,
            message: finding.message,
        });
    }
    for (const finding of checkPluginDependencies(loadedPlugins)) {
        findings.push({
            file: "(project)",
            field: `plugins.${finding.plugin}.requires`,
            severity: finding.severity,
            message: finding.message,
        });
    }
    // Validate child project project.json files (organisation mode)
    const projectJsonContent = existsSync(projectJsonPath)
        ? JSON.parse(readFileSync(projectJsonPath, "utf-8"))
        : null;
    if (projectJsonContent?.projects && Array.isArray(projectJsonContent.projects)) {
        for (const child of projectJsonContent.projects) {
            const childProjectJson = join(projectRoot, child.path, ".orqa", "project.json");
            if (existsSync(childProjectJson)) {
                findings.push(...validateProjectJson(childProjectJson));
            }
        }
    }
    return findings;
}
export async function runValidateSchemaCommand(args) {
    if (args.includes("--help") || args.includes("-h")) {
        console.log(USAGE);
        return;
    }
    const jsonOutput = args.includes("--json");
    const targetPath = args.find((a) => !a.startsWith("--")) ?? process.cwd();
    const findings = discoverAndValidate(targetPath);
    const errors = findings.filter((f) => f.severity === "error").length;
    const warnings = findings.filter((f) => f.severity === "warning").length;
    if (jsonOutput) {
        console.log(JSON.stringify({ findings, errors, warnings }, null, 2));
        return;
    }
    if (findings.length === 0) {
        console.log("Schema validation passed. 0 errors, 0 warnings.");
        return;
    }
    // Group by file
    const byFile = new Map();
    for (const f of findings) {
        const list = byFile.get(f.file) ?? [];
        list.push(f);
        byFile.set(f.file, list);
    }
    for (const [file, fileFindings] of byFile) {
        console.log(`\n${file}:`);
        for (const f of fileFindings) {
            const icon = f.severity === "error" ? "E" : "W";
            console.log(`  [${icon}] ${f.field}: ${f.message}`);
        }
    }
    console.log(`\n${errors} error(s), ${warnings} warning(s).`);
    if (errors > 0)
        process.exit(1);
}
//# sourceMappingURL=validate-schema.js.map