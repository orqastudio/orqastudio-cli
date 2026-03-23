/**
 * Dev environment commands — delegates to the debug controller.
 *
 * orqa dev                Start the full dev environment (Vite + Tauri)
 * orqa dev stop           Stop gracefully
 * orqa dev kill           Force-kill all processes
 * orqa dev restart        Restart Vite + Tauri (not the controller)
 * orqa dev restart-tauri  Restart Tauri only
 * orqa dev restart-vite   Restart Vite only
 * orqa dev status         Show process status
 * orqa dev icons          Generate brand icons from SVG sources
 * orqa dev icons --deploy Generate + deploy to app targets
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getRoot } from "../lib/root.js";
import { runDaemonCommand } from "./daemon.js";
const USAGE = `
Usage: orqa dev [subcommand]

Subcommands:
  (none)            Start the full dev environment (Vite + Tauri)
  stop              Stop gracefully
  kill              Force-kill all processes
  restart           Restart Vite + Tauri (not the controller)
  restart-tauri     Restart Tauri only
  restart-vite      Restart Vite only
  status            Show process status
  icons [--deploy]  Generate brand icons from SVG sources
`.trim();
export async function runDevCommand(args) {
    if (args[0] === "--help" || args[0] === "-h") {
        console.log(USAGE);
        return;
    }
    const root = getRoot();
    const sub = args[0] ?? "dev";
    // Icons command — runs brand icon generator
    if (sub === "icons") {
        const brandScript = path.join(root, "libs/brand/scripts/generate-icons.mjs");
        if (!fs.existsSync(brandScript)) {
            console.error("Brand icon script not found. Are you in the dev repo root?");
            process.exit(1);
        }
        const iconArgs = args.slice(1).join(" ");
        try {
            execSync(`node "${brandScript}" ${iconArgs}`, {
                cwd: path.join(root, "libs/brand"),
                stdio: "inherit",
            });
        }
        catch {
            process.exit(1);
        }
        return;
    }
    // All other commands delegate to the dev controller
    const appDir = path.join(root, "app");
    const devScript = path.join(root, "tools/debug/dev.mjs");
    if (!fs.existsSync(devScript)) {
        console.error("Dev script not found. Are you in the dev repo root?");
        process.exit(1);
    }
    // Start the validation daemon alongside the dev environment.
    if (sub === "dev") {
        await runDaemonCommand(["start"]).catch(() => {
            // Daemon may already be running or binary not built — non-fatal.
        });
    }
    try {
        execSync(`node ${devScript} ${sub}`, { cwd: appDir, stdio: "inherit" });
    }
    catch {
        // Dev server exits with non-zero on stop/kill — expected
    }
}
//# sourceMappingURL=dev.js.map