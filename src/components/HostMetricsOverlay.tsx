import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, HardDrive } from 'lucide-react';
import type { HostMetricsSnapshot } from '../types/session';

interface HostMetricsOverlayProps {
  metrics: HostMetricsSnapshot | null;
  rttMs: number | null;
  hostLabel: string;
}

function usageColorClass(percent: number): string {
  if (percent >= 85) return 'bg-[#D9381E]';
  if (percent >= 65) return 'bg-[#D97706]';
  return 'bg-[#15803D]';
}

function usageTextClass(percent: number): string {
  if (percent >= 85) return 'text-[#FCA5A5]';
  if (percent >= 65) return 'text-[#FCD34D]';
  return 'text-[#86EFAC]';
}

export const HostMetricsOverlay: React.FC<HostMetricsOverlayProps> = ({
  metrics,
  rttMs,
  hostLabel,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      aria-label="Remote host CPU and memory usage"
      data-testid="host-metrics-overlay"
      className="pointer-events-auto absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] rounded-[2px] border border-[#32363E] bg-[#141619] px-3.5 py-2.5 text-xs text-[#E5E7EB]"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-white truncate">
            {hostLabel ? `${hostLabel} Resources` : 'Host Resources'}
          </span>
          {collapsed && metrics && (
            <span className="font-mono text-[11px] text-[#D1D5DB] tabular-nums whitespace-nowrap">
              · CPU {metrics.cpuPercent}% · MEM {metrics.memPercent}%
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand host metrics' : 'Collapse host metrics'}
          className="rounded-[2px] p-1 text-[#9CA3AF] hover:bg-[#23262D] hover:text-white transition-colors shrink-0"
        >
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-2.5 min-w-[236px] space-y-2">
          {!metrics ? (
            <p className="text-[11px] text-[#9CA3AF]">Sampling host CPU and memory...</p>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-[#9CA3AF]">
                    <Cpu className="h-3.5 w-3.5 text-[#D9381E]" aria-hidden="true" />
                    CPU ({metrics.cores} cores)
                  </span>
                  <span
                    className={`font-mono font-medium tabular-nums ${usageTextClass(
                      metrics.cpuPercent
                    )}`}
                  >
                    {metrics.cpuPercent}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden bg-[#23262D]">
                  <div
                    className={`h-full transition-all duration-300 ${usageColorClass(
                      metrics.cpuPercent
                    )}`}
                    style={{ width: `${Math.max(3, metrics.cpuPercent)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-[#9CA3AF]">
                    <HardDrive className="h-3.5 w-3.5 text-[#D9381E]" aria-hidden="true" />
                    Memory
                  </span>
                  <span className="font-mono tabular-nums text-[#E5E7EB]">
                    {metrics.memUsedGb}/{metrics.memTotalGb} GB{' '}
                    <span className={usageTextClass(metrics.memPercent)}>
                      ({metrics.memPercent}%)
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden bg-[#23262D]">
                  <div
                    className={`h-full transition-all duration-300 ${usageColorClass(
                      metrics.memPercent
                    )}`}
                    style={{ width: `${Math.max(3, metrics.memPercent)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-[#262930] pt-1.5 text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                <span>Load {metrics.loadAvg1m.toFixed(2)}</span>
                <span>{rttMs !== null ? `RTT ${rttMs} ms` : 'RTT --'}</span>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
};
