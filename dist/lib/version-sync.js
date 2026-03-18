/**
 * Version sync — propagate a canonical version across all package.json,
 * orqa-plugin.json, Cargo.toml, and plugin.json files in a dev environment.
 *
 * The VERSION file at the dev repo root is the single source of truth.
 * No submodule may define its own version independently.
 */
import * as fs from "node:fs";
import * as path from "node:path";
/**
 * Validate a version string.
 * Must be semver: X.Y.Z or X.Y.Z-suffix (e.g. 0.1.0-dev, 1.0.0-rc.1)
 */
export function isValidVersion(version) {
    return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version);
}
/**
 * Read the canonical version from the VERSION file.
 */
export function readCanonicalVersion(projectRoot) {
    const versionFile = path.join(projectRoot, "VERSION");
    if (!fs.existsSync(versionFile)) {
        throw new Error("VERSION file not found. Create it with: echo '0.1.0-dev' > VERSION");
    }
    return fs.readFileSync(versionFile, "utf-8").trim();
}
/**
 * Write the canonical version to the VERSION file.
 */
export function writeCanonicalVersion(projectRoot, version) {
    if (!isValidVersion(version)) {
        throw new Error(`Invalid version format: "${version}". Expected semver: X.Y.Z or X.Y.Z-suffix (e.g. 0.1.0-dev)`);
    }
    fs.writeFileSync(path.join(projectRoot, "VERSION"), version + "\n", "utf-8");
}
/**
 * Sync a version across all package.json, orqa-plugin.json, Cargo.toml,
 * and .claude-plugin/plugin.json files found in the dev environment.
 */
export function syncVersions(projectRoot, version) {
    if (!isValidVersion(version)) {
        throw new Error(`Invalid version format: "${version}"`);
    }
    const updated = [];
    const skipped = [];
    // Libraries
    const libsDir = path.join(projectRoot, "libs");
    if (fs.existsSync(libsDir)) {
        for (const entry of fs.readdirSync(libsDir, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const pkg = path.join(libsDir, entry.name, "package.json");
            if (updateJsonVersion(pkg, version))
                updated.push(pkg);
            else
                skipped.push(pkg);
            if (updateOrqaDeps(pkg, version))
                updated.push(pkg + " (deps)");
        }
    }
    // Connectors
    const connectorsDir = path.join(projectRoot, "connectors");
    if (fs.existsSync(connectorsDir)) {
        for (const entry of fs.readdirSync(connectorsDir, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const dir = path.join(connectorsDir, entry.name);
            if (updateJsonVersion(path.join(dir, "package.json"), version))
                updated.push(path.join(dir, "package.json"));
            updateOrqaDeps(path.join(dir, "package.json"), version);
        }
    }
    // App
    const appUiPkg = path.join(projectRoot, "app", "ui", "package.json");
    if (updateJsonVersion(appUiPkg, version))
        updated.push(appUiPkg);
    if (updateOrqaDeps(appUiPkg, version))
        updated.push(appUiPkg + " (deps)");
    const cargoToml = path.join(projectRoot, "app", "backend", "src-tauri", "Cargo.toml");
    if (updateCargoVersion(cargoToml, version))
        updated.push(cargoToml);
    // Plugins
    const pluginsDir = path.join(projectRoot, "plugins");
    if (fs.existsSync(pluginsDir)) {
        for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const dir = path.join(pluginsDir, entry.name);
            if (updateJsonVersion(path.join(dir, "orqa-plugin.json"), version))
                updated.push(path.join(dir, "orqa-plugin.json"));
            if (updateJsonVersion(path.join(dir, "package.json"), version))
                updated.push(path.join(dir, "package.json"));
            if (updateJsonVersion(path.join(dir, ".claude-plugin", "plugin.json"), version))
                updated.push(path.join(dir, ".claude-plugin/plugin.json"));
            if (updateOrqaDeps(path.join(dir, "package.json"), version))
                updated.push(path.join(dir, "package.json") + " (deps)");
        }
    }
    return { version, updated, skipped };
}
/**
 * Check if all packages in the dev environment have the same version.
 * Checks package versions, @orqastudio/* dependency versions, and Cargo.toml.
 */
export function checkVersionDrift(projectRoot) {
    const canonical = readCanonicalVersion(projectRoot);
    const drift = [];
    const checkJson = (filePath) => {
        if (!fs.existsSync(filePath))
            return;
        try {
            const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            // Check package version
            if (data.version && data.version !== canonical) {
                drift.push({ file: filePath, found: data.version, expected: canonical, type: "package" });
            }
            // Check @orqastudio/* dependency versions
            for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
                if (!data[section])
                    continue;
                for (const [key, val] of Object.entries(data[section])) {
                    if (key.startsWith("@orqastudio/") && val !== canonical) {
                        drift.push({ file: `${filePath} → ${key}`, found: val, expected: canonical, type: "dependency" });
                    }
                }
            }
        }
        catch { /* skip */ }
    };
    // Scan all known locations
    for (const dir of ["libs", "plugins", "connectors"]) {
        const base = path.join(projectRoot, dir);
        if (!fs.existsSync(base))
            continue;
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            checkJson(path.join(base, entry.name, "package.json"));
            checkJson(path.join(base, entry.name, "orqa-plugin.json"));
        }
    }
    checkJson(path.join(projectRoot, "app", "ui", "package.json"));
    // Check Cargo.toml
    const cargoToml = path.join(projectRoot, "app", "backend", "src-tauri", "Cargo.toml");
    if (fs.existsSync(cargoToml)) {
        try {
            const content = fs.readFileSync(cargoToml, "utf-8");
            const match = content.match(/^version = "(.+)"/m);
            if (match && match[1] !== canonical) {
                drift.push({ file: cargoToml, found: match[1], expected: canonical, type: "cargo" });
            }
        }
        catch { /* skip */ }
    }
    return drift;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function updateJsonVersion(filePath, version) {
    if (!fs.existsSync(filePath))
        return false;
    try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (data.version === undefined || data.version === version)
            return false;
        data.version = version;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
        return true;
    }
    catch {
        return false;
    }
}
function updateOrqaDeps(filePath, version) {
    if (!fs.existsSync(filePath))
        return false;
    try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        let changed = false;
        for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
            if (!data[section])
                continue;
            for (const [key, val] of Object.entries(data[section])) {
                if (key.startsWith("@orqastudio/") && val !== version) {
                    data[section][key] = version;
                    changed = true;
                }
            }
        }
        if (changed) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
        }
        return changed;
    }
    catch {
        return false;
    }
}
function updateCargoVersion(filePath, version) {
    if (!fs.existsSync(filePath))
        return false;
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const updated = content.replace(/^version = ".*"/m, `version = "${version}"`);
        if (updated === content)
            return false;
        fs.writeFileSync(filePath, updated, "utf-8");
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=version-sync.js.map