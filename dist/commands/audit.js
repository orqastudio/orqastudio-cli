/**
 * Audit command — full governance audit.
 *
 * orqa audit [--fix]
 *   Runs: integrity validation (with optional --fix), version drift, license audit, readme audit.
 *   Exits non-zero if any check fails.
 *
 * orqa audit escalation [--json] [--create-tasks]
 *   Scans lessons for escalation candidates and creates CRITICAL task artifacts.
 *
 *   Detection rules:
 *     - Lesson recurrence >= 3 and status != promoted → [PROMOTE] finding
 *     - Lesson recurrence >= 3 and promoted-to rule exists:
 *         - If rule has no enforcement_updated → [STRENGTHEN] finding
 *         - If rule has enforcement_updated and lesson recurrence >= 3 post-update → [STRENGTHEN] finding
 *
 *   --create-tasks always creates artifacts for every finding found.
 *   In the stop hook, --create-tasks is always passed so tasks are created immediately.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { getRoot } from "../lib/root.js";
// ─── Full audit ───────────────────────────────────────────────────────────────
export async function runAuditCommand(args = []) {
    const subcommand = args[0];
    if (subcommand === "escalation") {
        await runEscalationCheck(getRoot(), args.slice(1));
        return;
    }
    const root = getRoot();
    let failed = false;
    const fix = args.includes("--fix") ? " --fix" : "";
    const checks = [
        { name: "integrity", cmd: `orqa enforce .${fix}` },
        { name: "version", cmd: "orqa version check" },
        { name: "license", cmd: "orqa repo license" },
        { name: "readme", cmd: "orqa repo readme" },
    ];
    for (const check of checks) {
        try {
            execSync(check.cmd, { cwd: root, stdio: "inherit" });
        }
        catch {
            failed = true;
        }
    }
    if (failed) {
        process.exit(1);
    }
}
// ─── Frontmatter parsing ──────────────────────────────────────────────────────
function parseFrontmatter(filePath) {
    let content;
    try {
        content = readFileSync(filePath, "utf-8");
    }
    catch {
        return null;
    }
    if (!content.startsWith("---\n"))
        return null;
    const fmEnd = content.indexOf("\n---", 4);
    if (fmEnd === -1)
        return null;
    try {
        const fm = parseYaml(content.substring(4, fmEnd));
        if (!fm || typeof fm !== "object")
            return null;
        return fm;
    }
    catch {
        return null;
    }
}
function extractRelationships(fm) {
    const raw = fm.relationships;
    if (!Array.isArray(raw))
        return [];
    return raw.map((r) => ({
        target: typeof r.target === "string" ? r.target : "",
        type: typeof r.type === "string" ? r.type : "",
        rationale: typeof r.rationale === "string" ? r.rationale : undefined,
    }));
}
function parseLessonFrontmatter(filePath) {
    const fm = parseFrontmatter(filePath);
    if (!fm)
        return null;
    return {
        id: typeof fm.id === "string" ? fm.id : "",
        title: typeof fm.title === "string" ? fm.title : "",
        status: typeof fm.status === "string" ? fm.status : "active",
        recurrence: typeof fm.recurrence === "number" ? fm.recurrence : 0,
        relationships: extractRelationships(fm),
    };
}
function parseRuleFrontmatter(filePath) {
    const fm = parseFrontmatter(filePath);
    if (!fm)
        return null;
    return {
        id: typeof fm.id === "string" ? fm.id : "",
        title: typeof fm.title === "string" ? fm.title : "",
        enforcement_updated: typeof fm.enforcement_updated === "string" ? fm.enforcement_updated : undefined,
        relationships: extractRelationships(fm),
    };
}
// ─── Rule index ───────────────────────────────────────────────────────────────
function buildRuleIndex(rulesDir) {
    const index = new Map();
    let entries;
    try {
        entries = readdirSync(rulesDir, { encoding: "utf-8" });
    }
    catch {
        return index;
    }
    for (const entry of entries) {
        if (!entry.endsWith(".md"))
            continue;
        const rule = parseRuleFrontmatter(join(rulesDir, entry));
        if (rule?.id)
            index.set(rule.id, rule);
    }
    return index;
}
// ─── Escalation scan ──────────────────────────────────────────────────────────
function scanForEscalations(projectDir) {
    const findings = [];
    const lessonsDir = join(projectDir, ".orqa", "process", "lessons");
    const rulesDir = join(projectDir, ".orqa", "process", "rules");
    const ruleIndex = buildRuleIndex(rulesDir);
    let lessonEntries;
    try {
        lessonEntries = readdirSync(lessonsDir, { encoding: "utf-8" });
    }
    catch {
        return findings;
    }
    for (const entry of lessonEntries) {
        if (!entry.endsWith(".md"))
            continue;
        const lesson = parseLessonFrontmatter(join(lessonsDir, entry));
        if (!lesson?.id)
            continue;
        const recurrence = lesson.recurrence;
        if (recurrence < 3)
            continue;
        // Find promoted-to rule (if any)
        const promotedToRel = lesson.relationships.find((r) => r.type === "promoted-to");
        const associatedRule = promotedToRel ? ruleIndex.get(promotedToRel.target) : undefined;
        if (lesson.status !== "promoted") {
            // Not yet promoted — flag for promotion
            findings.push({
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                recurrence,
                lessonStatus: lesson.status,
                reason: "promote",
                description: `Lesson ${lesson.id} has recurrence ${recurrence} but status is "${lesson.status}" — needs promoting to a rule`,
            });
        }
        else if (associatedRule) {
            // Promoted — check if the rule's enforcement needs strengthening.
            // If enforcement_updated is set, recurrence was reset at that point.
            // A recurrence >= 3 post-update means the enforcement isn't working.
            // If enforcement_updated is not set, the rule has never had enforcement strengthened.
            const needsStrengthening = !associatedRule.enforcement_updated || recurrence >= 3;
            if (needsStrengthening) {
                findings.push({
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                    recurrence,
                    lessonStatus: lesson.status,
                    reason: "strengthen",
                    ruleId: associatedRule.id,
                    description: associatedRule.enforcement_updated
                        ? `Lesson ${lesson.id} has recurrence ${recurrence} after enforcement was updated on ${associatedRule.enforcement_updated} — enforcement on ${associatedRule.id} is not working`
                        : `Lesson ${lesson.id} has recurrence ${recurrence} but ${associatedRule.id} has no enforcement_updated date — enforcement has never been strengthened`,
                });
            }
        }
        else {
            // Promoted but no associated rule found via promoted-to relationship
            findings.push({
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                recurrence,
                lessonStatus: lesson.status,
                reason: "strengthen",
                description: `Lesson ${lesson.id} has recurrence ${recurrence} and status "promoted" but no associated rule found — check promoted-to relationship`,
            });
        }
    }
    return findings;
}
// ─── Active epic resolution ───────────────────────────────────────────────────
function findActiveEpic(projectDir) {
    // Try session state first
    const sessionFile = join(projectDir, "tmp", "session-state.md");
    if (existsSync(sessionFile)) {
        const content = readFileSync(sessionFile, "utf-8");
        const match = /EPIC-[a-f0-9]{8}/.exec(content);
        if (match)
            return match[0];
    }
    // Scan epics directory for first active epic
    const epicsDir = join(projectDir, ".orqa", "delivery", "epics");
    if (!existsSync(epicsDir))
        return null;
    let entries;
    try {
        entries = readdirSync(epicsDir, { encoding: "utf-8" });
    }
    catch {
        return null;
    }
    for (const entry of entries) {
        if (!entry.endsWith(".md"))
            continue;
        const fm = parseFrontmatter(join(epicsDir, entry));
        if (fm?.status === "active" && typeof fm.id === "string") {
            return fm.id;
        }
    }
    return null;
}
// ─── Task artifact creation ───────────────────────────────────────────────────
function generateId(prefix) {
    const hex = randomBytes(4).toString("hex");
    return `${prefix.toUpperCase()}-${hex}`;
}
function nextTaskFilename(tasksDir) {
    let entries;
    try {
        entries = readdirSync(tasksDir, { encoding: "utf-8" });
    }
    catch {
        entries = [];
    }
    const numbers = entries
        .filter((e) => /^TASK-\d+\.md$/.test(e))
        .map((e) => parseInt(e.replace("TASK-", "").replace(".md", ""), 10))
        .filter((n) => !isNaN(n));
    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `TASK-${String(next).padStart(3, "0")}.md`;
}
function createTaskArtifact(projectDir, finding, epicId) {
    const taskId = generateId("TASK");
    const today = new Date().toISOString().slice(0, 10);
    const titleVerb = finding.reason === "promote" ? "Promote" : "Strengthen enforcement for";
    const titleTarget = finding.ruleId ? `${finding.ruleId} (from ${finding.lessonId})` : `lesson ${finding.lessonId}`;
    const title = `ESCALATION: ${titleVerb} ${titleTarget} (recurrence ${finding.recurrence})`;
    const relationships = [
        {
            target: finding.lessonId,
            type: "addresses",
            rationale: `Escalation task for lesson with recurrence ${finding.recurrence}`,
        },
    ];
    if (finding.ruleId) {
        relationships.push({
            target: finding.ruleId,
            type: "addresses",
            rationale: "Enforcement strengthening needed on this rule",
        });
    }
    if (epicId) {
        relationships.push({
            target: epicId,
            type: "delivers",
            rationale: "Escalation task linked to active epic",
        });
    }
    const whyText = finding.reason === "promote"
        ? "The lesson must be promoted to a rule so it is mechanically enforced. Recurrence >= 3 means this pattern is established and will continue without a rule."
        : "The rule exists but enforcement is insufficient — recurrence continues post-promotion. Strengthening enforcement means adding mechanical checks (lint rules, hooks, or gates) that catch violations before they reach production.";
    const acceptanceLine = finding.reason === "promote"
        ? `Rule created and linked to lesson ${finding.lessonId} via promoted-to relationship`
        : `enforcement_updated date added to ${finding.ruleId ?? "associated rule"} and lesson recurrence reset to 0`;
    const fm = {
        id: taskId,
        title,
        description: finding.description,
        status: "captured",
        priority: "critical",
        created: today,
        updated: today,
        relationships,
    };
    const yamlText = stringifyYaml(fm, { lineWidth: 0 }).trimEnd();
    const body = `\n## What\n\n${finding.description}\n\n` +
        `## Why\n\n${whyText}\n\n` +
        `## Acceptance\n\n` +
        `- [ ] ${acceptanceLine}\n` +
        `- [ ] Recurrence does not increase in the next session\n`;
    const content = `---\n${yamlText}\n---${body}`;
    const tasksDir = join(projectDir, ".orqa", "delivery", "tasks");
    mkdirSync(tasksDir, { recursive: true });
    const filePath = join(tasksDir, nextTaskFilename(tasksDir));
    writeFileSync(filePath, content);
    return filePath;
}
// ─── Escalation command ───────────────────────────────────────────────────────
async function runEscalationCheck(projectDir, args) {
    const asJson = args.includes("--json");
    const createTasks = args.includes("--create-tasks");
    const findings = scanForEscalations(projectDir);
    if (asJson) {
        const created = [];
        if (createTasks && findings.length > 0) {
            const epicId = findActiveEpic(projectDir);
            for (const finding of findings) {
                created.push(createTaskArtifact(projectDir, finding, epicId));
            }
        }
        console.log(JSON.stringify({ findings, tasks_created: created.length }, null, 2));
        if (findings.length > 0)
            process.exit(1);
        return;
    }
    // Human-readable output
    if (findings.length === 0) {
        console.log("No escalation candidates found.");
        return;
    }
    console.log(`Found ${findings.length} escalation candidate(s):\n`);
    for (const finding of findings) {
        const tag = finding.reason === "promote" ? "[PROMOTE]" : "[STRENGTHEN]";
        const ruleNote = finding.ruleId ? ` → ${finding.ruleId}` : "";
        console.log(`  ${tag} ${finding.lessonId}${ruleNote} — recurrence ${finding.recurrence} (status: ${finding.lessonStatus})`);
        console.log(`    ${finding.lessonTitle}`);
        console.log(`    ${finding.description}`);
        console.log();
    }
    if (createTasks) {
        const epicId = findActiveEpic(projectDir);
        console.log(epicId ? `Active epic: ${epicId}` : "No active epic found — tasks created without epic link.");
        console.log();
        for (const finding of findings) {
            const filePath = createTaskArtifact(projectDir, finding, epicId);
            const rel = filePath.replace(projectDir + "/", "").replace(projectDir + "\\", "");
            console.log(`  Created: ${rel}`);
        }
        console.log();
    }
    else {
        console.log("Run with --create-tasks to auto-create CRITICAL task artifacts.");
    }
    process.exit(1);
}
//# sourceMappingURL=audit.js.map