import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Keyboard,
  Maximize2,
  Minimize2,
  Monitor,
  MousePointer,
  MousePointerClick,
} from 'lucide-react';
import type {
  HostAgentStatus,
  RemoteKeyEvent,
  RemotePointerEvent,
  ScreenSourceMode,
} from '../types/session';
import { computeContainedPointerCoords } from '../utils/remoteInput';

interface RemoteViewportProps {
  remoteVideoStream: MediaStream | null;
  remoteFallbackFrame: string | null;
  remoteScreenMode: ScreenSourceMode;
  remoteAgentStatus: HostAgentStatus;
  peerName: string;
  remoteControlEnabled: boolean;
  onToggleRemoteControl: () => void;
  onSendPointer: (evt: RemotePointerEvent) => void;
  onSendKey: (evt: RemoteKeyEvent) => void;
}

export const RemoteViewport: React.FC<RemoteViewportProps> = ({
  remoteVideoStream,
  remoteFallbackFrame,
  remoteScreenMode,
  remoteAgentStatus,
  peerName,
  remoteControlEnabled,
  onToggleRemoteControl,
  onSendPointer,
  onSendKey,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [hasVideoTrackFrames, setHasVideoTrackFrames] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [localClickPulse, setLocalClickPulse] = useState<{ x: number; y: number } | null>(null);
  const lastMoveSentRef = useRef<number>(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (remoteVideoStream) {
      video.srcObject = remoteVideoStream;
      const checkReady = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          setHasVideoTrackFrames(true);
        }
      };
      video.addEventListener('loadeddata', checkReady);
      video.addEventListener('resize', checkReady);
      return () => {
        video.removeEventListener('loadeddata', checkReady);
        video.removeEventListener('resize', checkReady);
      };
    } else {
      video.srcObject = null;
      setHasVideoTrackFrames(false);
    }
  }, [remoteVideoStream]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen restricted in embedded preview
    }
  };

  const getNormalizedCoords = (e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } => {
    if (hasVideoTrackFrames && videoRef.current) {
      const rect = videoRef.current.getBoundingClientRect();
      return computeContainedPointerCoords(
        e.clientX,
        e.clientY,
        rect,
        videoRef.current.videoWidth,
        videoRef.current.videoHeight
      );
    }
    if (remoteFallbackFrame && imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      return computeContainedPointerCoords(
        e.clientX,
        e.clientY,
        rect,
        imgRef.current.naturalWidth,
        imgRef.current.naturalHeight
      );
    }
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    return computeContainedPointerCoords(e.clientX, e.clientY, rect, 0, 0);
  };

  const triggerClickPulse = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    setLocalClickPulse({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    window.setTimeout(() => setLocalClickPulse(null), 260);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!remoteControlEnabled) return;
    const now = performance.now();
    if (now - lastMoveSentRef.current < 16) return;
    lastMoveSentRef.current = now;
    const { x, y } = getNormalizedCoords(e);
    onSendPointer({ kind: 'move', x, y, ts: Date.now() });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    surfaceRef.current?.focus();
    setInputFocused(true);
    if (!remoteControlEnabled) return;
    e.preventDefault();
    triggerClickPulse(e);
    const { x, y } = getNormalizedCoords(e);
    onSendPointer({ kind: 'down', x, y, button: e.button, ts: Date.now() });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!remoteControlEnabled) return;
    e.preventDefault();
    const { x, y } = getNormalizedCoords(e);
    onSendPointer({ kind: 'up', x, y, button: e.button, ts: Date.now() });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!remoteControlEnabled) return;
    e.preventDefault();
    const { x, y } = getNormalizedCoords(e);
    onSendPointer({ kind: 'dblclick', x, y, button: e.button, ts: Date.now() });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (remoteControlEnabled) {
      e.preventDefault();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!remoteControlEnabled) return;
    const { x, y } = getNormalizedCoords(e);
    onSendPointer({ kind: 'wheel', x, y, deltaY: e.deltaY, ts: Date.now() });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!remoteControlEnabled || !inputFocused) return;
    if (
      e.key === 'Tab' ||
      e.key === 'Backspace' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === ' '
    ) {
      e.preventDefault();
    }
    onSendKey({
      kind: 'keydown',
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      ts: Date.now(),
    });
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!remoteControlEnabled || !inputFocused) return;
    onSendKey({
      kind: 'keyup',
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      ts: Date.now(),
    });
  };

  const sendQuickKey = (key: string) => {
    onSendKey({ kind: 'keydown', key, ts: Date.now() });
    window.setTimeout(() => {
      onSendKey({ kind: 'keyup', key, ts: Date.now() });
    }, 35);
    surfaceRef.current?.focus();
    setInputFocused(true);
  };

  const streamAvailable = hasVideoTrackFrames || Boolean(remoteFallbackFrame);

  return (
    <div ref={containerRef} className="flex h-full w-full flex-col bg-[#141619]">
      {/* Viewport Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2A2D34] bg-[#1A1D22] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#D1D5DB]">
          <span className="font-medium text-white">
            Remote View · {peerName || 'Host'}
          </span>
          <span aria-hidden="true" className="text-[#4B5058]">·</span>
          <span>
            {remoteScreenMode === 'display'
              ? 'OS Screen Stream'
              : remoteScreenMode === 'workspace'
                ? 'Interactive Workspace'
                : 'Awaiting Host Stream'}
          </span>
          {remoteScreenMode === 'display' && (
            <>
              <span aria-hidden="true" className="text-[#4B5058]">·</span>
              {remoteAgentStatus.connected ? (
                <span className="flex items-center gap-1 font-mono text-[11px] text-[#86EFAC]">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  OS Clicks Ready ({remoteAgentStatus.platform || 'host'})
                </span>
              ) : (
                <span className="font-mono text-[11px] text-[#FCD34D]">
                  Cursor Only · Host OS Helper Not Active
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {remoteControlEnabled && remoteScreenMode === 'display' && remoteAgentStatus.connected && (
            <div className="hidden sm:flex items-center gap-1 border-r border-[#32363E] pr-2">
              <Keyboard className="h-3.5 w-3.5 text-[#9CA3AF] mr-0.5" aria-hidden="true" />
              <button
                type="button"
                onClick={() => sendQuickKey('Meta')}
                className="rounded-[2px] border border-[#32363E] bg-[#141619] px-2 py-1 font-mono text-[11px] text-[#D1D5DB] hover:border-white hover:text-white"
              >
                Win/Cmd
              </button>
              <button
                type="button"
                onClick={() => sendQuickKey('Escape')}
                className="rounded-[2px] border border-[#32363E] bg-[#141619] px-2 py-1 font-mono text-[11px] text-[#D1D5DB] hover:border-white hover:text-white"
              >
                Esc
              </button>
              <button
                type="button"
                onClick={() => sendQuickKey('Tab')}
                className="rounded-[2px] border border-[#32363E] bg-[#141619] px-2 py-1 font-mono text-[11px] text-[#D1D5DB] hover:border-white hover:text-white"
              >
                Tab
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleRemoteControl}
            className={`flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              remoteControlEnabled
                ? 'bg-[#D9381E] text-white'
                : 'border border-[#32363E] bg-[#141619] text-[#D1D5DB] hover:border-white'
            }`}
          >
            {remoteControlEnabled ? (
              <>
                <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
                Input Control Active
              </>
            ) : (
              <>
                <MousePointer className="h-3.5 w-3.5" aria-hidden="true" />
                View Only
              </>
            )}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="rounded-[2px] border border-[#32363E] bg-[#141619] p-1.5 text-[#E5E7EB] hover:border-white transition-colors shrink-0"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Warning banner when Host shares OS screen without running the OS control helper */}
      {remoteScreenMode === 'display' && !remoteAgentStatus.connected && (
        <div className="border-b border-[#32363E] bg-[#1E1A12] px-4 py-2 text-xs text-[#FCD34D]">
          Host is sharing their OS screen without the local OS Control Helper. Your mouse cursor
          moves on their screen, but clicks cannot control Windows/macOS until the Host clicks{' '}
          <strong className="text-white">Enable OS Clicking</strong>.
        </div>
      )}

      {/* Screen Surface */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        <div
          ref={surfaceRef}
          tabIndex={0}
          role="application"
          aria-label="Remote device screen surface"
          data-testid="remote-screen-surface"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onDragStart={(e) => e.preventDefault()}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          className={`relative flex max-h-full max-w-full items-center justify-center rounded-[2px] border select-none focus:outline-none ${
            inputFocused && remoteControlEnabled
              ? 'border-[#D9381E]'
              : 'border-[#2A2D34]'
          } ${remoteControlEnabled && streamAvailable ? 'cursor-crosshair' : 'cursor-default'}`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`max-h-[calc(100vh-140px)] max-w-full object-contain ${
              hasVideoTrackFrames ? 'block' : 'hidden'
            }`}
          />

          {!hasVideoTrackFrames && remoteFallbackFrame && (
            <img
              ref={imgRef}
              src={remoteFallbackFrame}
              alt="Live remote screen frame"
              referrerPolicy="no-referrer"
              draggable={false}
              className="max-h-[calc(100vh-140px)] max-w-full object-contain select-none"
            />
          )}

          {localClickPulse && (
            <span
              aria-hidden="true"
              style={{ left: localClickPulse.x, top: localClickPulse.y }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 h-6 w-6 rounded-full border-2 border-[#D9381E]"
            />
          )}

          {!streamAvailable && (
            <div className="flex flex-col items-center justify-center px-10 py-16 text-center">
              <Monitor className="h-10 w-10 text-[#6E747E]" aria-hidden="true" />
              <p className="mt-4 font-display text-base font-medium text-white">
                Waiting for {peerName || 'Host'} to start sharing their screen
              </p>
              <p className="mt-1.5 max-w-sm text-xs text-[#9CA3AF] leading-relaxed">
                Ask the Host to click &ldquo;Share System Screen&rdquo; or &ldquo;Share Workspace&rdquo;.
                Encrypted chat, file transfer, voice, and remote programs are already live.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
