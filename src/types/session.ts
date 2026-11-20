export type PeerRole = 'host' | 'controller';

export type ConnectionPhase =
  | 'idle'
  | 'waiting'
  | 'handshaking'
  | 'connected'
  | 'disconnected';

export type TransportMode = 'webrtc-p2p' | 'e2ee-relay';

export type ScreenSourceMode = 'none' | 'display' | 'workspace';

export interface RemotePointerEvent {
  kind: 'move' | 'down' | 'up' | 'click' | 'dblclick' | 'wheel';
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
  button?: number;
  deltaY?: number;
  ts: number;
}

export interface RemoteKeyEvent {
  kind: 'keydown' | 'keyup' | 'type';
  key: string;
  code?: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ts: number;
}

export interface ChatFileAttachment {
  transferId: string;
  name: string;
  size: number;
  mimeType: string;
  sha256: string;
  progress: number; // 0..100
  status: 'sending' | 'receiving' | 'completed' | 'verified' | 'error';
  downloadUrl?: string;
  verifiedSha256?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: PeerRole;
  senderName: string;
  text: string;
  timestamp: number;
  attachment?: ChatFileAttachment;
}

export interface RemoteExecRequest {
  execId: string;
  command: string;
  requestedBy: string;
  requestedAt: number;
  status: 'pending-approval' | 'running' | 'completed' | 'denied' | 'error';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  cwd?: string;
}

export interface HostWorkspaceFile {
  name: string;
  type: 'file' | 'dir';
  size: number;
}

export interface HostMetricsSnapshot {
  cpuPercent: number;
  cores: number;
  memUsedGb: number;
  memTotalGb: number;
  memPercent: number;
  loadAvg1m: number;
  sampledAt: number;
}

export interface HostAgentStatus {
  connected: boolean;
  platform?: string;
  screenWidth?: number;
  screenHeight?: number;
  error?: string | null;
}

export interface VoiceState {
  micEnabled: boolean;
  speakerMuted: boolean;
  remoteAudioActive: boolean;
  localLevel: number; // 0..100
  remoteLevel: number; // 0..100
  error: string | null;
}

export type DecryptedPacket =
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number }
  | { type: 'chat:text'; id: string; text: string; timestamp: number; senderName: string }
  | {
      type: 'file:meta';
      transferId: string;
      messageId: string;
      name: string;
      size: number;
      mimeType: string;
      totalChunks: number;
      sha256: string;
      viaChat: boolean;
      senderName: string;
      caption?: string;
      timestamp: number;
    }
  | {
      type: 'file:chunk';
      transferId: string;
      index: number;
      dataBase64: string;
    }
  | {
      type: 'file:ack';
      transferId: string;
      verified: boolean;
    }
  | {
      type: 'control:pointer';
      event: RemotePointerEvent;
    }
  | {
      type: 'control:key';
      event: RemoteKeyEvent;
    }
  | {
      type: 'screen:status';
      mode: ScreenSourceMode;
    }
  | {
      type: 'screen:frame';
      dataUrl: string;
      width: number;
      height: number;
      ts: number;
    }
  | {
      type: 'exec:request';
      execId: string;
      command: string;
      requestedBy: string;
      requestedAt: number;
    }
  | {
      type: 'exec:result';
      execId: string;
      status: 'running' | 'completed' | 'denied' | 'error';
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      durationMs?: number;
      cwd?: string;
    }
  | {
      type: 'voice:status';
      micEnabled: boolean;
    }
  | {
      type: 'host:metrics';
      metrics: HostMetricsSnapshot;
    }
  | {
      type: 'agent:status';
      status: HostAgentStatus;
    };
