import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeContainedPointerCoords,
  getPointerTransportPriority,
} from './remoteInput';

test('computeContainedPointerCoords maps exact center and edges without letterboxing', () => {
  const rect = { left: 100, top: 50, width: 800, height: 450 };
  const center = computeContainedPointerCoords(500, 275, rect, 1920, 1080);
  assert.ok(Math.abs(center.x - 0.5) < 1e-6);
  assert.ok(Math.abs(center.y - 0.5) < 1e-6);

  const topLeft = computeContainedPointerCoords(100, 50, rect, 1920, 1080);
  assert.equal(topLeft.x, 0);
  assert.equal(topLeft.y, 0);
});

test('computeContainedPointerCoords compensates for pillarbox bars on object-contain video', () => {
  // Container is 1000x500 (2:1), video is 500x500 (1:1) -> rendered content is 500x500 centered at x=[250..750]
  const rect = { left: 0, top: 0, width: 1000, height: 500 };
  const contentLeftEdge = computeContainedPointerCoords(250, 250, rect, 500, 500);
  assert.equal(contentLeftEdge.x, 0);
  assert.equal(contentLeftEdge.y, 0.5);

  const contentRightEdge = computeContainedPointerCoords(750, 500, rect, 500, 500);
  assert.equal(contentRightEdge.x, 1);
  assert.equal(contentRightEdge.y, 1);

  // Clicking inside left pillarbox clamps cleanly to 0
  const inBar = computeContainedPointerCoords(100, 250, rect, 500, 500);
  assert.equal(inBar.x, 0);
});

test('getPointerTransportPriority routes clicks/down/up/wheel over reliable channel and move over control', () => {
  assert.equal(getPointerTransportPriority('move'), 'control');
  assert.equal(getPointerTransportPriority('down'), 'reliable');
  assert.equal(getPointerTransportPriority('up'), 'reliable');
  assert.equal(getPointerTransportPriority('click'), 'reliable');
  assert.equal(getPointerTransportPriority('dblclick'), 'reliable');
  assert.equal(getPointerTransportPriority('wheel'), 'reliable');
});
