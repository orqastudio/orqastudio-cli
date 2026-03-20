export interface Message {
	id: number;
	session_id: number;
	role: MessageRole;
	content_type: ContentType;
	content: string | null;
	tool_call_id: string | null;
	tool_name: string | null;
	tool_input: string | null;
	tool_is_error: boolean;
	turn_index: number;
	block_index: number;
	stream_status: StreamStatus;
	input_tokens: number | null;
	output_tokens: number | null;
	created_at: string;
}

export type MessageRole = "user" | "assistant" | "system";
export type ContentType = "text" | "tool_use" | "tool_result" | "thinking" | "image";
export type StreamStatus = "pending" | "complete" | "error";
export type MessageId = number;

export interface SearchResult {
	message_id: number;
	session_id: number;
	session_title: string | null;
	content: string;
	highlighted: string;
	rank: number;
}
