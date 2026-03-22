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
import type {
	EnforcementEvent,
	EnforcementResponse,
	EnforcementResult,
	EnforcementResolution,
} from "@orqastudio/types";

const LOG_FILENAME = "enforcement-log.jsonl";

/** Get the path to the enforcement log file for a project. */
export function getLogPath(projectRoot: string): string {
	return join(projectRoot, "tmp", LOG_FILENAME);
}

/** Create an enforcement event with auto-generated ID and timestamp. */
export function createEvent(
	fields: Omit<EnforcementEvent, "id" | "timestamp" | "resolution"> & {
		resolution?: EnforcementResolution;
	},
): EnforcementEvent {
	return {
		id: randomUUID(),
		timestamp: new Date().toISOString(),
		resolution:
			fields.result === "pass" ? "fixed" : "unresolved",
		...fields,
	};
}

/** Append an enforcement event to the log file. */
export function logEvent(
	projectRoot: string,
	event: EnforcementEvent,
): void {
	const logPath = getLogPath(projectRoot);
	const dir = dirname(logPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	appendFileSync(logPath, JSON.stringify(event) + "\n", "utf-8");
}

/** Append an enforcement response to the log file. */
export function logResponse(
	projectRoot: string,
	response: EnforcementResponse,
): void {
	const logPath = getLogPath(projectRoot);
	const dir = dirname(logPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	// Responses are stored as a separate line type with a `_type` discriminator.
	const entry = { _type: "response" as const, ...response };
	appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
}

/** Read all enforcement events from the log file. */
export function readEvents(projectRoot: string): EnforcementEvent[] {
	const logPath = getLogPath(projectRoot);
	if (!existsSync(logPath)) return [];

	const results: EnforcementEvent[] = [];
	for (const line of readFileSync(logPath, "utf-8").split("\n")) {
		if (!line) continue;
		try {
			const parsed = JSON.parse(line);
			if (parsed && typeof parsed === "object" && !("_type" in parsed)) {
				results.push(parsed as EnforcementEvent);
			}
		} catch {
			// skip malformed lines
		}
	}
	return results;
}

/** Read all enforcement responses from the log file. */
export function readResponses(projectRoot: string): EnforcementResponse[] {
	const logPath = getLogPath(projectRoot);
	if (!existsSync(logPath)) return [];

	const results: EnforcementResponse[] = [];
	for (const line of readFileSync(logPath, "utf-8").split("\n")) {
		if (!line) continue;
		try {
			const parsed = JSON.parse(line);
			if (parsed && typeof parsed === "object" && parsed._type === "response") {
				results.push(parsed as EnforcementResponse);
			}
		} catch {
			// skip malformed lines
		}
	}
	return results;
}

/**
 * Log a batch of enforcement events from validator integrity checks.
 *
 * Converts `orqa-validation` IntegrityCheck results into enforcement events.
 */
export function logValidatorResults(
	projectRoot: string,
	checks: Array<{
		category: string;
		severity: string;
		artifact_id: string;
		message: string;
	}>,
): EnforcementEvent[] {
	const events: EnforcementEvent[] = [];

	for (const check of checks) {
		// Only log schema violations as enforcement events.
		if (check.category !== "SchemaViolation") continue;

		const result: EnforcementResult =
			check.severity === "Error" ? "fail" : "warn";

		const event = createEvent({
			mechanism: "json-schema",
			type: "frontmatter",
			rule_id: null,
			artifact_id: check.artifact_id,
			result,
			message: check.message,
			source: "validator",
		});

		events.push(event);
		logEvent(projectRoot, event);
	}

	return events;
}

export type { EnforcementEvent, EnforcementResponse, EnforcementResult, EnforcementResolution };
