import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRemoteCommand } from './remoteCommandPolicy';

test('validateRemoteCommand permits safe diagnostic commands and blocks destructive ones', () => {
  assert.equal(validateRemoteCommand('node -v').valid, true);
  assert.equal(validateRemoteCommand('ls -la').valid, true);
  assert.equal(validateRemoteCommand('   ').valid, false);
  assert.equal(validateRemoteCommand('rm -rf /').valid, false);
  assert.equal(validateRemoteCommand('dd if=/dev/zero of=/dev/sda').valid, false);
});
