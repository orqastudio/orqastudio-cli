/**
 * Install commands — dev environment bootstrapping.
 *
 * orqa install              Full setup (prereqs + submodules + deps + link + verify)
 * orqa install prereqs      Check/install prerequisites (git, node, rust, cargo, npm)
 * orqa install submodules   Init and update git submodules
 * orqa install deps         Install package dependencies (npm install + cargo fetch)
 * orqa install link         Build libs and npm link into app
 * orqa install verify       Run all verification checks
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
const USAGE = `
Usage: orqa install [subcommand]

Run with no subcommand for full setup. Or run individual steps:

Subcommands:
  prereqs      Check prerequisites (git, node 22+, npm, rust, cargo)
  submodules   Init and update git submodules
  deps         Install npm and cargo dependencies
  link         Build all libs and npm link into app

Running 'orqa install' with no subcommand runs all steps then 'orqa verify'.
Run 'orqa verify' separately to check integrity, version, license, and readme.
`.trim();
export async function runInstallCommand(args) {
    const subcommand = args[0];
    if (subcommand === "--help" || subcommand === "-h") {
        console.log(USAGE);
        return;
    }
    const root = process.cwd();
    switch (subcommand) {
        case "prereqs":
            cmdPrereqs();
            break;
        case "submodules":
            cmdSubmodules(root);
            break;
        case "deps":
            cmdDeps(root);
            break;
        case "link":
            cmdLink(root);
            break;
        case undefined:
            // Full install — run all steps, then hand off to orqa verify
            console.log("=== OrqaStudio Full Install ===\n");
            cmdPrereqs();
            console.log();
            cmdSubmodules(root);
            console.log();
            cmdDeps(root);
            console.log();
            cmdLink(root);
            console.log();
            console.log("Running verification...");
            run("orqa verify", root);
            console.log("\n=== Install complete. Run 'make dev' to start developing. ===");
            break;
        default:
            console.error(`Unknown subcommand: ${subcommand}`);
            console.error(USAGE);
            process.exit(1);
    }
}
// ── Helpers ─────────────────────────────────────────────────────────────────
function run(cmd, cwd) {
    execSync(cmd, { cwd: cwd ?? process.cwd(), stdio: "inherit" });
}
function runQuiet(cmd) {
    try {
        return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    }
    catch {
        return null;
    }
}
function hasCommand(cmd) {
    return runQuiet(`which ${cmd}`) !== null || runQuiet(`where ${cmd}`) !== null;
}
const PREREQS = [
    {
        name: "git",
        check: () => runQuiet("git --version")?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null,
        installHint: "https://git-scm.com/",
    },
    {
        name: "node",
        check: () => runQuiet("node --version")?.replace("v", "") ?? null,
        minMajor: 22,
        installHint: "https://nodejs.org/ or fnm: https://github.com/Schniz/fnm",
    },
    {
        name: "npm",
        check: () => runQuiet("npm --version"),
        installHint: "Ships with Node.js",
    },
    {
        name: "rustc",
        check: () => runQuiet("rustc --version")?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null,
        installHint: "https://rustup.rs/",
    },
    {
        name: "cargo",
        check: () => runQuiet("cargo --version")?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null,
        installHint: "Ships with rustup",
    },
];
function cmdPrereqs() {
    console.log("Checking prerequisites...");
    let allOk = true;
    for (const p of PREREQS) {
        const version = p.check();
        if (!version) {
            console.error(`  ✗ ${p.name} — not found. Install: ${p.installHint}`);
            allOk = false;
            continue;
        }
        if (p.minMajor) {
            const major = parseInt(version.split(".")[0], 10);
            if (major < p.minMajor) {
                console.error(`  ✗ ${p.name} ${version} — need ${p.minMajor}+. Update: ${p.installHint}`);
                allOk = false;
                continue;
            }
        }
        console.log(`  ✓ ${p.name} ${version}`);
    }
    if (!allOk) {
        console.error("\nPrerequisites missing. Install them and re-run.");
        process.exit(1);
    }
}
// ── Submodules ──────────────────────────────────────────────────────────────
function cmdSubmodules(root) {
    console.log("Initialising submodules...");
    run("git submodule update --init --recursive", root);
    console.log("  ✓ all submodules initialised");
}
// ── Deps ────────────────────────────────────────────────────────────────────
/** Build order: dir, @orqastudio/* deps, build command. */
const LIB_ORDER = [
    { dir: "libs/types", deps: [], build: "npx tsc" },
    { dir: "libs/cli", deps: ["@orqastudio/types"], build: "npx tsc" },
    { dir: "connectors/claude-code", deps: ["@orqastudio/types", "@orqastudio/cli"], build: "npx tsc" },
    { dir: "libs/sdk", deps: ["@orqastudio/types"], build: "npx tsc" },
    { dir: "libs/svelte-components", deps: ["@orqastudio/types"], build: "npm run build" },
    { dir: "libs/graph-visualiser", deps: ["@orqastudio/types"], build: "npm run build" },
];
function cmdDeps(root) {
    console.log("Installing dependencies...");
    // npm install in each lib
    for (const lib of LIB_ORDER) {
        const dir = path.join(root, lib.dir);
        if (!fs.existsSync(dir)) {
            console.log(`  - ${lib.dir} (skipped — not found)`);
            continue;
        }
        console.log(`  - ${lib.dir}`);
        run("npm install", dir);
    }
    // npm install in app/ui
    const appUi = path.join(root, "app/ui");
    if (fs.existsSync(appUi)) {
        console.log("  - app/ui");
        run("npm install", appUi);
    }
    // cargo fetch for Rust deps
    const cargoDir = path.join(root, "app/backend/src-tauri");
    if (fs.existsSync(cargoDir)) {
        console.log("  - app/backend (cargo fetch)");
        run("cargo fetch --quiet", cargoDir);
    }
    console.log("  ✓ all dependencies installed");
}
// ── Link ────────────────────────────────────────────────────────────────────
function cmdLink(root) {
    console.log("Building and linking libraries...");
    for (const lib of LIB_ORDER) {
        const dir = path.join(root, lib.dir);
        if (!fs.existsSync(dir))
            continue;
        console.log(`  - ${lib.dir}`);
        // Link @orqastudio/* deps
        if (lib.deps.length > 0) {
            run(`npm link ${lib.deps.join(" ")}`, dir);
        }
        // Build
        run(lib.build, dir);
        // Register as globally linkable
        run("npm link", dir);
    }
    // Link everything into app/ui
    const appUi = path.join(root, "app/ui");
    if (fs.existsSync(appUi)) {
        const allLibs = LIB_ORDER
            .map((lib) => {
            const pkgPath = path.join(root, lib.dir, "package.json");
            try {
                return JSON.parse(fs.readFileSync(pkgPath, "utf-8")).name;
            }
            catch {
                return null;
            }
        })
            .filter(Boolean);
        if (allLibs.length > 0) {
            console.log("  - app/ui (linking)");
            run(`npm link ${allLibs.join(" ")}`, appUi);
        }
        console.log("  - app/ui (svelte-kit sync)");
        run("npx svelte-kit sync", appUi);
        console.log("  - app/ui (build)");
        run("npm run build", appUi);
    }
    // Verify orqa is on PATH
    if (hasCommand("orqa")) {
        const version = runQuiet("orqa --version");
        console.log(`  ✓ orqa CLI: ${version}`);
    }
    else {
        console.error("  ✗ orqa not on PATH — try closing and reopening your terminal");
        process.exit(1);
    }
}
//# sourceMappingURL=install.js.map