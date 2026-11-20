import React, { useEffect, useRef, useState } from 'react';
import {
  Lock,
  MessageSquare,
  Mic,
  PhoneOff,
  ShieldCheck,
  Terminal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  ChatMessage,
  ConnectionPhase,
  HostAgentStatus,
  HostMetricsSnapshot,
  HostWorkspaceFile,
  PeerRole,
  RemoteExecRequest,
  RemoteKeyEvent,
  RemotePointerEvent,
  ScreenSourceMode,
  TransportMode,
  VoiceState,
} from '../types/session';
import { ChatAndFilesPanel } from './ChatAndFilesPanel';
import { HostMetricsOverlay } from './HostMetricsOverlay';
import { HostWorkspaceCanvas } from './HostWorkspaceCanvas';
import { ProgramsPanel } from './ProgramsPanel';
import { RemoteViewport } from './RemoteViewport';
import { SecurityPanel } from './SecurityPanel';

type SidebarTab = 'chat' | 'programs' | 'security';

interface ActiveSessionViewProps {
  role: PeerRole;
  authCode: string;
  deviceName: string;
  peerName: string;
  phase: ConnectionPhase;
  fingerprint: string;
  transportMode: TransportMode;
  rttMs: number | null;
  errorBanner: string | null;
  onDismissError: () => void;
  screenMode: ScreenSourceMode;
  remoteScreenMode: ScreenSourceMode;
  remoteVideoStream: MediaStream | null;
  localVideoStream: MediaStream | null;
  remoteFallbackFrame: string | null;
  remoteControlEnabled: boolean;
  onToggleRemoteControl: () => void;
  remotePointer: RemotePointerEvent | null;
  subscribeRemotePointer: (listener: (evt: RemotePointerEvent) => void) => () => void;
  subscribeRemoteKeys: (listener: (evt: RemoteKeyEvent) => void) => () => void;
  messages: ChatMessage[];
  execLogs: RemoteExecRequest[];
  allowRemoteExec: boolean;
  setAllowRemoteExec: (v: boolean) => void;
  autoApproveExec: boolean;
  setAutoApproveExec: (v: boolean) => void;
  hostFiles: HostWorkspaceFile[];
  hostMetrics: HostMetricsSnapshot | null;
  agentToken: string;
  hostAgentStatus: HostAgentStatus;
  remoteAgentStatus: HostAgentStatus;
  onConnectAgent: (silent?: boolean) => void;
  onDisconnectAgent: () => void;
  voice: VoiceState;
  remoteAudioStream: MediaStream | null;
  onStartDisplayShare: () => void;
  onStartWorkspaceStream: (canvas: HTMLCanvasElement | null) => void;
  onStopShare: () => void;
  onWorkspaceFrame: (canvas: HTMLCanvasElement) => void;
  onRefreshHostFiles: () => void;
  onSendPointer: (evt: RemotePointerEvent) => void;
  onSendKey: (evt: RemoteKeyEvent) => void;
  onSendChat: (text: string) => Promise<void>;
  onSendFile: (file: File, viaChat: boolean, caption?: string) => Promise<void>;
  onRunCommand: (command: string) => Promise<void>;
  onApproveExec: (execId: string) => Promise<void>;
  onDenyExec: (execId: string) => Promise<void>;
  onToggleMic: () => Promise<void>;
  onToggleSpeakerMute: () => void;
  onDisconnect: () => void;
}

export const ActiveSessionView: React.FC<ActiveSessionViewProps> = ({
  role,
  authCode,
  deviceName,
  peerName,
  phase,
  fingerprint,
  transportMode,
  rttMs,
  errorBanner,
  onDismissError,
  screenMode,
  remoteScreenMode,
  remoteVideoStream,
  localVideoStream,
  remoteFallbackFrame,
  remoteControlEnabled,
  onToggleRemoteControl,
  remotePointer,
  subscribeRemotePointer,
  subscribeRemoteKeys,
  messages,
  execLogs,
  allowRemoteExec,
  setAllowRemoteExec,
  autoApproveExec,
  setAutoApproveExec,
  hostFiles,
  hostMetrics,
  agentToken,
  hostAgentStatus,
  remoteAgentStatus,
  onConnectAgent,
  onDisconnectAgent,
  voice,
  remoteAudioStream,
  onStartDisplayShare,
  onStartWorkspaceStream,
  onStopShare,
  onWorkspaceFrame,
  onRefreshHostFiles,
  onSendPointer,
  onSendKey,
  onSendChat,
  onSendFile,
  onRunCommand,
  onApproveExec,
  onDenyExec,
  onToggleMic,
  onToggleSpeakerMute,
  onDisconnect,
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = remoteAudioStream;
      audioRef.current.muted = voice.speakerMuted;
    }
  }, [remoteAudioStream, voice.speakerMuted]);

  const pendingApprovals =
    role === 'host' ? execLogs.filter((e) => e.status === 'pending-approval').length : 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F7F7F4] text-[#111214]">
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      {/* Session Control Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D6D6CE] bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <span className="font-display text-base font-bold text-[#111214] whitespace-nowrap">
            KepokDesk
          </span>
          <span aria-hidden="true" className="text-[#9CA3AF]">/</span>
          <span className="font-mono text-xs font-semibold text-[#111214] whitespace-nowrap">
            {authCode}
          </span>
          <span aria-hidden="true" className="text-[#D6D6CE]">·</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#15803D] whitespace-nowrap">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {phase === 'connected' ? 'E2EE Verified' : 'Reconnecting'}
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-[#D6D6CE]">·</span>
          <span className="hidden sm:inline font-mono text-xs text-[#4B5058] whitespace-nowrap tabular-nums">
            {transportMode === 'webrtc-p2p' ? 'Direct P2P' : 'E2EE Relay'}
            {rttMs !== null ? ` · ${rttMs} ms` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleMic}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              voice.micEnabled
                ? 'bg-[#15803D] text-white hover:bg-[#166534]'
                : 'border border-[#D6D6CE] bg-[#F7F7F4] text-[#111214] hover:border-[#111214]'
            }`}
          >
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            {voice.micEnabled ? 'Voice Live' : 'Start Voice'}
          </button>

          <button
            type="button"
            onClick={onToggleSpeakerMute}
            aria-label={voice.speakerMuted ? 'Unmute peer audio' : 'Mute peer audio'}
            className={`rounded-[2px] border p-1.5 transition-colors shrink-0 ${
              voice.speakerMuted
                ? 'border-[#B45309] bg-[#FEF3C7] text-[#92400E]'
                : 'border-[#D6D6CE] bg-[#F7F7F4] text-[#111214] hover:border-[#111214]'
            }`}
          >
            {voice.speakerMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onDisconnect}
            className="flex items-center gap-1.5 rounded-[2px] border border-[#B91C1C] bg-white px-3 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-[#B91C1C] hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <PhoneOff className="h-3.5 w-3.5" aria-hidden="true" />
            Disconnect
          </button>
        </div>
      </header>

      {(errorBanner || voice.error) && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 border-b border-[#B45309] bg-[#FFFBEB] px-5 py-2 text-xs text-[#92400E]"
        >
          <span>{errorBanner || voice.error}</span>
          {errorBanner && (
            <button
              type="button"
              onClick={onDismissError}
              className="font-medium underline hover:text-[#111214]"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Remote Screen / Host Broadcast Surface */}
        <section
          aria-label="Remote Screen Viewport"
          className="relative min-h-[320px] flex-1 min-w-0 bg-[#141619]"
        >
          {role === 'host' ? (
            <HostWorkspaceCanvas
              screenMode={screenMode}
              localVideoStream={localVideoStream}
              remotePointer={remotePointer}
              subscribeRemotePointer={subscribeRemotePointer}
              subscribeRemoteKeys={subscribeRemoteKeys}
              hostFiles={hostFiles}
              execLogs={execLogs}
              deviceName={deviceName}
              peerName={peerName}
              agentToken={agentToken}
              hostAgentStatus={hostAgentStatus}
              onConnectAgent={onConnectAgent}
              onDisconnectAgent={onDisconnectAgent}
              onStartDisplayShare={onStartDisplayShare}
              onStartWorkspaceStream={onStartWorkspaceStream}
              onStopShare={onStopShare}
              onWorkspaceFrame={onWorkspaceFrame}
              onRefreshHostFiles={onRefreshHostFiles}
            />
          ) : (
            <RemoteViewport
              remoteVideoStream={remoteVideoStream}
              remoteFallbackFrame={remoteFallbackFrame}
              remoteScreenMode={remoteScreenMode}
              remoteAgentStatus={remoteAgentStatus}
              peerName={peerName}
              remoteControlEnabled={remoteControlEnabled}
              onToggleRemoteControl={onToggleRemoteControl}
              onSendPointer={onSendPointer}
              onSendKey={onSendKey}
            />
          )}

          <HostMetricsOverlay
            metrics={hostMetrics}
            rttMs={rttMs}
            hostLabel={role === 'host' ? deviceName : peerName}
          />
        </section>

        {/* Collaboration & Control Sidebar */}
        <aside
          aria-label="Session Collaboration Controls"
          className="flex h-[380px] w-full flex-col border-t border-[#D6D6CE] bg-white lg:h-full lg:w-[400px] xl:w-[420px] lg:border-t-0 lg:border-l shrink-0"
        >
          {/* Segmented Sidebar Tabs */}
          <div
            role="tablist"
            aria-label="Session Panels"
            className="grid grid-cols-3 gap-1 border-b border-[#D6D6CE] bg-[#F7F7F4] p-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              onClick={() => setActiveTab('chat')}
              className={`flex items-center justify-center gap-1.5 rounded-[2px] px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'chat'
                  ? 'bg-[#111214] text-white'
                  : 'text-[#4B5058] hover:text-[#111214]'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              Chat & Files
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'programs'}
              onClick={() => setActiveTab('programs')}
              className={`flex items-center justify-center gap-1.5 rounded-[2px] px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'programs'
                  ? 'bg-[#111214] text-white'
                  : 'text-[#4B5058] hover:text-[#111214]'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              Programs
              {pendingApprovals > 0 && (
                <span className="ml-1 font-mono text-[11px] text-[#D9381E] tabular-nums">
                  ({pendingApprovals})
                </span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'security'}
              onClick={() => setActiveTab('security')}
              className={`flex items-center justify-center gap-1.5 rounded-[2px] px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'security'
                  ? 'bg-[#111214] text-white'
                  : 'text-[#4B5058] hover:text-[#111214]'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Security
            </button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'chat' && (
              <ChatAndFilesPanel
                messages={messages}
                localRole={role}
                peerName={peerName}
                onSendText={onSendChat}
                onSendFile={onSendFile}
              />
            )}

            {activeTab === 'programs' && (
              <ProgramsPanel
                localRole={role}
                execLogs={execLogs}
                allowRemoteExec={allowRemoteExec}
                setAllowRemoteExec={setAllowRemoteExec}
                autoApproveExec={autoApproveExec}
                setAutoApproveExec={setAutoApproveExec}
                onRunCommand={onRunCommand}
                onApproveExec={onApproveExec}
                onDenyExec={onDenyExec}
              />
            )}

            {activeTab === 'security' && (
              <SecurityPanel
                authCode={authCode}
                fingerprint={fingerprint}
                localRole={role}
                peerName={peerName}
                transportMode={transportMode}
                rttMs={rttMs}
                voice={voice}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
