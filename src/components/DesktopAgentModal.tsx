import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Laptop, RefreshCw, ShieldAlert, X } from 'lucide-react';
import type { HostAgentStatus } from '../types/session';
import { detectClientOsPlatform } from '../utils/remoteInput';

interface DesktopAgentModalProps {
  open: boolean;
  onClose: () => void;
  agentToken: string;
  agentStatus: HostAgentStatus;
  onConnectAgent: (silent?: boolean) => void;
  onDisconnectAgent: () => void;
}

type OsTab = 'windows' | 'macos' | 'linux';

export const DesktopAgentModal: React.FC<DesktopAgentModalProps> = ({
  open,
  onClose,
  agentToken,
  agentStatus,
  onConnectAgent,
  onDisconnectAgent,
}) => {
  const [osTab, setOsTab] = useState<OsTab>(() => detectClientOsPlatform());
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [autoPoll, setAutoPoll] = useState(false);

  // Check once on modal open; poll every 2.5s after user triggers Download or Copy
  useEffect(() => {
    if (!open || agentStatus.connected) return;
    onConnectAgent(true);
    if (!autoPoll) return;
    const id = window.setInterval(() => {
      onConnectAgent(true);
    }, 2500);
    return () => window.clearInterval(id);
  }, [open, autoPoll, agentStatus.connected, onConnectAgent]);

  if (!open) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const winBatHref = `/api/agent/windows.bat?token=${encodeURIComponent(agentToken)}`;
  const winPsCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; irm '${origin}/api/agent/windows.ps1?token=${agentToken}' | iex"`;
  const macCommand = `curl -fsSL "${origin}/api/agent/macos.sh?token=${agentToken}" | bash`;
  const linuxCommand = `curl -fsSL "${origin}/api/agent/linux.sh?token=${agentToken}" | bash`;

  const activeCommand =
    osTab === 'windows' ? winPsCommand : osTab === 'macos' ? macCommand : linuxCommand;

  const handleCopyCommand = async () => {
    setAutoPoll(true);
    try {
      await navigator.clipboard.writeText(activeCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-agent-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111214]/75 p-4"
    >
      <div className="w-full max-w-xl rounded-[2px] border border-[#111214] bg-white p-6 text-[#111214]">
        <div className="flex items-center justify-between gap-4 border-b border-[#D6D6CE] pb-4">
          <div className="flex items-center gap-2.5">
            <Laptop className="h-5 w-5 text-[#D9381E]" aria-hidden="true" />
            <h2 id="desktop-agent-title" className="font-display text-lg font-semibold">
              Enable Real OS Clicking &amp; Typing
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close helper modal"
            className="rounded-[2px] p-1.5 text-[#4B5058] hover:bg-[#F7F7F4] hover:text-[#111214] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm text-[#4B5058] leading-relaxed">
          Browsers block web pages from clicking outside their tab for security. Run this tiny
          local KepokDesk helper on the laptop you want repaired so remote clicks, drags, scrolling,
          and keystrokes control Windows, macOS, or Linux directly.
        </p>

        {/* Live Connection Status Bar */}
        <div
          className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[2px] border px-4 py-3 text-xs ${
            agentStatus.connected
              ? 'border-[#15803D] bg-[#F0FDF4] text-[#166534]'
              : 'border-[#D6D6CE] bg-[#F7F7F4] text-[#4B5058]'
          }`}
        >
          <div>
            <p className="font-semibold text-[#111214]">
              {agentStatus.connected
                ? `OS Control Helper Connected (${agentStatus.platform || osTab})`
                : 'Waiting for Local Helper on 127.0.0.1:47890'}
            </p>
            <p className="mt-0.5 font-mono text-[11px]">
              {agentStatus.connected && agentStatus.screenWidth && agentStatus.screenHeight
                ? `Mapped Display: ${agentStatus.screenWidth}x${agentStatus.screenHeight} · Remote clicks & keys active`
                : 'Auto-checking every 2s. Keep the helper window open while repairing.'}
            </p>
          </div>

          {agentStatus.connected ? (
            <button
              type="button"
              onClick={onDisconnectAgent}
              className="rounded-[2px] border border-[#B91C1C] bg-white px-3 py-1.5 font-medium text-[#B91C1C] hover:bg-[#B91C1C] hover:text-white transition-colors shrink-0"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAutoPoll(true);
                onConnectAgent(false);
              }}
              className="flex items-center gap-1.5 rounded-[2px] border border-[#111214] bg-white px-3 py-1.5 font-medium text-[#111214] hover:bg-[#111214] hover:text-white transition-colors shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Check &amp; Connect
            </button>
          )}
        </div>

        {/* OS Tabs */}
        <div
          role="tablist"
          aria-label="Host Operating System"
          className="mt-5 grid grid-cols-3 border border-[#D6D6CE] bg-[#F7F7F4] p-1 rounded-[2px]"
        >
          {(['windows', 'macos', 'linux'] as OsTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={osTab === tab}
              onClick={() => setOsTab(tab)}
              className={`rounded-[2px] px-3 py-2 text-xs font-medium transition-colors ${
                osTab === tab
                  ? 'bg-[#111214] text-white'
                  : 'text-[#4B5058] hover:text-[#111214]'
              }`}
            >
              {tab === 'windows' ? 'Windows 10 / 11' : tab === 'macos' ? 'macOS' : 'Linux (X11)'}
            </button>
          ))}
        </div>

        {/* Instructions per OS */}
        <div className="mt-4 space-y-4">
          {osTab === 'windows' && (
            <div className="rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#111214]">
                    Step 1 (Easiest): Download &amp; Double-Click Helper
                  </p>
                  <p className="mt-0.5 text-xs text-[#4B5058]">
                    Uses built-in Windows PowerShell. No Python or extra apps needed.
                  </p>
                </div>
                <a
                  href={winBatHref}
                  download="kepokdesk-agent.bat"
                  onClick={() => setAutoPoll(true)}
                  className="flex items-center gap-1.5 rounded-[2px] bg-[#D9381E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#B82D16] transition-colors shrink-0"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download kepokdesk-agent.bat
                </a>
              </div>
              <p className="mt-2.5 text-[11px] text-[#4B5058]">
                If Windows SmartScreen appears, click <strong>More info</strong> &rarr;{' '}
                <strong>Run anyway</strong>, or paste the 1-line command below instead.
              </p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#111214]">
                {osTab === 'windows'
                  ? 'Alternative: Press Win + R, paste this command, and press Enter'
                  : 'Run this command in Terminal on the Host laptop'}
              </p>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="flex items-center gap-1 text-xs font-medium text-[#D9381E] hover:text-[#B82D16]"
              >
                {copiedCmd ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#15803D]" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy Command
                  </>
                )}
              </button>
            </div>
            <pre className="mt-1.5 whitespace-pre-wrap break-all rounded-[2px] border border-[#D6D6CE] bg-[#141619] p-3 font-mono text-[11px] leading-relaxed text-[#F7F7F4] select-all">
              {activeCommand}
            </pre>
          </div>

          {osTab === 'macos' && (
            <div className="flex items-start gap-2 rounded-[2px] border border-[#D6D6CE] bg-[#FFFBEB] px-3 py-2.5 text-xs text-[#92400E]">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                macOS requires Accessibility access for Terminal in{' '}
                <strong>System Settings &rarr; Privacy &amp; Security &rarr; Accessibility</strong>.
              </span>
            </div>
          )}

          {osTab === 'linux' && (
            <div className="flex items-start gap-2 rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] px-3 py-2.5 text-xs text-[#4B5058]">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#D9381E]" aria-hidden="true" />
              <span>
                Requires <code className="font-mono text-[#111214]">python3</code> and{' '}
                <code className="font-mono text-[#111214]">xdotool</code> on X11 sessions.
              </span>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-[#D6D6CE] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[2px] border border-[#111214] bg-white px-4 py-2 text-xs font-semibold text-[#111214] hover:bg-[#111214] hover:text-white transition-colors"
          >
            {agentStatus.connected ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
