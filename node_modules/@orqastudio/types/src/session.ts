export interface Session {
	id: number;
	project_id: number;
	title: string | null;
	model: string;
	system_prompt: string | null;
	status: SessionStatus;
	summary: string | null;
	handoff_notes: string | null;
	total_input_tokens: number;
	total_output_tokens: number;
	total_cost_usd: number;
	title_manually_set?: boolean;
	created_at: string;
	updated_at: string;
}

export interface SessionSummary {
	id: number;
	title: string | null;
	status: SessionStatus;
	message_count: number;
	preview: string | null;
	created_at: string;
	updated_at: string;
}

export type SessionStatus = "active" | "completed" | "abandoned" | "error";
