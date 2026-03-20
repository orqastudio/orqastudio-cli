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
