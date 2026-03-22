export interface EnforcementRule {
	name: string;
	scope: string; // "system" | "project"
	entries: EnforcementEntry[];
	prose: string;
}

export interface EnforcementEntry {
	event: "File" | "Bash";
	action: "Block" | "Warn";
	conditions: Condition[];
	pattern: string | null;
}

export interface Condition {
	field: string;
	pattern: string;
}

export interface EnforcementViolation {
	rule_name: string;
	action: "Block" | "Warn";
	tool_name: string;
	detail: string;
	timestamp: string;
}

/** A violation record loaded from the SQLite `enforcement_violations` table. */
export interface StoredEnforcementViolation {
	id: number;
	project_id: number;
	rule_name: string;
	/** Lower-case: "block" or "warn" (as stored in SQLite). */
	action: string;
	tool_name: string;
	detail: string | null;
	created_at: string;
}

// ---------------------------------------------------------------------------
// Centralised Enforcement Log (Phase 4)
// ---------------------------------------------------------------------------

/**
 * Result of an enforcement check.
 * - `pass`: no violation found
 * - `fail`: violation detected, enforcement triggered
 * - `warn`: potential issue, not blocking
 * - `error`: enforcement check itself failed (e.g. schema compilation error)
 */
export type EnforcementResult = "pass" | "fail" | "warn" | "error";

/**
 * Resolution status for an enforcement event.
 * Set by the agent after receiving enforcement feedback.
 */
export type EnforcementResolution =
	| "unresolved"
	| "fixed"
	| "deferred"
	| "overridden"
	| "false-positive";

/**
 * A single enforcement event logged to the centralised enforcement log.
 *
 * Every enforcement check — regardless of source (hook, LSP, pre-commit,
 * JSON Schema, lint) — produces one event per check per artifact.
 * The enforcement log is NDJSON (one event per line) at `tmp/enforcement-log.jsonl`.
 */
export interface EnforcementEvent {
	/** Unique event ID (UUID v4 or nanoid). */
	id: string;
	/** ISO 8601 timestamp. */
	timestamp: string;
	/** Mechanism key that produced this event (e.g. "json-schema", "hook", "lint"). */
	mechanism: string;
	/** Hook or check type within the mechanism (e.g. "PreToolUse", "frontmatter"). */
	type: string;
	/** Rule ID that triggered this enforcement, if applicable. */
	rule_id: string | null;
	/** Artifact ID being checked, if applicable. */
	artifact_id: string | null;
	/** Check result. */
	result: EnforcementResult;
	/** Human-readable message describing the finding. */
	message: string;
	/** Source that produced this event. */
	source: "validator" | "lsp" | "hook" | "pre-commit" | "cli";
	/** Resolution status (starts as "unresolved" for fail/warn events). */
	resolution: EnforcementResolution;
}

/**
 * An agent's response to an enforcement event.
 * Links back to the original event via `event_id`.
 */
export interface EnforcementResponse {
	/** The enforcement event ID this responds to. */
	event_id: string;
	/** ISO 8601 timestamp of the response. */
	timestamp: string;
	/** Action taken by the agent. */
	action: EnforcementResolution;
	/** Human-readable detail about what was done. */
	detail: string;
}
