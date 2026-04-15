// ─── Hook Event Types ─────────────────────────────────────────────────────────

export type HookEventType =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PermissionRequest'
  | 'PermissionDenied'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'SessionEnd';

export interface BaseHookInput {
  hook_event_name: HookEventType;
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  agent_id?: string;
}

export interface PreToolUseEvent extends BaseHookInput {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface PostToolUseEvent extends BaseHookInput {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_response: unknown;
  tool_use_id: string;
}

export interface PostToolUseFailureEvent extends BaseHookInput {
  hook_event_name: 'PostToolUseFailure';
  tool_name: string;
  error: string;
  tool_use_id: string;
}

export interface UserPromptSubmitEvent extends BaseHookInput {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

export interface SubagentStartEvent extends BaseHookInput {
  hook_event_name: 'SubagentStart';
  agent_type?: string;
}

export interface SubagentStopEvent extends BaseHookInput {
  hook_event_name: 'SubagentStop';
}

export interface TaskCreatedEvent extends BaseHookInput {
  hook_event_name: 'TaskCreated';
  task_title?: string;
}

export interface TaskCompletedEvent extends BaseHookInput {
  hook_event_name: 'TaskCompleted';
  task_title?: string;
}

export interface PermissionRequestEvent extends BaseHookInput {
  hook_event_name: 'PermissionRequest';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
}

export interface PermissionDeniedEvent extends BaseHookInput {
  hook_event_name: 'PermissionDenied';
  tool_name: string;
}

export type HookEvent =
  | BaseHookInput
  | PreToolUseEvent
  | PostToolUseEvent
  | PostToolUseFailureEvent
  | UserPromptSubmitEvent
  | SubagentStartEvent
  | SubagentStopEvent
  | TaskCreatedEvent
  | TaskCompletedEvent
  | PermissionRequestEvent
  | PermissionDeniedEvent;
