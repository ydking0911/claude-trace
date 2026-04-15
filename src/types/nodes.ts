// ─── Node Types ───────────────────────────────────────────────────────────────

export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'denied' | 'agent';

export interface ToolNode {
  id: string; // tool_use_id
  type: 'tool';
  toolName: string;
  toolInput: Record<string, unknown>;
  status: NodeStatus;
  startTime: number;
  endTime?: number;
  agentId?: string;
}

export interface TurnNode {
  id: string;
  type: 'turn';
  prompt: string;
  startTime: number;
  tools: ToolNode[];
  agentId?: string;
}

export interface AgentNode {
  id: string; // agent_id
  type: 'agent';
  agentType: string;
  startTime: number;
  endTime?: number;
  status: NodeStatus;
  turns: TurnNode[];
}

export interface SessionNode {
  id: string; // session_id
  startTime: number;
  turns: TurnNode[];
  agents: AgentNode[];
}

export interface StoreStats {
  totalTools: number;
  completedTools: number;
  failedTools: number;
  tokenUsage: number;        // historical + session output tokens (for level bar)
  estimatedCost: number;
  elapsedMs: number;
  sessionInputTokens: number; // current context window usage (input + cache tokens)
  weeklyTokens: number;       // output_tokens accumulated this calendar week
  weeklyResetMs: number;      // ms until next Monday 00:00 UTC
  // ─── Sprite signals ───────────────────────────────────────────────────────
  idleSinceMs: number;       // ms since last hook event (0 while active)
  isResponding: boolean;     // true between UserPromptSubmit and first PreToolUse
  isCompacting: boolean;     // true while a compact tool is running
  justFinishedTools: boolean; // true for 3s after all running tools complete
  runningTools: number;      // count of tools currently in 'running' state
  lastToolFailed: boolean;   // outcome of the most recently completed tool
}
