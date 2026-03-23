/**
 * Centralised enforcement log writer and reader.
 *
 * All enforcement events — regardless of source (hook, LSP, pre-commit,
 * JSON Schema, lint) — are logged to a single NDJSON file at
 * `tmp/enforcement-log.jsonl`. This provides a complete audit trail.
 *
 * @module enforcement-log
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { randomUUID } from "crypto";
const LOG_FILENAME = "enforcement-log.jsonl";
/** Get the path to the enforcement log file for a project. */
export function getLogPath(projectRoot) {
    return join(projectRoot, "tmp", LOG_FILENAME);
}
/** Create an enforcement event with auto-generated ID and timestamp. */
export function createEvent(fields) {
    return {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        resolution: fields.result === "pass" ? "fixed" : "unresolved",
        ...fields,
    };
}
/** Append an enforcement event to the log file. */
export function logEvent(projectRoot, event) {
    const logPath = getLogPath(projectRoot);
    const dir = dirname(logPath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    appendFileSync(logPath, JSON.stringify(event) + "\n", "utf-8");
}
/** Append an enforcement response to the log file. */
export function logResponse(projectRoot, response) {
    const logPath = getLogPath(projectRoot);
    const dir = dirname(logPath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    // Responses are stored as a separate line type with a `_type` discriminator.
    const entry = { _type: "response", ...response };
    appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
}
/** Read all enforcement events from the log file. */
export function readEvents(projectRoot) {
    const logPath = getLogPath(projectRoot);
    if (!existsSync(logPath))
        return [];
    const results = [];
    for (const line of readFileSync(logPath, "utf-8").split("\n")) {
        if (!line)
            continue;
        try {
            const parsed = JSON.parse(line);
            if (parsed && typeof parsed === "object" && !("_type" in parsed)) {
                results.push(parsed);
            }
        }
        catch {
            // skip malformed lines
        }
    }
    return results;
}
/** Read all enforcement responses from the log file. */
export function readResponses(projectRoot) {
    const logPath = getLogPath(projectRoot);
    if (!existsSync(logPath))
        return [];
    const results = [];
    for (const line of readFileSync(logPath, "utf-8").split("\n")) {
        if (!line)
            continue;
        try {
            const parsed = JSON.parse(line);
            if (parsed && typeof parsed === "object" && parsed._type === "response") {
                results.push(parsed);
            }
        }
        catch {
            // skip malformed lines
        }
    }
    return results;
}
//# sourceMappingURL=enforcement-log.js.map