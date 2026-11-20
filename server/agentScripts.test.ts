import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinuxAgentScript,
  buildMacOsAgentScript,
  buildWindowsBatLauncher,
  buildWindowsPowerShellAgent,
  sanitizeAgentToken,
} from './agentScripts.ts';

test('buildWindowsPowerShellAgent generates clean C# without invalid backslashes or non-ASCII chars', () => {
  const ps = buildWindowsPowerShellAgent('tok_1234!');
  assert.ok(ps.includes("$AgentToken = 'tok_1234'"));

  const csharpMatch = ps.match(/\$csharp = @'\n([\s\S]*?)\n'@/);
  assert.ok(csharpMatch, 'Expected C# block inside PowerShell script');
  const csharp = csharpMatch[1];

  // Ensure zero backslash escape sequences that could trip C# Add-Type compilation
  assert.equal(csharp.includes('\\'), false, 'C# block should not contain raw backslashes');
  // Ensure pure ASCII inside C# block for Windows PowerShell 5.1 compatibility
  assert.equal(/^[\x00-\x7F]*$/.test(csharp), true, 'C# block should be 7-bit ASCII');
});

test('buildWindowsBatLauncher emits CRLF batch wrapper with TLS 1.2 enabled', () => {
  const bat = buildWindowsBatLauncher('https://kepokdesk.example.com', 'abc-99');
  assert.ok(bat.includes('\r\n'));
  assert.ok(bat.includes('https://kepokdesk.example.com/api/agent/windows.ps1?token=abc-99'));
  assert.ok(bat.includes('SecurityProtocolType]::Tls12'));
});

test('macOS and Linux scripts sanitize token and embed WebSocket server', () => {
  assert.equal(sanitizeAgentToken('a1b2; rm -rf /'), 'a1b2rm-rf');
  assert.ok(buildMacOsAgentScript('t123').includes('KEPOK_TOKEN="t123"'));
  assert.ok(buildLinuxAgentScript('t123').includes('KEPOK_TOKEN="t123"'));
});
