export interface CpuTickSnapshot {
  idle: number;
  total: number;
}

export interface MemoryStats {
  usedBytes: number;
  totalBytes: number;
  usedGb: number;
  totalGb: number;
  percent: number;
}

export function sumCpuTicks(
  cpus: Array<{ times: { user: number; nice: number; sys: number; idle: number; irq: number } }>
): CpuTickSnapshot {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

export function calculateCpuUsagePercent(
  prev: CpuTickSnapshot,
  curr: CpuTickSnapshot
): number {
  const totalDelta = curr.total - prev.total;
  const idleDelta = curr.idle - prev.idle;
  if (totalDelta <= 0) {
    if (curr.total <= 0) return 0;
    const fallback = ((curr.total - curr.idle) / curr.total) * 100;
    return Math.min(100, Math.max(0, Math.round(fallback)));
  }
  const activeRatio = 1 - idleDelta / totalDelta;
  return Math.min(100, Math.max(0, Math.round(activeRatio * 100)));
}

export function computeMemoryStats(totalBytes: number, freeBytes: number): MemoryStats {
  const safeTotal = Math.max(1, totalBytes);
  const clampedFree = Math.min(safeTotal, Math.max(0, freeBytes));
  const usedBytes = safeTotal - clampedFree;
  const toGb = (bytes: number) => Number((bytes / 1024 ** 3).toFixed(1));
  return {
    usedBytes,
    totalBytes: safeTotal,
    usedGb: toGb(usedBytes),
    totalGb: toGb(safeTotal),
    percent: Math.round((usedBytes / safeTotal) * 100),
  };
}
