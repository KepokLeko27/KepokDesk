import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  LayoutGrid,
  Monitor,
  MonitorOff,
  MousePointer2,
  MousePointerClick,
} from 'lucide-react';
import type {
  HostAgentStatus,
  HostWorkspaceFile,
  RemoteExecRequest,
  RemoteKeyEvent,
  RemotePointerEvent,
  ScreenSourceMode,
} from '../types/session';
import { DesktopAgentModal } from './DesktopAgentModal';

interface HostWorkspaceCanvasProps {
  screenMode: ScreenSourceMode;
  localVideoStream: MediaStream | null;
  remotePointer: RemotePointerEvent | null;
  subscribeRemotePointer: (listener: (evt: RemotePointerEvent) => void) => () => void;
  subscribeRemoteKeys: (listener: (evt: RemoteKeyEvent) => void) => () => void;
  hostFiles: HostWorkspaceFile[];
  execLogs: RemoteExecRequest[];
  deviceName: string;
  peerName: string;
  agentToken: string;
  hostAgentStatus: HostAgentStatus;
  onConnectAgent: (silent?: boolean) => void;
  onDisconnectAgent: () => void;
  onStartDisplayShare: () => void;
  onStartWorkspaceStream: (canvas: HTMLCanvasElement | null) => void;
  onStopShare: () => void;
  onWorkspaceFrame: (canvas: HTMLCanvasElement) => void;
  onRefreshHostFiles: () => void;
}

function wrapTextLines(text: string, maxChars: number): string[] {
  const result: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= maxChars) {
      result.push(rawLine);
      continue;
    }
    let current = '';
    for (const word of rawLine.split(' ')) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= maxChars) {
        current += ` ${word}`;
      } else {
        result.push(current);
        current = word;
      }
    }
    if (current) result.push(current);
  }
  return result;
}

export const HostWorkspaceCanvas: React.FC<HostWorkspaceCanvasProps> = ({
  screenMode,
  localVideoStream,
  remotePointer,
  subscribeRemotePointer,
  subscribeRemoteKeys,
  hostFiles,
  execLogs,
  deviceName,
  peerName,
  agentToken,
  hostAgentStatus,
  onConnectAgent,
  onDisconnectAgent,
  onStartDisplayShare,
  onStartWorkspaceStream,
  onStopShare,
  onWorkspaceFrame,
  onRefreshHostFiles,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scratchpadText, setScratchpadText] = useState<string>(
    'Remote Scratchpad ready. Click this viewport on the Controller device and type to edit live.'
  );
  const [activeWindow, setActiveWindow] = useState<'notes' | 'files' | 'terminal'>('notes');
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);
  const [clickPulse, setClickPulse] = useState<{ x: number; y: number; ts: number } | null>(null);
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  useEffect(() => {
    onRefreshHostFiles();
  }, [onRefreshHostFiles]);

  useEffect(() => {
    if (videoRef.current && localVideoStream && screenMode === 'display') {
      videoRef.current.srcObject = localVideoStream;
    }
  }, [localVideoStream, screenMode]);

  useEffect(() => {
    return subscribeRemoteKeys((evt) => {
      if (evt.kind !== 'keydown') return;
      if (evt.key === 'Backspace') {
        setScratchpadText((prev) => prev.slice(0, -1));
      } else if (evt.key === 'Enter') {
        setScratchpadText((prev) => `${prev}\n`);
      } else if (evt.key.length === 1 && !evt.ctrlKey && !evt.metaKey) {
        setScratchpadText((prev) => `${prev}${evt.key}`);
      }
    });
  }, [subscribeRemoteKeys]);

  // Subscribe directly so discrete mouse down/click events are never swallowed by React batching
  useEffect(() => {
    return subscribeRemotePointer((evt) => {
      if (evt.kind !== 'down' && evt.kind !== 'click') return;
      setClickPulse({ x: evt.x, y: evt.y, ts: Date.now() });

      // Match exact canvas tab boxes in 1280x720 coordinates
      const px = evt.x * 1280;
      const py = evt.y * 720;
      if (py >= 64 && py <= 114) {
        if (px >= 48 && px <= 264) {
          setActiveWindow('notes');
        } else if (px >= 278 && px <= 494) {
          setActiveWindow('files');
          onRefreshHostFiles();
        } else if (px >= 508 && px <= 724) {
          setActiveWindow('terminal');
        }
      } else if (py >= 180 && py <= 640 && px >= 60 && px <= 1200) {
        const row = Math.floor((py - 184) / 30);
        if (row >= 0) {
          setSelectedFileIdx(row);
        }
      }
    });
  }, [subscribeRemotePointer, onRefreshHostFiles]);

  useEffect(() => {
    if (screenMode !== 'workspace') return;
    let rafId = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;

      ctx.fillStyle = '#141619';
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < W; gx += 64) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += 64) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      ctx.fillStyle = '#1D2025';
      ctx.fillRect(0, 0, W, 48);
      ctx.fillStyle = '#F7F7F4';
      ctx.font = '600 16px "Bricolage Grotesque", sans-serif';
      ctx.fillText(`Host Workspace · ${deviceName}`, 24, 30);

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '500 14px "IBM Plex Mono", monospace';
      ctx.fillText(new Date().toLocaleTimeString(), W - 140, 30);

      const tabs: Array<{ id: 'notes' | 'files' | 'terminal'; label: string; x: number }> = [
        { id: 'notes', label: '01. Live Scratchpad', x: 52 },
        { id: 'files', label: '02. Host Files', x: 282 },
        { id: 'terminal', label: '03. Program Output', x: 512 },
      ];

      tabs.forEach((tab) => {
        const isActive = activeWindow === tab.id;
        ctx.fillStyle = isActive ? '#D9381E' : '#1D2025';
        ctx.fillRect(tab.x, 68, 210, 40);
        ctx.strokeStyle = isActive ? '#D9381E' : '#32363E';
        ctx.strokeRect(tab.x, 68, 210, 40);
        ctx.fillStyle = isActive ? '#FFFFFF' : '#D1D5DB';
        ctx.font = '600 14px "Public Sans", sans-serif';
        ctx.fillText(tab.label, tab.x + 18, 93);
      });

      ctx.fillStyle = '#0F1114';
      ctx.fillRect(52, 124, W - 104, H - 180);
      ctx.strokeStyle = '#32363E';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(52, 124, W - 104, H - 180);

      if (activeWindow === 'notes') {
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '600 14px "Public Sans", sans-serif';
        ctx.fillText('Interactive Shared Editor (Controlled Remotely)', 80, 162);

        ctx.fillStyle = '#F7F7F4';
        ctx.font = '400 18px "IBM Plex Mono", monospace';
        const wrappedLines = wrapTextLines(scratchpadText, 76);
        let lineY = 206;
        for (const segment of wrappedLines) {
          if (lineY > H - 90) break;
          ctx.fillText(segment, 80, lineY);
          lineY += 28;
        }
      } else if (activeWindow === 'files') {
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '600 14px "Public Sans", sans-serif';
        ctx.fillText(`Host Directory (${hostFiles.length} items)`, 80, 162);

        let fy = 204;
        hostFiles.slice(0, 14).forEach((file, idx) => {
          if (idx === selectedFileIdx) {
            ctx.fillStyle = 'rgba(217, 56, 30, 0.16)';
            ctx.fillRect(72, fy - 20, W - 144, 28);
          }
          ctx.fillStyle = file.type === 'dir' ? '#D9381E' : '#F7F7F4';
          ctx.font = '500 15px "IBM Plex Mono", monospace';
          ctx.fillText(`${file.type === 'dir' ? '[DIR] ' : '      '}${file.name}`, 80, fy);
          if (file.type === 'file') {
            ctx.fillStyle = '#9CA3AF';
            ctx.fillText(`${file.size} B`, W - 220, fy);
          }
          fy += 30;
        });
      } else {
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '600 14px "Public Sans", sans-serif';
        ctx.fillText('Recent Remote Execution Output', 80, 162);

        const latest = execLogs[0];
        if (!latest) {
          ctx.fillStyle = '#6E747E';
          ctx.font = '400 15px "IBM Plex Mono", monospace';
          ctx.fillText('No commands executed yet. Run a program from the Programs tab.', 80, 206);
        } else {
          ctx.fillStyle = '#FCD34D';
          ctx.font = '600 16px "IBM Plex Mono", monospace';
          ctx.fillText(`$ ${latest.command}  [${latest.status}]`, 80, 206);

          const out = (latest.stdout || latest.stderr || '').split('\n').slice(0, 12);
          let oy = 242;
          ctx.fillStyle = latest.stderr && !latest.stdout ? '#FCA5A5' : '#F7F7F4';
          ctx.font = '400 14px "IBM Plex Mono", monospace';
          out.forEach((line) => {
            ctx.fillText(line.slice(0, 96), 80, oy);
            oy += 24;
          });
        }
      }

      if (remotePointer) {
        const px = remotePointer.x * W;
        const py = remotePointer.y * H;

        if (clickPulse && Date.now() - clickPulse.ts < 350) {
          ctx.strokeStyle = '#D9381E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 18, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = '#D9381E';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + 20);
        ctx.lineTo(px + 6, py + 15);
        ctx.lineTo(px + 14, py + 15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#D9381E';
        ctx.fillRect(px + 16, py + 16, 118, 22);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 11px "Public Sans", sans-serif';
        ctx.fillText((peerName || 'Remote').slice(0, 14), px + 22, py + 31);
      }

      onWorkspaceFrame(canvas);
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [
    screenMode,
    deviceName,
    activeWindow,
    selectedFileIdx,
    scratchpadText,
    hostFiles,
    execLogs,
    remotePointer,
    peerName,
    clickPulse,
    onWorkspaceFrame,
  ]);

  return (
    <div className="relative flex h-full w-full flex-col bg-[#141619]">
      {/* Viewport Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2A2D34] bg-[#1A1D22] px-4 py-2.5">
        <div className="flex items-center gap-3 text-xs text-[#D1D5DB]">
          <span className="font-medium text-white">Host Broadcast</span>
          <span aria-hidden="true" className="text-[#4B5058]">·</span>
          <span>
            {screenMode === 'display'
              ? 'Streaming System Screen'
              : screenMode === 'workspace'
                ? 'Streaming Interactive Workspace'
                : 'Screen Share Paused'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAgentModalOpen(true)}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              hostAgentStatus.connected
                ? 'bg-[#15803D] text-white hover:bg-[#166534]'
                : 'border border-[#D9381E] bg-[#2D1412] text-[#FCA5A5] hover:bg-[#D9381E] hover:text-white'
            }`}
          >
            {hostAgentStatus.connected ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                OS Clicks Active
              </>
            ) : (
              <>
                <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
                Enable OS Clicking
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onStartDisplayShare}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              screenMode === 'display'
                ? 'bg-[#D9381E] text-white'
                : 'border border-[#32363E] bg-[#141619] text-[#E5E7EB] hover:border-white'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
            Share System Screen
          </button>

          <button
            type="button"
            onClick={() => onStartWorkspaceStream(canvasRef.current)}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              screenMode === 'workspace'
                ? 'bg-[#D9381E] text-white'
                : 'border border-[#32363E] bg-[#141619] text-[#E5E7EB] hover:border-white'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            Share Workspace
          </button>

          {screenMode !== 'none' && (
            <button
              type="button"
              onClick={onStopShare}
              className="flex items-center gap-1.5 rounded-[2px] border border-[#D9381E] bg-[#2D1412] px-3 py-1.5 text-xs font-medium text-[#FCA5A5] hover:bg-[#D9381E] hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <MonitorOff className="h-3.5 w-3.5" aria-hidden="true" />
              Stop Share
            </button>
          )}
        </div>
      </div>

      {/* Prompt when Host shares full OS screen without running the local OS clicking helper */}
      {screenMode === 'display' && !hostAgentStatus.connected && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#32363E] bg-[#1E1A12] px-4 py-2 text-xs text-[#FCD34D]">
          <span>
            Your partner can see your screen, but browsers block web pages from clicking Windows/macOS
            apps. Start the 1-step local helper to let them click and type on this laptop.
          </span>
          <button
            type="button"
            onClick={() => setAgentModalOpen(true)}
            className="rounded-[2px] bg-[#D9381E] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#B82D16] shrink-0"
          >
            Setup OS Clicking
          </button>
        </div>
      )}

      {/* Main Broadcast Surface */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          data-testid="host-workspace-canvas"
          className={`max-h-full max-w-full rounded-[2px] border border-[#2A2D34] object-contain ${
            screenMode === 'workspace' ? 'block' : 'hidden'
          }`}
        />

        {screenMode === 'display' && (
          <div className="relative flex h-full w-full items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="max-h-full max-w-full rounded-[2px] border border-[#2A2D34] bg-black object-contain"
            />
            {remotePointer && (
              <div
                style={{
                  left: `${remotePointer.x * 100}%`,
                  top: `${remotePointer.y * 100}%`,
                }}
                className="pointer-events-none absolute -translate-x-1 -translate-y-1 flex items-center gap-1"
              >
                <MousePointer2 className="h-5 w-5 text-[#D9381E]" />
                <span className="rounded-[2px] bg-[#D9381E] px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {peerName || 'Remote'}
                </span>
              </div>
            )}
          </div>
        )}

        {screenMode === 'none' && (
          <div className="max-w-md text-center">
            <Monitor className="mx-auto h-10 w-10 text-[#6E747E]" aria-hidden="true" />
            <h2 className="mt-4 font-display text-lg font-semibold text-white">
              Choose what to share with {peerName || 'your peer'}
            </h2>
            <p className="mt-2 text-sm text-[#9CA3AF] leading-relaxed">
              Share your full OS display via WebRTC (plus the 1-step OS Clicking Helper for real
              desktop repair), or start the Interactive Workspace inside the browser.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onStartDisplayShare}
                className="rounded-[2px] bg-[#D9381E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B82D16] transition-colors"
              >
                Share System Screen
              </button>
              <button
                type="button"
                onClick={() => setAgentModalOpen(true)}
                className="rounded-[2px] border border-[#4B5058] bg-[#1D2025] px-4 py-2.5 text-sm font-medium text-[#E5E7EB] hover:border-white transition-colors"
              >
                Enable OS Clicking
              </button>
            </div>
          </div>
        )}
      </div>

      <DesktopAgentModal
        open={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
        agentToken={agentToken}
        agentStatus={hostAgentStatus}
        onConnectAgent={onConnectAgent}
        onDisconnectAgent={onDisconnectAgent}
      />
    </div>
  );
};
