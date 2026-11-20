import React, { useState } from 'react';
import { Check, Play, ShieldAlert, Terminal, X } from 'lucide-react';
import type { PeerRole, RemoteExecRequest } from '../types/session';
import { PROGRAM_PRESETS } from '../utils/remoteCommandPolicy';

interface ProgramsPanelProps {
  localRole: PeerRole;
  execLogs: RemoteExecRequest[];
  allowRemoteExec: boolean;
  setAllowRemoteExec: (v: boolean) => void;
  autoApproveExec: boolean;
  setAutoApproveExec: (v: boolean) => void;
  onRunCommand: (command: string) => Promise<void>;
  onApproveExec: (execId: string) => Promise<void>;
  onDenyExec: (execId: string) => Promise<void>;
}

export const ProgramsPanel: React.FC<ProgramsPanelProps> = ({
  localRole,
  execLogs,
  allowRemoteExec,
  setAllowRemoteExec,
  autoApproveExec,
  setAutoApproveExec,
  onRunCommand,
  onApproveExec,
  onDenyExec,
}) => {
  const [commandInput, setCommandInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    const cmd = commandInput;
    setCommandInput('');
    await onRunCommand(cmd);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Host Authorization Policy Controls */}
      {localRole === 'host' && (
        <div className="border-b border-[#D6D6CE] bg-[#F7F7F4] p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="allow-remote-exec" className="text-xs font-medium text-[#111214]">
              Permit remote program execution
            </label>
            <input
              id="allow-remote-exec"
              type="checkbox"
              checked={allowRemoteExec}
              onChange={(e) => setAllowRemoteExec(e.target.checked)}
              className="h-4 w-4 accent-[#D9381E]"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="auto-approve-exec" className="text-xs text-[#4B5058]">
              Auto-run without per-command prompt
            </label>
            <input
              id="auto-approve-exec"
              type="checkbox"
              disabled={!allowRemoteExec}
              checked={autoApproveExec}
              onChange={(e) => setAutoApproveExec(e.target.checked)}
              className="h-4 w-4 accent-[#D9381E] disabled:opacity-40"
            />
          </div>
        </div>
      )}

      {/* Quick Program Presets */}
      <div className="border-b border-[#D6D6CE] p-4">
        <p className="text-xs font-medium text-[#4B5058]">Quick Programs & Diagnostics</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {PROGRAM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onRunCommand(preset.command)}
              title={preset.description}
              className="flex items-center justify-between gap-2 rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] px-3 py-2 text-left text-xs font-medium text-[#111214] hover:border-[#111214] hover:bg-white transition-colors"
            >
              <span className="truncate">{preset.label}</span>
              <Play className="h-3 w-3 shrink-0 text-[#D9381E]" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {/* Execution History & Terminal Output */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {execLogs.length === 0 ? (
          <div className="rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] p-5 text-center">
            <Terminal className="mx-auto h-6 w-6 text-[#6E747E]" aria-hidden="true" />
            <p className="mt-2.5 text-sm font-medium text-[#111214]">No remote programs run yet</p>
            <p className="mt-1 text-xs text-[#4B5058] leading-relaxed">
              Launch a preset or enter a command below to execute it on the Host device over the
              encrypted channel.
            </p>
          </div>
        ) : (
          execLogs.map((entry) => (
            <div
              key={entry.execId}
              className="rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <code className="break-all font-mono text-xs font-semibold text-[#111214]">
                  $ {entry.command}
                </code>
                <span
                  className={`text-[11px] font-mono font-semibold whitespace-nowrap shrink-0 ${
                    entry.status === 'completed'
                      ? 'text-[#15803D]'
                      : entry.status === 'denied' || entry.status === 'error'
                        ? 'text-[#B91C1C]'
                        : 'text-[#B45309]'
                  }`}
                >
                  {entry.status === 'pending-approval'
                    ? 'Awaiting Host'
                    : entry.status === 'running'
                      ? 'Running'
                      : entry.status === 'completed'
                        ? `Exit ${entry.exitCode ?? 0}`
                        : entry.status === 'denied'
                          ? 'Denied'
                          : `Error ${entry.exitCode ?? 1}`}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#6E747E] font-mono tabular-nums">
                <span>{entry.requestedBy}</span>
                {entry.durationMs !== undefined && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{entry.durationMs} ms</span>
                  </>
                )}
              </div>

              {/* Host Approval Prompt */}
              {localRole === 'host' && entry.status === 'pending-approval' && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-[2px] border border-[#B45309] bg-[#FFFBEB] p-2.5">
                  <div className="flex items-center gap-2 text-xs text-[#92400E]">
                    <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Approve remote execution?</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onApproveExec(entry.execId)}
                      className="flex items-center gap-1 rounded-[2px] bg-[#15803D] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#166534] transition-colors"
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onDenyExec(entry.execId)}
                      className="flex items-center gap-1 rounded-[2px] border border-[#D6D6CE] bg-white px-2.5 py-1 text-xs font-medium text-[#111214] hover:border-[#111214] transition-colors"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      Deny
                    </button>
                  </div>
                </div>
              )}

              {(entry.stdout || entry.stderr) && (
                <pre className="mt-2.5 max-h-48 overflow-auto rounded-[2px] border border-[#2A2D34] bg-[#141619] p-2.5 font-mono text-[11px] leading-relaxed text-[#F7F7F4]">
                  {entry.stdout}
                  {entry.stderr ? `\n${entry.stderr}` : ''}
                </pre>
              )}
            </div>
          ))
        )}
      </div>

      {/* Custom Command Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-[#D6D6CE] bg-[#F7F7F4] p-3"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="Run command on host (e.g. node -v)"
            aria-label="Remote command input"
            className="flex-1 rounded-[2px] border border-[#D6D6CE] bg-white px-3 py-2 font-mono text-xs text-[#111214] placeholder:text-[#6E747E] focus:border-[#111214] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!commandInput.trim()}
            className="rounded-[2px] bg-[#D9381E] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#B82D16] transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            Run
          </button>
        </div>
      </form>
    </div>
  );
};
