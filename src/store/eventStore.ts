import { EventEmitter } from 'events';
import { scanHistoricalTokens, scanWeeklyTokens } from '../tokenStore';
import {
  HookEvent,
  BaseHookInput,
  UserPromptSubmitEvent,
  PreToolUseEvent,
  PostToolUseEvent,
  PostToolUseFailureEvent,
  PermissionRequestEvent,
  PermissionDeniedEvent,
  SubagentStartEvent,
  SubagentStopEvent,
} from '../types/events';
import {
  NodeStatus,
  ToolNode,
  TurnNode,
  AgentNode,
  SessionNode,
  StoreStats,
} from '../types/nodes';

// Re-export so callers can import NodeStatus from this module too
export type { NodeStatus, ToolNode, TurnNode, AgentNode, SessionNode, StoreStats };

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
  // ─── Sprite signal state ──────────────────────────────────────────────────
  private lastEventTime = 0;
  private _isResponding = false;    // set on UserPromptSubmit, cleared on first PreToolUse
  private _isCompacting = false;    // set on PreToolUse(compact), cleared on PostToolUse
  private lastToolCompleteTime = 0; // updated on every PostToolUse / PostToolUseFailure
  private _runningTools = 0;        // incremented on PreToolUse, decremented on PostToolUse
  private _lastToolFailed = false;  // outcome of the most recently completed tool

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
    // Update idle clock for every event — prevents false sleeping during any activity
    this.lastEventTime = Date.now();

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
      case 'TaskCreated':
      case 'TaskCompleted':
        // lastEventTime already updated above; no tree mutation needed
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
    this._isResponding = true;

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
    this._isResponding = false;
    this._runningTools++;
    if (event.tool_name.toLowerCase().includes('compact')) {
      this._isCompacting = true;
    }

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

    const turn = this.findTurnForAgent(event.agent_id);
    if (turn) {
      turn.tools.push(toolNode);
    } else {
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
      if (node.toolName.toLowerCase().includes('compact')) {
        this._isCompacting = false;
      }
    }
    this._runningTools = Math.max(0, this._runningTools - 1);
    this._lastToolFailed = false;
    this.lastToolCompleteTime = Date.now();
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
      if (node.toolName.toLowerCase().includes('compact')) {
        this._isCompacting = false;
      }
    }
    this._runningTools = Math.max(0, this._runningTools - 1);
    this._lastToolFailed = true;
    this.lastToolCompleteTime = Date.now();
  }

  private onPermissionRequest(event: PermissionRequestEvent): void {
    if (!event.tool_use_id) return;
    const node = this.toolNodeMap.get(event.tool_use_id);
    if (node) {
      node.status = 'pending';
    }
  }

  private onPermissionDenied(event: PermissionDeniedEvent): void {
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
      let lastContextTokens = 0;

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

    const now = Date.now();
    const DONE_FLASH_MS = 3000;
    return {
      totalTools,
      completedTools,
      failedTools,
      tokenUsage: this.tokenUsage,
      estimatedCost: 0,
      elapsedMs: this.sessionStartTime ? now - this.sessionStartTime : 0,
      sessionInputTokens: this.sessionInputTokens,
      weeklyTokens: this.weeklyTokens,
      weeklyResetMs: this.weeklyResetAt ? Math.max(0, this.weeklyResetAt - now) : 0,
      idleSinceMs: this.lastEventTime > 0 ? now - this.lastEventTime : 0,
      isResponding: this._isResponding,
      isCompacting: this._isCompacting,
      runningTools: this._runningTools,
      lastToolFailed: this._lastToolFailed,
      justFinishedTools:
        this.lastToolCompleteTime > 0 &&
        now - this.lastToolCompleteTime < DONE_FLASH_MS &&
        this._runningTools === 0 &&   // all tools done, not mid-turn
        !this._isResponding,
    };
  }
}
