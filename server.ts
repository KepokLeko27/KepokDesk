import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { isValidAuthCode, normalizeAuthCode } from './src/utils/pairing.ts';
import { validateRemoteCommand } from './src/utils/remoteCommandPolicy.ts';
import {
  calculateCpuUsagePercent,
  computeMemoryStats,
  type CpuTickSnapshot,
  sumCpuTicks,
} from './src/utils/systemMetrics.ts';
import {
  buildLinuxAgentScript,
  buildMacOsAgentScript,
  buildWindowsBatLauncher,
  buildWindowsPowerShellAgent,
  sanitizeAgentToken,
} from './server/agentScripts.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type PeerRole = 'host' | 'controller';

interface RoomPeer {
  id: string;
  role: PeerRole;
  ws: WebSocket;
  pubKey: string;
  deviceName: string;
  hostExecToken?: string;
}

interface RoomState {
  code: string;
  host: RoomPeer | null;
  controller: RoomPeer | null;
  createdAt: number;
}

const rooms = new Map<string, RoomState>();
const activeHostTokens = new Map<string, { code: string; peerId: string }>();

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getOrCreateRoom(code: string): RoomState {
  let room = rooms.get(code);
  if (!room) {
    room = {
      code,
      host: null,
      controller: null,
      createdAt: Date.now(),
    };
    rooms.set(code, room);
  }
  return room;
}

function removePeerFromRoom(peer: RoomPeer, code: string): void {
  const room = rooms.get(code);
  if (!room) return;

  if (peer.hostExecToken) {
    activeHostTokens.delete(peer.hostExecToken);
  }

  let removed = false;
  if (room.host?.id === peer.id) {
    room.host = null;
    removed = true;
    if (room.controller) {
      sendJson(room.controller.ws, {
        type: 'peer:left',
        role: 'host',
      });
    }
  } else if (room.controller?.id === peer.id) {
    room.controller = null;
    removed = true;
    if (room.host) {
      sendJson(room.host.ws, {
        type: 'peer:left',
        role: 'controller',
      });
    }
  }

  if (removed && !room.host && !room.controller) {
    rooms.delete(code);
  }
}

async function startServer(): Promise<void> {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  // Downloadable local OS Desktop Control Agent helpers (Windows, macOS, Linux)
  app.get('/api/agent/windows.bat', (req, res) => {
    const token = sanitizeAgentToken(req.query.token);
    const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string'
      ? req.headers['x-forwarded-proto'].split(',')[0].trim()
      : '';
    const proto = forwardedProto || req.protocol;
    const host = req.get('host') || 'localhost:3000';
    const origin = `${proto}://${host}`;
    res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kepokdesk-agent.bat"');
    res.send(buildWindowsBatLauncher(origin, token));
  });

  app.get('/api/agent/windows.ps1', (req, res) => {
    const token = sanitizeAgentToken(req.query.token);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buildWindowsPowerShellAgent(token));
  });

  app.get('/api/agent/macos.sh', (req, res) => {
    const token = sanitizeAgentToken(req.query.token);
    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.send(buildMacOsAgentScript(token));
  });

  app.get('/api/agent/linux.sh', (req, res) => {
    const token = sanitizeAgentToken(req.query.token);
    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.send(buildLinuxAgentScript(token));
  });

  // Host-only remote command execution bridge (requires hostExecToken issued only to the host peer)
  app.post('/api/host/exec', (req, res) => {
    const token = req.headers['x-host-token'];
    if (typeof token !== 'string' || !activeHostTokens.has(token)) {
      res.status(403).json({ ok: false, error: 'Unauthorized or inactive host execution token.' });
      return;
    }

    const { command } = req.body as { command?: string };
    if (typeof command !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing command string.' });
      return;
    }

    const validation = validateRemoteCommand(command);
    if (!validation.valid) {
      res.status(400).json({ ok: false, error: validation.reason ?? 'Invalid command.' });
      return;
    }

    const startedAt = Date.now();
    const cwd = process.cwd();
    exec(
      command,
      {
        cwd,
        timeout: 10_000,
        maxBuffer: 256 * 1024,
        env: { ...process.env, FORCE_COLOR: '0' },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startedAt;
        const exitCode =
          error && typeof (error as NodeJS.ErrnoException & { code?: number | string }).code === 'number'
            ? ((error as unknown as { code: number }).code ?? 1)
            : error
              ? 1
              : 0;

        res.json({
          ok: exitCode === 0,
          command,
          stdout: stdout ?? '',
          stderr: stderr || (error && !stdout ? error.message : ''),
          exitCode,
          durationMs,
          cwd,
        });
      }
    );
  });

  // Host-only workspace file listing
  app.post('/api/host/files', (req, res) => {
    const token = req.headers['x-host-token'];
    if (typeof token !== 'string' || !activeHostTokens.has(token)) {
      res.status(403).json({ ok: false, error: 'Unauthorized host execution token.' });
      return;
    }

    const baseDir = process.cwd();
    const { subdir } = (req.body as { subdir?: string }) ?? {};
    const targetDir = subdir ? path.resolve(baseDir, subdir) : baseDir;

    if (!targetDir.startsWith(baseDir)) {
      res.status(403).json({ ok: false, error: 'Path outside host workspace is not permitted.' });
      return;
    }

    try {
      const entries = fs
        .readdirSync(targetDir, { withFileTypes: true })
        .filter((d) => !d.name.startsWith('.') && d.name !== 'node_modules')
        .slice(0, 60)
        .map((d) => {
          const full = path.join(targetDir, d.name);
          let size = 0;
          try {
            size = d.isFile() ? fs.statSync(full).size : 0;
          } catch {
            size = 0;
          }
          return {
            name: d.name,
            type: d.isDirectory() ? 'dir' : 'file',
            size,
          };
        });
      res.json({ ok: true, cwd: path.relative(baseDir, targetDir) || '.', entries });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to list host directory.',
      });
    }
  });

  // Host-only system CPU and memory telemetry endpoint
  const hostCpuSnapshots = new Map<string, CpuTickSnapshot>();
  const initialCpuSnapshot = sumCpuTicks(os.cpus());

  app.post('/api/host/metrics', (req, res) => {
    const token = req.headers['x-host-token'];
    if (typeof token !== 'string' || !activeHostTokens.has(token)) {
      res.status(403).json({ ok: false, error: 'Unauthorized host metrics token.' });
      return;
    }

    const cpus = os.cpus();
    const currTicks = sumCpuTicks(cpus);
    const prevTicks = hostCpuSnapshots.get(token) ?? initialCpuSnapshot;
    hostCpuSnapshots.set(token, currTicks);

    const cpuPercent = calculateCpuUsagePercent(prevTicks, currTicks);
    const mem = computeMemoryStats(os.totalmem(), os.freemem());
    const loadAvg1m = Number((os.loadavg()[0] ?? 0).toFixed(2));

    res.json({
      ok: true,
      cpuPercent,
      cores: cpus.length,
      memUsedGb: mem.usedGb,
      memTotalGb: mem.totalGb,
      memPercent: mem.percent,
      loadAvg1m,
      sampledAt: Date.now(),
    });
  });

  wss.on('connection', (ws) => {
    let currentPeer: RoomPeer | null = null;
    let currentCode: string | null = null;

    ws.on('message', (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawData.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;
      if (typeof type !== 'string') return;

      if (type === 'ping') {
        sendJson(ws, { type: 'pong', ts: msg.ts });
        return;
      }

      if (type === 'join') {
        const rawCode = typeof msg.code === 'string' ? msg.code : '';
        const role = msg.role === 'host' || msg.role === 'controller' ? msg.role : null;
        const pubKey = typeof msg.pubKey === 'string' ? msg.pubKey : '';
        const deviceName =
          typeof msg.deviceName === 'string' && msg.deviceName.trim()
            ? msg.deviceName.trim().slice(0, 48)
            : role === 'host'
              ? 'Host Device'
              : 'Remote Peer';

        if (!role || !isValidAuthCode(rawCode) || !pubKey) {
          sendJson(ws, {
            type: 'error',
            message: 'Invalid authentication code, role, or public key.',
          });
          return;
        }

        const code = normalizeAuthCode(rawCode);
        if (currentPeer && currentCode) {
          removePeerFromRoom(currentPeer, currentCode);
        }

        const room = getOrCreateRoom(code);
        if (role === 'host' && room.host) {
          sendJson(ws, {
            type: 'error',
            message: `Session ${code} already has an active Host. Join as Controller or generate a new code.`,
          });
          return;
        }
        if (role === 'controller' && room.controller) {
          sendJson(ws, {
            type: 'error',
            message: `Session ${code} already has two paired devices connected.`,
          });
          return;
        }

        const peerId = crypto.randomUUID();
        const hostExecToken = role === 'host' ? crypto.randomBytes(24).toString('hex') : undefined;
        if (hostExecToken) {
          activeHostTokens.set(hostExecToken, { code, peerId });
        }

        const peer: RoomPeer = {
          id: peerId,
          role,
          ws,
          pubKey,
          deviceName,
          hostExecToken,
        };

        if (role === 'host') {
          room.host = peer;
        } else {
          room.controller = peer;
        }

        currentPeer = peer;
        currentCode = code;

        sendJson(ws, {
          type: 'joined',
          code,
          role,
          peerId,
          hostExecToken,
        });

        const counterpart = role === 'host' ? room.controller : room.host;
        if (counterpart) {
          // Notify both peers about each other so E2EE key derivation and WebRTC handshake begin
          sendJson(ws, {
            type: 'peer:joined',
            role: counterpart.role,
            pubKey: counterpart.pubKey,
            deviceName: counterpart.deviceName,
          });
          sendJson(counterpart.ws, {
            type: 'peer:joined',
            role: peer.role,
            pubKey: peer.pubKey,
            deviceName: peer.deviceName,
          });
        }
        return;
      }

      if (!currentPeer || !currentCode) return;
      const room = rooms.get(currentCode);
      if (!room) return;
      const target = currentPeer.role === 'host' ? room.controller : room.host;
      if (!target) return;

      // Pure signaling & opaque E2EE ciphertext forwarding (server never inspects E2EE payloads)
      if (
        type === 'webrtc:offer' ||
        type === 'webrtc:answer' ||
        type === 'webrtc:ice' ||
        type === 'e2ee:envelope' ||
        type === 'e2ee:control' ||
        type === 'e2ee:frame'
      ) {
        sendJson(target.ws, msg);
      }
    });

    ws.on('close', () => {
      if (currentPeer && currentCode) {
        removePeerFromRoom(currentPeer, currentCode);
      }
      currentPeer = null;
      currentCode = null;
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`KepokDesk signaling and host bridge listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
