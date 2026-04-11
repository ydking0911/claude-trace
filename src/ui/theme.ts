export const theme = {
  // Background & borders
  bg: '#0A0A0A',
  border: '#374151',

  // Header (Claude amber)
  header: '#D97706',

  // Node status colors
  running: '#F59E0B',   // amber bright
  success: '#10B981',   // emerald green
  failed: '#EF4444',    // red
  denied: '#F97316',    // orange
  pending: '#6B7280',   // dimmed gray
  agent: '#3B82F6',     // blue

  // Text
  text: '#F3F4F6',      // bright white
  dimmed: '#6B7280',    // gray
  muted: '#4B5563',     // darker gray

  // Token level bar
  skyBlue: '#87CEEB',

  // Limit bars
  orange: '#F97316',
  lightGreen: '#86EFAC',
} as const;

export const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const nodeIcons = {
  pending: '◎',
  running: '⠸',  // replaced dynamically by spinner
  success: '◉',
  failed: '✗',
  denied: '⊘',
  agent: '▣',
} as const;
