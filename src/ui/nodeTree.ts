import * as blessed from 'blessed';
import { SessionNode, TurnNode, ToolNode, AgentNode, NodeStatus } from '../store';
import { theme, spinnerFrames, nodeIcons } from './theme';

let spinnerIndex = 0;

export function getSpinnerChar(): string {
  return spinnerFrames[spinnerIndex % spinnerFrames.length];
}

export function tickSpinner(): void {
  spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
}

function statusColor(status: NodeStatus): string {
  switch (status) {
    case 'running': return theme.running;
    case 'success': return theme.success;
    case 'failed': return theme.failed;
    case 'denied': return theme.denied;
    case 'pending': return theme.pending;
    case 'agent': return theme.agent;
    default: return theme.text;
  }
}

function statusIcon(status: NodeStatus): string {
  if (status === 'running') return getSpinnerChar();
  return nodeIcons[status] ?? '?';
}

function colorTag(text: string, color: string): string {
  return `{${color}-fg}${text}{/}`;
}

function elapsedStr(startTime: number, endTime?: number): string {
  const ms = (endTime ?? Date.now()) - startTime;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function formatToolInput(input: Record<string, unknown>): string {
  // Pick the most informative field
  if (input.path) return String(input.path);
  if (input.file_path) return String(input.file_path);
  if (input.command) return truncate(String(input.command), 40);
  if (input.query) return truncate(String(input.query), 40);
  if (input.pattern) return String(input.pattern);
  const keys = Object.keys(input);
  if (keys.length > 0) return truncate(String(input[keys[0]]), 40);
  return '';
}

function renderToolNode(tool: ToolNode, indent: string, isLast: boolean): string {
  const connector = isLast ? '└── ' : '├── ';
  const icon = statusIcon(tool.status);
  const color = statusColor(tool.status);
  const inputHint = formatToolInput(tool.toolInput);
  const elapsed = elapsedStr(tool.startTime, tool.endTime);
  const statusLabel = tool.status === 'running' ? `${elapsed}…` : `✓  ${elapsed}`;
  const statusDisplay = tool.status === 'failed' ? 'failed' : tool.status === 'denied' ? 'denied' : tool.status === 'pending' ? 'pending' : statusLabel;

  const iconStr = colorTag(icon, color);
  const nameStr = colorTag(tool.toolName.padEnd(12), color);
  const inputStr = colorTag(truncate(inputHint, 25).padEnd(25), theme.dimmed);
  const statusStr = colorTag(statusDisplay, color);

  return `${indent}${connector}${iconStr} ${nameStr}  ${inputStr}  ${statusStr}`;
}

function renderTurnNode(turn: TurnNode, indent: string, isLast: boolean): string[] {
  const lines: string[] = [];
  const connector = isLast ? '└── ' : '├── ';
  const promptPreview = truncate(turn.prompt || '(no prompt)', 50);

  lines.push(`${indent}${connector}${colorTag('◉', theme.success)} Turn  ${colorTag(promptPreview, theme.text)}`);

  const toolIndent = indent + (isLast ? '    ' : '│   ');
  turn.tools.forEach((tool, i) => {
    const isToolLast = i === turn.tools.length - 1;
    lines.push(renderToolNode(tool, toolIndent, isToolLast));
  });

  return lines;
}

function renderAgentNode(agent: AgentNode, indent: string, isLast: boolean): string[] {
  const lines: string[] = [];
  const connector = isLast ? '└── ' : '├── ';
  const elapsed = elapsedStr(agent.startTime, agent.endTime);
  const icon = agent.status === 'running' ? getSpinnerChar() : nodeIcons.agent;
  const agentLabel = `[${agent.agentType}]`;

  lines.push(`${indent}${connector}${colorTag(icon, theme.agent)} SubAgent  ${colorTag(agentLabel, theme.agent)}  ${colorTag(elapsed, theme.dimmed)}`);

  const agentIndent = indent + (isLast ? '    ' : '│   ');
  agent.turns.forEach((turn, i) => {
    const isTurnLast = i === agent.turns.length - 1;
    lines.push(...renderTurnNode(turn, agentIndent, isTurnLast));
  });

  return lines;
}

export function renderSessionTree(session: SessionNode | null): string {
  if (!session) {
    return `  ${colorTag('◎', theme.dimmed)} Waiting for session…`;
  }

  const lines: string[] = [];
  const sessionTime = new Date(session.startTime).toLocaleTimeString('en-GB', { hour12: false });
  const shortId = session.id.slice(0, 8);

  lines.push(`${colorTag('◉', theme.success)} Session ${colorTag(shortId, theme.dimmed)}  ${colorTag(sessionTime, theme.dimmed)}`);

  // Root-level turns
  const allChildren = [
    ...session.turns.map((t) => ({ type: 'turn' as const, node: t })),
    ...session.agents.map((a) => ({ type: 'agent' as const, node: a })),
  ].sort((a, b) => a.node.startTime - b.node.startTime);

  allChildren.forEach((child, i) => {
    const isLast = i === allChildren.length - 1;
    if (child.type === 'turn') {
      lines.push(...renderTurnNode(child.node as TurnNode, '', isLast));
    } else {
      lines.push(...renderAgentNode(child.node as AgentNode, '', isLast));
    }
  });

  return lines.join('\n');
}

export function updateNodeTree(box: blessed.Widgets.BoxElement, session: SessionNode | null): void {
  const content = renderSessionTree(session);
  box.setContent(content);
  box.setScrollPerc(100);
}
