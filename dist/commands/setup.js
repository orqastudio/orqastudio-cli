/**
 * Setup commands — dev environment bootstrapping.
 *
 * orqa setup link  — Install deps, build libs, and npm link everything
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
const USAGE = `
Usage: orqa setup <subcommand>

Subcommands:
  link    Install deps, build all libs, and npm link into the app

Options:
  --help, -h    Show this help message
`.trim();
/** Build order: each entry lists the dir, its @orqastudio deps, and the build command. */
const BUILD_ORDER = [
    { dir: "libs/types", deps: [], build: "npx tsc", link: true },
    { dir: "libs/cli", deps: ["@orqastudio/types"], build: "npx tsc", link: true },
    {
        dir: "connectors/claude-code",
        deps: ["@orqastudio/types", "@orqastudio/cli"],
        build: "npx tsc",
        link: true,
    },
    { dir: "libs/sdk", deps: ["@orqastudio/types"], build: "npx tsc", link: true },
    {
        dir: "libs/svelte-components",
        deps: ["@orqastudio/types"],
        build: "npm run build",
        link: true,
    },
    {
        dir: "libs/graph-visualiser",
        deps: ["@orqastudio/types"],
        build: "npm run build",
        link: true,
    },
];
export async function runSetupCommand(args) {
    const subcommand = args[0];
    if (!subcommand || subcommand === "--help" || subcommand === "-h") {
        console.log(USAGE);
        return;
    }
    switch (subcommand) {
        case "link":
            await cmdLink();
            break;
        default:
            console.error(`Unknown subcommand: ${subcommand}`);
            console.error(USAGE);
            process.exit(1);
    }
}
function run(cmd, cwd) {
    execSync(cmd, { cwd, stdio: "inherit" });
}
async function cmdLink() {
    const root = process.cwd();
    console.log("=== OrqaStudio Dev Environment Setup ===");
    console.log(`Root: ${root}`);
    // Build and link each library in dependency order
    for (const entry of BUILD_ORDER) {
        const dir = path.join(root, entry.dir);
        if (!fs.existsSync(dir)) {
            console.log(`\nSkipping ${entry.dir} (not found)`);
            continue;
        }
        console.log(`\n--- ${entry.dir} ---`);
        run("npm install", dir);
        if (entry.deps.length > 0) {
            run(`npm link ${entry.deps.join(" ")}`, dir);
        }
        run(entry.build, dir);
        if (entry.link) {
            run("npm link", dir);
        }
    }
    // Link everything into the app
    const appUi = path.join(root, "app/ui");
    if (fs.existsSync(appUi)) {
        console.log("\n--- app/ui ---");
        run("npm install", appUi);
        const allLibs = BUILD_ORDER.filter((e) => e.link).map((e) => {
            const pkgPath = path.join(root, e.dir, "package.json");
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
                return pkg.name;
            }
            catch {
                return null;
            }
        }).filter(Boolean);
        if (allLibs.length > 0) {
            run(`npm link ${allLibs.join(" ")}`, appUi);
        }
        run("npx svelte-kit sync", appUi);
        console.log("\n--- app/ui build ---");
        run("npm run build", appUi);
    }
    console.log("\n=== Done. All libs linked into app. ===");
}
//# sourceMappingURL=setup.js.map