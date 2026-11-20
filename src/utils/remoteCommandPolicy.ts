export interface ProgramPreset {
  id: string;
  label: string;
  command: string;
  description: string;
}

export const PROGRAM_PRESETS: ProgramPreset[] = [
  {
    id: 'sys-info',
    label: 'System Info',
    command: 'uname -a && uptime',
    description: 'Kernel, OS architecture, and host uptime',
  },
  {
    id: 'node-ver',
    label: 'Node Runtime',
    command: 'node -v && npm -v',
    description: 'Check installed Node.js and npm versions',
  },
  {
    id: 'list-dir',
    label: 'List Workspace',
    command: 'ls -la',
    description: 'List files in the host working directory',
  },
  {
    id: 'disk-usage',
    label: 'Disk & Memory',
    command: 'df -h . && free -m 2>/dev/null || vm_stat 2>/dev/null || true',
    description: 'Check available filesystem storage and RAM',
  },
];

const BLOCKED_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+\/(\s|$)/i,
  /:\(\)\{\s*:\|:&\s*\};:/,
  /\bmkfs\./i,
  /\bdd\s+if=.*of=\/dev\//i,
];

export function validateRemoteCommand(command: string): { valid: boolean; reason?: string } {
  const trimmed = command.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Command cannot be empty.' };
  }
  if (trimmed.length > 512) {
    return { valid: false, reason: 'Command exceeds 512 character limit.' };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: 'Blocked potentially destructive system pattern.' };
    }
  }
  return { valid: true };
}
