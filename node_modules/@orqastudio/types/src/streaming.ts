export type StreamEvent =
	| { type: "stream_start"; data: { message_id: number; resolved_model: string | null } }
	| { type: "text_delta"; data: { content: string } }
	| { type: "thinking_delta"; data: { content: string } }
	| { type: "tool_use_start"; data: { tool_call_id: string; tool_name: string } }
	| { type: "tool_input_delta"; data: { tool_call_id: string; content: string } }
	| {
			type: "tool_result";
			data: { tool_call_id: string; tool_name: string; result: string; is_error: boolean };
		}
	| { type: "block_complete"; data: { block_index: number; content_type: string } }
	| { type: "turn_complete"; data: { input_tokens: number; output_tokens: number } }
	| {
			type: "stream_error";
			data: { code: string; message: string; recoverable: boolean };
		}
	| { type: "stream_cancelled"; data: null }
	| {
			/** Emitted when a write or execute tool requests user approval before running. */
			type: "tool_approval_request";
			data: { tool_call_id: string; tool_name: string; input: string };
		}
	| {
			/** Emitted after a turn when a process compliance violation is detected. */
			type: "process_violation";
			data: { check: string; message: string };
		}
	| { type: "session_title_updated"; data: { session_id: number; title: string } }
	| {
			type: "system_prompt_sent";
			data: {
				custom_prompt: string | null;
				governance_prompt: string;
				total_chars: number;
			};
		}
	| {
			type: "context_injected";
			data: {
				message_count: number;
				total_chars: number;
				messages: string; // JSON array of {role, content}
			};
		};
