/**
 * Code quality checks.
 *
 * orqa check              Run all code checks
 * orqa check rust         Rust: clippy + fmt
 * orqa check app          Svelte-check on app frontend
 * orqa check types        TypeScript check on types lib
 * orqa check sdk          TypeScript check on SDK
 * orqa check cli          TypeScript check on CLI + connector
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
const USAGE = `
Usage: orqa check [subcommand]

Run all code quality checks, or target a specific area:

Subcommands:
  rust      Rust clippy lint + fmt check
  app       Svelte-check on app frontend
  types     TypeScript check on types lib
  sdk       TypeScript check on SDK
  cli       TypeScript check on CLI + connector

Running 'orqa check' with no subcommand runs all checks.
`.trim();
function getSteps(root) {
    return [
        {
            name: "Rust (clippy + fmt)",
            key: "rust",
            dir: path.join(root, "app/backend/src-tauri"),
            commands: ["cargo clippy -- -D warnings", "cargo fmt --check"],
        },
        {
            name: "App (svelte-check)",
            key: "app",
            dir: path.join(root, "app/ui"),
            commands: ["npx svelte-check --threshold warning"],
        },
        {
            name: "Types (tsc)",
            key: "types",
            dir: path.join(root, "libs/types"),
            commands: ["npx tsc --noEmit"],
        },
        {
            name: "SDK (tsc)",
            key: "sdk",
            dir: path.join(root, "libs/sdk"),
            commands: ["npx tsc --noEmit"],
        },
        {
            name: "CLI + connector (tsc)",
            key: "cli",
            dir: root,
            commands: [
                "cd libs/cli && npx tsc --noEmit",
                "cd connectors/claude-code && npx tsc --noEmit",
            ],
        },
    ];
}
export async function runCheckCommand(args) {
    if (args[0] === "--help" || args[0] === "-h") {
        console.log(USAGE);
        return;
    }
    const root = process.cwd();
    const target = args[0];
    const steps = getSteps(root);
    const toRun = target
        ? steps.filter((s) => s.key === target)
        : steps;
    if (target && toRun.length === 0) {
        console.error(`Unknown target: ${target}`);
        console.error(USAGE);
        process.exit(1);
    }
    let failed = false;
    for (const step of toRun) {
        if (!fs.existsSync(step.dir)) {
            console.log(`  - ${step.name} (skipped — not found)`);
            continue;
        }
        console.log(`  ${step.name}...`);
        for (const cmd of step.commands) {
            try {
                execSync(cmd, { cwd: step.dir, stdio: "inherit" });
            }
            catch {
                failed = true;
            }
        }
    }
    if (failed) {
        process.exit(1);
    }
}
//# sourceMappingURL=check.js.map