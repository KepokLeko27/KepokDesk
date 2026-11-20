import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCpuUsagePercent,
  computeMemoryStats,
  sumCpuTicks,
} from './systemMetrics';

test('calculateCpuUsagePercent computes accurate delta percentage', () => {
  const prev = { idle: 1000, total: 2000 };
  const curr = { idle: 1250, total: 3000 }; // totalDelta=1000, idleDelta=250 -> 75% busy
  assert.equal(calculateCpuUsagePercent(prev, curr), 75);
});

test('calculateCpuUsagePercent clamps bounds when delta is zero or negative', () => {
  assert.equal(calculateCpuUsagePercent({ idle: 500, total: 1000 }, { idle: 500, total: 1000 }), 50);
  assert.equal(calculateCpuUsagePercent({ idle: 0, total: 0 }, { idle: 0, total: 0 }), 0);
});

test('sumCpuTicks aggregates multi-core CPU times', () => {
  const totals = sumCpuTicks([
    { times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
    { times: { user: 200, nice: 10, sys: 40, idle: 750, irq: 0 } },
  ]);
  assert.equal(totals.idle, 1600);
  assert.equal(totals.total, 2000);
});

test('computeMemoryStats calculates GB and percentage accurately', () => {
  const gib = 1024 ** 3;
  const stats = computeMemoryStats(16 * gib, 4 * gib);
  assert.equal(stats.totalGb, 16);
  assert.equal(stats.usedGb, 12);
  assert.equal(stats.percent, 75);
});
