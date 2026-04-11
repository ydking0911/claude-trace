import { EventEmitter } from 'events';
import { scanHistoricalTokens, scanWeeklyTokens } from './tokenStore';

// ─── Event Types ─────────────────────────────────────────────────────────────

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
}

// ─── EventStore ───────────────────────────────────────────────────────────────

export class EventStore extends EventEmitter {
  session: SessionNode | null = null;
  tokenUsage = 0;
  private historicalBase = 0;          // output_tokens summed from all past JSONL sessions
  private sessionTokens = 0;           // output_tokens from current session transcript
  private sessionInputTokens = 0;      // input + cache tokens (context window usage)
  private weeklyTokens = 0;
  private weeklyResetAt = 0; // absolute timestamp of next Monday 00:00 UTC
  private currentTurn: TurnNode | null = null;
  private toolNodeMap = new Map<string, ToolNode>(); // tool_use_id → ToolNode
  private agentMap = new Map<string, AgentNode>(); // agent_id → AgentNode
  private sessionStartTime = 0;
  private transcriptPath: string | null = null;

  constructor() {
    super();
    void this.loadStartupData();
  }

  private async loadStartupData(): Promise<void> {
    const [historical, weekly] = await Promise.all([
      scanHistoricalTokens(),
      scanWeeklyTokens(),
    ]);
    this.historicalBase = historical;
    this.weeklyTokens = weekly.outputTokens;
    this.weeklyResetAt = Date.now() + weekly.resetMs;
    this.tokenUsage = this.historicalBase + this.sessionTokens;
    this.emit('update');
  }

  handleEvent(event: HookEvent): void {
    switch (event.hook_event_name) {
      case 'SessionStart':
        this.onSessionStart(event);
        break;
      case 'UserPromptSubmit':
        this.onUserPromptSubmit(event as UserPromptSubmitEvent);
        break;
      case 'PreToolUse':
        this.onPreToolUse(event as PreToolUseEvent);
        break;
      case 'PostToolUse':
        this.onPostToolUse(event as PostToolUseEvent);
        break;
      case 'PostToolUseFailure':
        this.onPostToolUseFailure(event as PostToolUseFailureEvent);
        break;
      case 'PermissionRequest':
        this.onPermissionRequest(event as PermissionRequestEvent);
        break;
      case 'PermissionDenied':
        this.onPermissionDenied(event as PermissionDeniedEvent);
        break;
      case 'SubagentStart':
        this.onSubagentStart(event as SubagentStartEvent);
        break;
      case 'SubagentStop':
        this.onSubagentStop(event as SubagentStopEvent);
        break;
      case 'SessionEnd':
        this.onSessionEnd(event);
        break;
    }
    this.emit('update');
  }

  private onSessionStart(event: BaseHookInput): void {
    this.sessionStartTime = Date.now();
    this.session = {
      id: event.session_id,
      startTime: this.sessionStartTime,
      turns: [],
      agents: [],
    };
  }

  private onUserPromptSubmit(event: UserPromptSubmitEvent): void {
    if (!this.session) this.initSession(event.session_id);

    if (event.transcript_path) {
      this.transcriptPath = event.transcript_path;
      void this.readTokensFromTranscript();
    }

    const turn: TurnNode = {
      id: `turn-${Date.now()}`,
      type: 'turn',
      prompt: event.prompt || '',
      startTime: Date.now(),
      tools: [],
      agentId: event.agent_id,
    };

    if (event.agent_id) {
      const agent = this.agentMap.get(event.agent_id);
      if (agent) {
        agent.turns.push(turn);
      } else {
        this.session!.turns.push(turn);
      }
    } else {
      this.session!.turns.push(turn);
    }
    this.currentTurn = turn;
  }

  private onPreToolUse(event: PreToolUseEvent): void {
    if (!this.session) this.initSession(event.session_id);

    const toolNode: ToolNode = {
      id: event.tool_use_id,
      type: 'tool',
      toolName: event.tool_name,
      toolInput: event.tool_input || {},
      status: 'running',
      startTime: Date.now(),
      agentId: event.agent_id,
    };

    this.toolNodeMap.set(event.tool_use_id, toolNode);

    // Find the right turn to attach the tool to
    const turn = this.findTurnForAgent(event.agent_id);
    if (turn) {
      turn.tools.push(toolNode);
    } else {
      // Create a default turn if none exists
      if (!this.currentTurn) {
        const defaultTurn: TurnNode = {
          id: `turn-${Date.now()}`,
          type: 'turn',
          prompt: '',
          startTime: Date.now(),
          tools: [],
          agentId: event.agent_id,
        };
        this.session!.turns.push(defaultTurn);
        this.currentTurn = defaultTurn;
      }
      this.currentTurn.tools.push(toolNode);
    }
  }

  private onPostToolUse(event: PostToolUseEvent): void {
    const node = this.toolNodeMap.get(event.tool_use_id);
    if (node) {
      node.status = 'success';
      node.endTime = Date.now();
    }
    if (event.transcript_path) {
      this.transcriptPath = event.transcript_path;
      void this.readTokensFromTranscript();
    }
  }

  private onPostToolUseFailure(event: PostToolUseFailureEvent): void {
    const node = this.toolNodeMap.get(event.tool_use_id);
    if (node) {
      node.status = 'failed';
      node.endTime = Date.now();
    }
  }

  private onPermissionRequest(event: PermissionRequestEvent): void {
    if (!event.tool_use_id) return;
    const node = this.toolNodeMap.get(event.tool_use_id);
    if (node) {
      node.status = 'pending';
    }
  }

  private onPermissionDenied(event: PermissionDeniedEvent): void {
    // Find the most recent tool with this name and mark as denied
    for (const [, node] of this.toolNodeMap) {
      if (node.toolName === event.tool_name && node.status === 'pending') {
        node.status = 'denied';
        node.endTime = Date.now();
        break;
      }
    }
  }

  private onSubagentStart(event: SubagentStartEvent): void {
    if (!this.session) this.initSession(event.session_id);

    if (!event.agent_id) return;

    const agent: AgentNode = {
      id: event.agent_id,
      type: 'agent',
      agentType: event.agent_type || 'unknown',
      startTime: Date.now(),
      status: 'running',
      turns: [],
    };
    this.agentMap.set(event.agent_id, agent);
    this.session!.agents.push(agent);
  }

  private onSubagentStop(event: SubagentStopEvent): void {
    if (!event.agent_id) return;
    const agent = this.agentMap.get(event.agent_id);
    if (agent) {
      agent.status = 'success';
      agent.endTime = Date.now();
    }
  }

  private onSessionEnd(event: BaseHookInput): void {
    if (event.transcript_path) {
      this.transcriptPath = event.transcript_path;
    }
    void this.readTokensFromTranscript();
    this.emit('sessionEnd');
  }

  private async readTokensFromTranscript(): Promise<void> {
    if (!this.transcriptPath) return;
    try {
      const { readFile } = await import('fs/promises');
      const content = await readFile(this.transcriptPath, 'utf-8');
      let sessionOutputTokens = 0;
      let lastContextTokens = 0; // input + cache_creation + cache_read from last assistant msg

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed) as unknown;
          if (!entry || typeof entry !== 'object') continue;
          const msg = (entry as Record<string, unknown>)['message'];
          if (!msg || typeof msg !== 'object') continue;
          const usage = (msg as Record<string, unknown>)['usage'];
          if (!usage || typeof usage !== 'object') continue;
          const u = usage as Record<string, unknown>;
          const out = u['output_tokens'];
          if (typeof out === 'number') sessionOutputTokens += out;
          const inp = typeof u['input_tokens'] === 'number' ? u['input_tokens'] : 0;
          const cacheCreate = typeof u['cache_creation_input_tokens'] === 'number' ? u['cache_creation_input_tokens'] : 0;
          const cacheRead = typeof u['cache_read_input_tokens'] === 'number' ? u['cache_read_input_tokens'] : 0;
          if (inp + cacheCreate + cacheRead > 0) {
            lastContextTokens = inp + cacheCreate + cacheRead;
          }
        } catch {
          // skip malformed lines
        }
      }

      this.sessionTokens = sessionOutputTokens;
      this.sessionInputTokens = lastContextTokens;

      const total = this.historicalBase + this.sessionTokens;
      if (total !== this.tokenUsage || lastContextTokens !== this.sessionInputTokens) {
        this.tokenUsage = total;
        this.emit('update');
      }
    } catch {
      // transcript not accessible yet
    }
  }

  private findTurnForAgent(agentId?: string): TurnNode | null {
    if (!this.session) return null;

    if (agentId) {
      const agent = this.agentMap.get(agentId);
      if (agent && agent.turns.length > 0) {
        return agent.turns[agent.turns.length - 1];
      }
    }

    if (this.currentTurn) return this.currentTurn;

    const turns = this.session.turns;
    return turns.length > 0 ? turns[turns.length - 1] : null;
  }

  private initSession(sessionId: string): void {
    this.sessionStartTime = Date.now();
    this.session = {
      id: sessionId,
      startTime: this.sessionStartTime,
      turns: [],
      agents: [],
    };
  }

  getStats(): StoreStats {
    let totalTools = 0;
    let completedTools = 0;
    let failedTools = 0;

    const countTools = (tools: ToolNode[]) => {
      for (const tool of tools) {
        totalTools++;
        if (tool.status === 'success') completedTools++;
        if (tool.status === 'failed') failedTools++;
      }
    };

    if (this.session) {
      for (const turn of this.session.turns) {
        countTools(turn.tools);
      }
      for (const agent of this.session.agents) {
        for (const turn of agent.turns) {
          countTools(turn.tools);
        }
      }
    }

    return {
      totalTools,
      completedTools,
      failedTools,
      tokenUsage: this.tokenUsage,
      estimatedCost: 0,
      elapsedMs: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      sessionInputTokens: this.sessionInputTokens,
      weeklyTokens: this.weeklyTokens,
      weeklyResetMs: this.weeklyResetAt ? Math.max(0, this.weeklyResetAt - Date.now()) : 0,
    };
  }
}
