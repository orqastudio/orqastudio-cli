/**
 * Enforcement command — the single command for all validation and enforcement.
 *
 * Replaces the old `orqa validate`. Runs the Rust validator for graph integrity
 * and schema checks, produces enforcement events, and supports response logging.
 *
 * orqa enforce [path]                   Run ALL checks on all artifacts
 * orqa enforce --mechanism json-schema  Run specific mechanism only
 * orqa enforce --rule RULE-xxx          Run all mechanisms for one rule
 * orqa enforce --file path/to/file.md   Run all mechanisms for one file
 * orqa enforce --report                 Enforcement coverage report
 * orqa enforce --fix                    Auto-fix fixable errors
 * orqa enforce --json                   JSON output
 * orqa enforce schema                   Validate project.json and plugin manifests
 * orqa enforce response --event-id X --action fixed --detail "..."
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { getRoot } from "../lib/root.js";
import { logEvent, createEvent, logResponse, readEvents, readResponses, } from "../lib/enforcement-log.js";
const USAGE = `
Usage: orqa enforce [path] [options]

Run enforcement checks (graph integrity + schema + rule enforcement).

Options:
  --mechanism <key>      Run only the specified mechanism (e.g. json-schema, lint)
  --rule <id>            Run all mechanisms for a specific rule
  --file <path>          Run all applicable mechanisms for a specific file
  --report               Show enforcement coverage report
  --fix                  Auto-fix objectively fixable errors (e.g. missing inverses)
  --full-revalidation    Re-run all rules against all artifacts (triggered on rule changes)
  --json                 Output as JSON
  --help, -h             Show this help message

Subcommands:
  schema              Validate project.json and plugin manifests against schemas
  test                Run enforcement tests defined in rules
  override            Request enforcement override (requires human approval)
  approve <code>      Approve an override request
  metrics             Show per-rule enforcement metrics
  response            Log an agent's response to an enforcement event
    --event-id <id>   Event ID to respond to (required)
    --action <action> Resolution action: fixed, deferred, overridden, false-positive (required)
    --detail <text>   Human-readable detail (required)
`.trim();
/**
 * Find the Rust validation binary. Checks common build locations.
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
        join(projectRoot, "app", "backend", "target", "release", "orqa-validation"),
        join(projectRoot, "app", "backend", "target", "release", "orqa-validation.exe"),
        join(projectRoot, "app", "backend", "target", "debug", "orqa-validation"),
        join(projectRoot, "app", "backend", "target", "debug", "orqa-validation.exe"),
    ];
    for (const c of candidates) {
        if (existsSync(c))
            return c;
    }
    return null;
}
/**
 * Run the Rust validator binary.
 */
function runRustBinary(binaryPath, targetPath, autoFix) {
    const args = [targetPath];
    if (autoFix)
        args.push("--fix");
    try {
        const output = execFileSync(binaryPath, args, {
            encoding: "utf-8",
            timeout: 60000,
            windowsHide: true,
        });
        return { exitCode: 0, output };
    }
    catch (e) {
        const err = e;
        return {
            exitCode: err.status ?? 2,
            output: err.stdout ?? err.stderr ?? String(e),
        };
    }
}
/**
 * Call the running daemon's /validate endpoint.
 * Returns the JSON response body string, or null if the daemon is not reachable.
 */
async function callDaemon(targetPath, autoFix) {
    const port = 3002;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 500);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/validate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: targetPath, fix: autoFix }),
                signal: controller.signal,
            });
            if (!response.ok)
                return null;
            return await response.text();
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch {
        return null;
    }
}
export async function runEnforceCommand(args) {
    if (args[0] === "--help" || args[0] === "-h") {
        console.log(USAGE);
        return;
    }
    // Subcommands
    if (args[0] === "response") {
        await handleResponse(args.slice(1));
        return;
    }
    if (args[0] === "schema") {
        const { runValidateSchemaCommand } = await import("./validate-schema.js");
        await runValidateSchemaCommand(args.slice(1));
        return;
    }
    if (args[0] === "test") {
        await handleTest(args.slice(1));
        return;
    }
    if (args[0] === "override") {
        await handleOverride(args.slice(1));
        return;
    }
    if (args[0] === "approve") {
        await handleApprove(args[1]);
        return;
    }
    if (args[0] === "metrics") {
        await handleMetrics(args.slice(1));
        return;
    }
    const projectRoot = getRoot();
    const mechanism = getFlag(args, "--mechanism");
    const ruleId = getFlag(args, "--rule");
    const filePath = getFlag(args, "--file");
    const report = args.includes("--report");
    const jsonOutput = args.includes("--json");
    const autoFix = args.includes("--fix");
    // Find target path: first arg that doesn't start with -- AND isn't a value for a flag
    const flagsWithValues = new Set(["--mechanism", "--rule", "--file"]);
    let targetPath = projectRoot;
    for (let i = 0; i < args.length; i++) {
        if (flagsWithValues.has(args[i])) {
            i++; // skip the flag's value
            continue;
        }
        if (!args[i].startsWith("--")) {
            targetPath = args[i];
            break;
        }
    }
    if (report) {
        await showReport(projectRoot, jsonOutput);
        return;
    }
    // Try daemon first (low-latency, keeps graph in memory).
    const daemonOutput = await callDaemon(targetPath, autoFix);
    const { exitCode, output } = daemonOutput !== null
        ? { exitCode: 0, output: daemonOutput }
        : (() => {
            // Daemon not running — spawn binary directly.
            const binary = findBinary(projectRoot);
            if (binary === null) {
                console.error("orqa-validation binary not found and daemon is not running.");
                console.error("Build with: cargo build --manifest-path libs/validation/Cargo.toml --release");
                console.error("Or start the daemon with: orqa daemon start");
                process.exit(1);
            }
            return runRustBinary(binary, targetPath, autoFix);
        })();
    let parsed;
    try {
        parsed = JSON.parse(output);
    }
    catch {
        process.stdout.write(output);
        process.exit(exitCode);
        return;
    }
    const checks = parsed.checks ?? [];
    // Apply mechanism/rule/file filters
    let filteredChecks = checks;
    if (mechanism) {
        if (mechanism === "json-schema") {
            filteredChecks = filteredChecks.filter((c) => c.category === "SchemaViolation");
        }
    }
    if (ruleId) {
        filteredChecks = filteredChecks.filter((c) => c.artifact_id === ruleId);
    }
    if (filePath) {
        filteredChecks = filteredChecks.filter((c) => c.artifact_id?.includes(filePath) ?? false);
    }
    if (jsonOutput) {
        console.log(JSON.stringify({
            checks: filteredChecks,
            health: parsed.health,
            fixes_applied: parsed.fixes_applied ?? null,
            enforcement_events: parsed.enforcement_events ?? [],
        }, null, 2));
    }
    else {
        if (filteredChecks.length === 0) {
            console.log("All enforcement checks passed. 0 errors, 0 warnings.");
        }
        else {
            const byCategory = new Map();
            for (const c of filteredChecks) {
                const list = byCategory.get(c.category) ?? [];
                list.push(c);
                byCategory.set(c.category, list);
            }
            for (const [category, findings] of byCategory) {
                console.log(`\n${category} (${findings.length}):`);
                for (const f of findings) {
                    const icon = f.severity === "Error" || f.severity === "error" ? "E" : "W";
                    console.log(`  [${icon}] ${f.artifact_id}: ${f.message}`);
                }
            }
            const errors = filteredChecks.filter((c) => c.severity === "Error" || c.severity === "error").length;
            const warnings = filteredChecks.length - errors;
            console.log(`\n${errors} error(s), ${warnings} warning(s).`);
            if (parsed.fixes_applied && parsed.fixes_applied.length > 0) {
                console.log(`Auto-fixed ${parsed.fixes_applied.length} issue(s).`);
            }
        }
    }
    if (exitCode !== 0)
        process.exit(exitCode);
}
async function handleResponse(args) {
    const eventId = getFlag(args, "--event-id");
    const action = getFlag(args, "--action");
    const detail = getFlag(args, "--detail");
    if (!eventId || !action || !detail) {
        console.error("Usage: orqa enforce response --event-id <id> --action <action> --detail <text>");
        console.error("Actions: fixed, deferred, overridden, false-positive");
        process.exit(1);
        return;
    }
    const validActions = [
        "fixed", "deferred", "overridden", "false-positive",
    ];
    if (!validActions.includes(action)) {
        console.error(`Invalid action "${action}". Must be one of: ${validActions.join(", ")}`);
        process.exit(1);
        return;
    }
    const projectRoot = getRoot();
    logResponse(projectRoot, {
        event_id: eventId,
        timestamp: new Date().toISOString(),
        action,
        detail,
    });
    console.log(`Logged response for event ${eventId}: ${action}`);
}
async function showReport(projectRoot, jsonOutput) {
    const events = readEvents(projectRoot);
    const responses = readResponses(projectRoot);
    const totalEvents = events.length;
    const fails = events.filter((e) => e.result === "fail").length;
    const warns = events.filter((e) => e.result === "warn").length;
    const passes = events.filter((e) => e.result === "pass").length;
    const responseEventIds = new Set(responses.map((r) => r.event_id));
    const resolved = events.filter((e) => responseEventIds.has(e.id)).length;
    const unresolved = fails + warns - resolved;
    const byMechanism = new Map();
    for (const e of events) {
        byMechanism.set(e.mechanism, (byMechanism.get(e.mechanism) ?? 0) + 1);
    }
    if (jsonOutput) {
        console.log(JSON.stringify({
            total_events: totalEvents,
            fails, warns, passes, resolved,
            unresolved: Math.max(0, unresolved),
            by_mechanism: Object.fromEntries(byMechanism),
        }, null, 2));
    }
    else {
        console.log("Enforcement Report");
        console.log("==================");
        console.log(`Total events:  ${totalEvents}`);
        console.log(`  Failures:    ${fails}`);
        console.log(`  Warnings:    ${warns}`);
        console.log(`  Passes:      ${passes}`);
        console.log(`  Resolved:    ${resolved}`);
        console.log(`  Unresolved:  ${Math.max(0, unresolved)}`);
        console.log("");
        console.log("By mechanism:");
        for (const [mech, count] of [...byMechanism.entries()].sort()) {
            console.log(`  ${mech}: ${count}`);
        }
    }
}
// ---------------------------------------------------------------------------
// Phase 10: Enforcement testing framework
// ---------------------------------------------------------------------------
/**
 * Run enforcement tests defined in rule frontmatter `test` entries.
 *
 * Each test entry describes a scenario that SHOULD trigger enforcement.
 * The runner creates a virtual artifact from the `input`, runs schema
 * validation, and checks the result matches `expect` (pass/fail/warn).
 */
async function handleTest(args) {
    const projectRoot = getRoot();
    const ruleFilter = getFlag(args, "--rule");
    const mechanismFilter = getFlag(args, "--mechanism");
    const jsonOutput = args.includes("--json");
    // Find all rule files and extract test entries
    const ruleDirs = [
        join(projectRoot, ".orqa", "process", "rules"),
        ...findPluginRuleDirs(projectRoot),
    ];
    let totalTests = 0;
    let passed = 0;
    let failed = 0;
    const results = [];
    for (const dir of ruleDirs) {
        if (!existsSync(dir))
            continue;
        for (const file of readdirSync(dir).filter((f) => f.startsWith("RULE-") && f.endsWith(".md"))) {
            const content = readFileSync(join(dir, file), "utf-8");
            if (!content.startsWith("---\n"))
                continue;
            const fmEnd = content.indexOf("\n---", 4);
            if (fmEnd === -1)
                continue;
            let frontmatter;
            try {
                frontmatter = parseYaml(content.slice(4, fmEnd));
            }
            catch {
                continue;
            }
            const ruleId = frontmatter.id;
            if (ruleFilter && ruleId !== ruleFilter)
                continue;
            const tests = frontmatter.test;
            if (!Array.isArray(tests))
                continue;
            for (const test of tests) {
                if (typeof test !== "object" || !test)
                    continue;
                const t = test;
                if (!t.scenario || !t.input || !t.expect)
                    continue;
                totalTests++;
                // Run schema validation against the test input
                // For now, check if required fields are present based on the expect
                const hasId = "id" in t.input;
                const hasStatus = "status" in t.input;
                const hasErrors = !hasId; // Simplified: missing id = fail
                const actual = hasErrors ? "fail" : "pass";
                const testPassed = actual === t.expect;
                if (testPassed)
                    passed++;
                else
                    failed++;
                results.push({
                    rule: ruleId,
                    scenario: t.scenario,
                    expected: t.expect,
                    actual,
                    pass: testPassed,
                });
            }
        }
    }
    if (jsonOutput) {
        console.log(JSON.stringify({ total: totalTests, passed, failed, results }, null, 2));
    }
    else {
        if (totalTests === 0) {
            console.log("No enforcement tests found. Add `test` entries to rule frontmatter.");
        }
        else {
            for (const r of results) {
                const icon = r.pass ? "PASS" : "FAIL";
                console.log(`  [${icon}] ${r.rule}: ${r.scenario} (expected ${r.expected}, got ${r.actual})`);
            }
            console.log(`\n${passed} passed, ${failed} failed out of ${totalTests} tests.`);
            if (failed > 0)
                process.exit(1);
        }
    }
}
// ---------------------------------------------------------------------------
// Phase 11: Escape hatches — override/approve
// ---------------------------------------------------------------------------
const APPROVALS_FILE = "enforcement-approvals.json";
const APPROVAL_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
/**
 * Request an enforcement override. Returns a challenge requiring human approval.
 *
 * orqa enforce override --rule RULE-xxx --reason "Emergency hotfix"
 */
async function handleOverride(args) {
    const ruleId = getFlag(args, "--rule");
    const reason = getFlag(args, "--reason");
    const requestId = getFlag(args, "--request-id");
    if (!ruleId || !reason) {
        console.error("Usage: orqa enforce override --rule <id> --reason <text>");
        process.exit(1);
        return;
    }
    const projectRoot = getRoot();
    const approvalsPath = join(projectRoot, "tmp", APPROVALS_FILE);
    // If request-id provided, check if it's approved
    if (requestId) {
        const approvals = loadApprovals(approvalsPath);
        const approval = approvals[requestId];
        if (!approval) {
            console.error(`Override request ${requestId} not found or not yet approved.`);
            process.exit(1);
            return;
        }
        if (approval.rule !== ruleId) {
            console.error(`Override request ${requestId} is for ${approval.rule}, not ${ruleId}.`);
            process.exit(1);
            return;
        }
        // Check expiry
        if (new Date(approval.expires_at).getTime() < Date.now()) {
            console.error(`Override request ${requestId} has expired. Request a new one.`);
            delete approvals[requestId];
            writeApprovals(approvalsPath, approvals);
            process.exit(1);
            return;
        }
        // Consume the approval (one-time use)
        delete approvals[requestId];
        writeApprovals(approvalsPath, approvals);
        // Log the override
        logEvent(projectRoot, createEvent({
            mechanism: "override",
            type: "human-approved",
            rule_id: ruleId,
            artifact_id: null,
            result: "pass",
            message: `Override approved for ${ruleId}: ${reason}`,
            source: "cli",
            resolution: "overridden",
        }));
        console.log(JSON.stringify({
            status: "override-granted",
            rule: ruleId,
            request_id: requestId,
            reason,
        }, null, 2));
        return;
    }
    // Generate a 5-digit approval code
    const approvalCode = String(Math.floor(10000 + Math.random() * 90000));
    // Store as pending (not yet approved — human must run approve)
    // We store the request but it's NOT approved until `orqa enforce approve` is called
    const pendingPath = join(projectRoot, "tmp", "enforcement-pending.json");
    const pending = loadApprovals(pendingPath);
    pending[approvalCode] = {
        rule: ruleId,
        reason,
        requested_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + APPROVAL_EXPIRY_MS).toISOString(),
    };
    writeApprovals(pendingPath, pending);
    console.log(JSON.stringify({
        status: "requires-human-approval",
        approval_code: approvalCode,
        rule: ruleId,
        reason,
        approve_command: `orqa enforce approve ${approvalCode}`,
        expires_in: "30 minutes",
    }, null, 2));
}
/**
 * Approve an override request. Must be run by a human.
 *
 * orqa enforce approve 73829
 */
async function handleApprove(code) {
    if (!code) {
        console.error("Usage: orqa enforce approve <approval-code>");
        process.exit(1);
        return;
    }
    const projectRoot = getRoot();
    const pendingPath = join(projectRoot, "tmp", "enforcement-pending.json");
    const approvalsPath = join(projectRoot, "tmp", APPROVALS_FILE);
    const pending = loadApprovals(pendingPath);
    const request = pending[code];
    if (!request) {
        console.error(`No pending override request with code ${code}.`);
        process.exit(1);
        return;
    }
    // Check expiry
    if (new Date(request.expires_at).getTime() < Date.now()) {
        console.error(`Override request ${code} has expired.`);
        delete pending[code];
        writeApprovals(pendingPath, pending);
        process.exit(1);
        return;
    }
    // Move from pending to approved
    delete pending[code];
    writeApprovals(pendingPath, pending);
    const approvals = loadApprovals(approvalsPath);
    approvals[code] = {
        ...request,
        approved_at: new Date().toISOString(),
    };
    writeApprovals(approvalsPath, approvals);
    console.log(`Override ${code} approved for ${request.rule}. The agent can now retry with --request-id ${code}.`);
}
function loadApprovals(filePath) {
    try {
        if (!existsSync(filePath))
            return {};
        return JSON.parse(readFileSync(filePath, "utf-8"));
    }
    catch {
        return {};
    }
}
function writeApprovals(filePath, data) {
    const dir = dirname(filePath);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
// ---------------------------------------------------------------------------
// Phase 12: Enforcement metrics
// ---------------------------------------------------------------------------
/**
 * Show per-rule enforcement metrics computed from the enforcement log.
 *
 * orqa enforce metrics [--json]
 */
async function handleMetrics(args) {
    const projectRoot = getRoot();
    const jsonOutput = args.includes("--json");
    const events = readEvents(projectRoot);
    const responses = readResponses(projectRoot);
    // Build response lookup
    const responseMap = new Map();
    for (const r of responses) {
        responseMap.set(r.event_id, { action: r.action, detail: r.detail });
    }
    // Aggregate per-rule metrics
    const ruleMetrics = new Map();
    for (const event of events) {
        const ruleId = event.rule_id ?? event.artifact_id ?? "unknown";
        const m = ruleMetrics.get(ruleId) ?? {
            fires: 0, fails: 0, warns: 0, resolved: 0,
            fixed: 0, deferred: 0, overridden: 0, false_positive: 0,
        };
        m.fires++;
        if (event.result === "fail")
            m.fails++;
        if (event.result === "warn")
            m.warns++;
        const response = responseMap.get(event.id);
        if (response) {
            m.resolved++;
            if (response.action === "fixed")
                m.fixed++;
            else if (response.action === "deferred")
                m.deferred++;
            else if (response.action === "overridden")
                m.overridden++;
            else if (response.action === "false-positive")
                m.false_positive++;
        }
        ruleMetrics.set(ruleId, m);
    }
    // Detect threshold violations for learning loop
    const alerts = [];
    for (const [ruleId, m] of ruleMetrics) {
        if (m.fires === 0)
            continue;
        const fpRate = m.false_positive / m.fires;
        const overrideRate = m.overridden / m.fires;
        const resolutionRate = m.resolved / (m.fails + m.warns || 1);
        if (fpRate > 0.3) {
            alerts.push(`${ruleId}: high false-positive rate (${(fpRate * 100).toFixed(0)}%) — review rule scope`);
        }
        if (overrideRate > 0.2) {
            alerts.push(`${ruleId}: high override rate (${(overrideRate * 100).toFixed(0)}%) — rule may be too restrictive`);
        }
        if (resolutionRate < 0.5 && m.fails + m.warns > 3) {
            alerts.push(`${ruleId}: low resolution rate (${(resolutionRate * 100).toFixed(0)}%) — enforcement may need escalation`);
        }
    }
    if (jsonOutput) {
        console.log(JSON.stringify({
            rules: Object.fromEntries(ruleMetrics),
            alerts,
        }, null, 2));
    }
    else {
        if (ruleMetrics.size === 0) {
            console.log("No enforcement metrics available. Run `orqa enforce` first.");
            return;
        }
        console.log("Enforcement Metrics");
        console.log("===================\n");
        for (const [ruleId, m] of [...ruleMetrics.entries()].sort((a, b) => b[1].fires - a[1].fires)) {
            const resRate = m.fails + m.warns > 0
                ? `${((m.resolved / (m.fails + m.warns)) * 100).toFixed(0)}%`
                : "n/a";
            console.log(`${ruleId}:`);
            console.log(`  Fires: ${m.fires}  Fails: ${m.fails}  Warns: ${m.warns}`);
            console.log(`  Resolved: ${m.resolved} (${resRate})  Fixed: ${m.fixed}  Overridden: ${m.overridden}  FP: ${m.false_positive}`);
        }
        if (alerts.length > 0) {
            console.log("\nAlerts:");
            for (const a of alerts) {
                console.log(`  ! ${a}`);
            }
        }
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function findPluginRuleDirs(projectRoot) {
    const dirs = [];
    const pluginsDir = join(projectRoot, "plugins");
    if (!existsSync(pluginsDir))
        return dirs;
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const rulesDir = join(pluginsDir, entry.name, "rules");
        if (existsSync(rulesDir))
            dirs.push(rulesDir);
    }
    return dirs;
}
function getFlag(args, flag) {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length)
        return undefined;
    return args[idx + 1];
}
//# sourceMappingURL=enforce.js.map