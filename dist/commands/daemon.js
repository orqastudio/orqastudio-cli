/**
 * Daemon command — manage the orqa-validation HTTP daemon.
 *
 * orqa daemon start [--port <port>]   Start the daemon in the background
 * orqa daemon stop                    Stop the running daemon
 * orqa daemon status                  Show daemon status and health
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getRoot } from "../lib/root.js";
const DEFAULT_PORT = 3002;
const USAGE = `
Usage: orqa daemon <subcommand> [options]

Manage the orqa-validation HTTP daemon (keeps artifact graph in memory for
low-latency calls from hooks, LSP, MCP, and CLI).

Subcommands:
  start [--port <port>]   Start the daemon (default port: ${DEFAULT_PORT})
  stop                    Stop the running daemon
  status                  Show daemon status and /health response

Options:
  --port <port>    Port to listen on (start only, default: ${DEFAULT_PORT})
  --help, -h       Show this help message
`.trim();
export async function runDaemonCommand(args) {
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
        console.log(USAGE);
        return;
    }
    const subcommand = args[0];
    switch (subcommand) {
        case "start":
            await daemonStart(args.slice(1));
            break;
        case "stop":
            daemonStop();
            break;
        case "status":
            await daemonStatus();
            break;
        default:
            console.error(`Unknown daemon subcommand: ${subcommand}`);
            console.error("Available: start, stop, status");
            process.exit(1);
    }
}
// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------
async function daemonStart(args) {
    const projectRoot = getRoot();
    const port = parsePort(args) ?? DEFAULT_PORT;
    const pidPath = getPidPath(projectRoot);
    // Check if already running.
    const existing = readPid(pidPath);
    if (existing !== null && processIsAlive(existing)) {
        const health = await fetchHealth(port);
        if (health !== null) {
            console.error(`Daemon already running (PID ${existing}, port ${port}).`);
            process.exit(1);
        }
        // PID file exists but /health failed — stale, let the binary clean it up.
    }
    const binary = findBinary(projectRoot);
    if (binary === null) {
        console.error("orqa-validation binary not found. Build it with:\n" +
            "  cargo build --manifest-path libs/validation/Cargo.toml");
        process.exit(1);
    }
    ensureTmpDir(projectRoot);
    // Spawn detached so the daemon survives the CLI process exit.
    const child = spawn(binary, ["daemon", projectRoot, "--port", String(port)], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
    });
    child.unref();
    // Wait up to 3 seconds for /health to respond.
    const startedAt = Date.now();
    let health = null;
    while (Date.now() - startedAt < 3000) {
        await sleep(150);
        health = await fetchHealth(port);
        if (health !== null)
            break;
    }
    if (health === null) {
        console.error(`Daemon did not start within 3 seconds. Check tmp/daemon.pid and stderr.`);
        process.exit(1);
    }
    console.log(`Daemon started on port ${port} ` +
        `(${health["artifacts"] ?? "?"} artifacts, ${health["rules"] ?? "?"} rules)`);
}
// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------
function daemonStop() {
    const projectRoot = getRoot();
    const pidPath = getPidPath(projectRoot);
    const pid = readPid(pidPath);
    if (pid === null) {
        console.error("No daemon PID file found. Is the daemon running?");
        process.exit(1);
    }
    if (!processIsAlive(pid)) {
        console.error(`Daemon PID ${pid} is not running (stale PID file).`);
        process.exit(1);
    }
    try {
        process.kill(pid, "SIGTERM");
        console.log(`Sent SIGTERM to daemon (PID ${pid}).`);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Failed to send SIGTERM: ${msg}`);
        process.exit(1);
    }
}
// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
async function daemonStatus() {
    const projectRoot = getRoot();
    const pidPath = getPidPath(projectRoot);
    const pid = readPid(pidPath);
    const port = DEFAULT_PORT;
    if (pid === null) {
        console.log("Daemon: not running (no PID file)");
        return;
    }
    const alive = processIsAlive(pid);
    if (!alive) {
        console.log(`Daemon: not running (PID ${pid} is dead, stale PID file)`);
        return;
    }
    const health = await fetchHealth(port);
    if (health === null) {
        console.log(`Daemon: PID ${pid} is alive but /health on port ${port} did not respond`);
        return;
    }
    console.log(`Daemon: running (PID ${pid}, port ${port})\n` +
        `  artifacts : ${health["artifacts"] ?? "?"}\n` +
        `  rules     : ${health["rules"] ?? "?"}`);
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Find the Rust validation binary. Mirrors the search in enforce.ts.
 */
function findBinary(projectRoot) {
    const candidates = [
        join(projectRoot, "libs", "validation", "target", "release", "orqa-validation"),
        join(projectRoot, "libs", "validation", "target", "release", "orqa-validation.exe"),
        join(projectRoot, "libs", "validation", "target", "debug", "orqa-validation"),
        join(projectRoot, "libs", "validation", "target", "debug", "orqa-validation.exe"),
        join(projectRoot, "target", "release", "orqa-validation"),
        join(projectRoot, "target", "release", "orqa-validation.exe"),
        join(projectRoot, "target", "debug", "orqa-validation"),
        join(projectRoot, "target", "debug", "orqa-validation.exe"),
    ];
    for (const c of candidates) {
        if (existsSync(c))
            return c;
    }
    return null;
}
function getPidPath(projectRoot) {
    return join(projectRoot, "tmp", "daemon.pid");
}
function ensureTmpDir(projectRoot) {
    const tmpDir = join(projectRoot, "tmp");
    if (!existsSync(tmpDir)) {
        mkdirSync(tmpDir, { recursive: true });
    }
}
function readPid(pidPath) {
    if (!existsSync(pidPath))
        return null;
    const raw = readFileSync(pidPath, "utf-8").trim();
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
}
function processIsAlive(pid) {
    try {
        // Signal 0 checks existence without sending a real signal.
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
async function fetchHealth(port) {
    try {
        // Use a short timeout — this is a liveness check.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 500);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/health`, {
                signal: controller.signal,
            });
            if (!response.ok)
                return null;
            return (await response.json());
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch {
        return null;
    }
}
function parsePort(args) {
    const idx = args.indexOf("--port");
    if (idx === -1 || idx + 1 >= args.length)
        return null;
    const n = parseInt(args[idx + 1], 10);
    return Number.isNaN(n) ? null : n;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=daemon.js.map