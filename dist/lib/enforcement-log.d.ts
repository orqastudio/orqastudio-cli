/**
 * Centralised enforcement log writer and reader.
 *
 * All enforcement events — regardless of source (hook, LSP, pre-commit,
 * JSON Schema, lint) — are logged to a single NDJSON file at
 * `tmp/enforcement-log.jsonl`. This provides a complete audit trail.
 *
 * @module enforcement-log
 */
import type { EnforcementEvent, EnforcementResponse, EnforcementResult, EnforcementResolution } from "@orqastudio/types";
/** Get the path to the enforcement log file for a project. */
export declare function getLogPath(projectRoot: string): string;
/** Create an enforcement event with auto-generated ID and timestamp. */
export declare function createEvent(fields: Omit<EnforcementEvent, "id" | "timestamp" | "resolution"> & {
    resolution?: EnforcementResolution;
}): EnforcementEvent;
/** Append an enforcement event to the log file. */
export declare function logEvent(projectRoot: string, event: EnforcementEvent): void;
/** Append an enforcement response to the log file. */
export declare function logResponse(projectRoot: string, response: EnforcementResponse): void;
/** Read all enforcement events from the log file. */
export declare function readEvents(projectRoot: string): EnforcementEvent[];
/** Read all enforcement responses from the log file. */
export declare function readResponses(projectRoot: string): EnforcementResponse[];
export type { EnforcementEvent, EnforcementResponse, EnforcementResult, EnforcementResolution };
//# sourceMappingURL=enforcement-log.d.ts.map