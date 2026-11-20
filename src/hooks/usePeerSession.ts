import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeSafetyFingerprint,
  computeSha256Hex,
  decryptJson,
  deriveSessionAesKey,
  encryptJson,
  EncryptedEnvelope,
  exportPublicKeyBase64,
  generateEcdhKeyPair,
} from '../utils/e2ee';
import {
  DEFAULT_CHUNK_SIZE,
  FileChunkAssembler,
  FileTransferMeta,
  sliceBytesIntoBase64Chunks,
} from '../utils/fileChunker';
import { generateAuthCode, isValidAuthCode, normalizeAuthCode } from '../utils/pairing';
import { validateRemoteCommand } from '../utils/remoteCommandPolicy';
import { getPointerTransportPriority } from '../utils/remoteInput';
import type {
  ChatMessage,
  ConnectionPhase,
  DecryptedPacket,
  HostAgentStatus,
  HostMetricsSnapshot,
  HostWorkspaceFile,
  PeerRole,
  RemoteExecRequest,
  RemoteKeyEvent,
  RemotePointerEvent,
  ScreenSourceMode,
  TransportMode,
  VoiceState,
} from '../types/session';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function getDefaultDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Workstation';
  const ua = navigator.userAgent;
  if (ua.includes('Mac')) return 'macOS Workstation';
  if (ua.includes('Windows')) return 'Windows PC';
  if (ua.includes('Linux')) return 'Linux Laptop';
  return 'Remote Device';
}

export function usePeerSession() {
  const [role, setRole] = useState<PeerRole>('host');
  const [authCode, setAuthCode] = useState<string>(() => generateAuthCode());
  const [deviceName, setDeviceName] = useState<string>(() => getDefaultDeviceName());
  const [phase, setPhase] = useState<ConnectionPhase>('idle');
  const [peerName, setPeerName] = useState<string>('');
  const [fingerprint, setFingerprint] = useState<string>('');
  const [transportMode, setTransportMode] = useState<TransportMode>('e2ee-relay');
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Screen sharing & remote control state
  const [screenMode, setScreenMode] = useState<ScreenSourceMode>('none');
  const [remoteScreenMode, setRemoteScreenMode] = useState<ScreenSourceMode>('none');
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteFallbackFrame, setRemoteFallbackFrame] = useState<string | null>(null);
  const [remoteControlEnabled, setRemoteControlEnabled] = useState<boolean>(true);
  const [remotePointer, setRemotePointer] = useState<RemotePointerEvent | null>(null);
  const [lastRemoteKey, setLastRemoteKey] = useState<RemoteKeyEvent | null>(null);

  // Chat & File transfers
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Remote program execution
  const [execLogs, setExecLogs] = useState<RemoteExecRequest[]>([]);
  const [allowRemoteExec, setAllowRemoteExec] = useState<boolean>(true);
  const [autoApproveExec, setAutoApproveExec] = useState<boolean>(false);
  const [hostFiles, setHostFiles] = useState<HostWorkspaceFile[]>([]);
  const [hostMetrics, setHostMetrics] = useState<HostMetricsSnapshot | null>(null);
  const [agentToken, setAgentToken] = useState<string>(() =>
    crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  );
  const [hostAgentStatus, setHostAgentStatus] = useState<HostAgentStatus>({
    connected: false,
    error: null,
  });
  const [remoteAgentStatus, setRemoteAgentStatus] = useState<HostAgentStatus>({
    connected: false,
    error: null,
  });

  // Voice chat
  const [voice, setVoice] = useState<VoiceState>({
    micEnabled: false,
    speakerMuted: false,
    remoteAudioActive: false,
    localLevel: 0,
    remoteLevel: 0,
    error: null,
  });
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);

  // Refs for low-latency async access without stale closures
  const wsRef = useRef<WebSocket | null>(null);
  const agentWsRef = useRef<WebSocket | null>(null);
  const agentConnectedRef = useRef<boolean>(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const controlDcRef = useRef<RTCDataChannel | null>(null);
  const reliableDcRef = useRef<RTCDataChannel | null>(null);
  const keyPairRef = useRef<CryptoKeyPair | null>(null);
  const localPubKeyRef = useRef<string>('');
  const aesKeyRef = useRef<CryptoKey | null>(null);
  const hostExecTokenRef = useRef<string | null>(null);
  const roleRef = useRef<PeerRole>(role);
  const authCodeRef = useRef<string>(authCode);
  const deviceNameRef = useRef<string>(deviceName);
  const screenModeRef = useRef<ScreenSourceMode>(screenMode);
  const allowRemoteExecRef = useRef<boolean>(allowRemoteExec);
  const autoApproveExecRef = useRef<boolean>(autoApproveExec);
  const assemblersRef = useRef<Map<string, FileChunkAssembler>>(new Map());
  const transferMetasRef = useRef<Map<string, FileTransferMeta & { messageId: string }>>(new Map());
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pingIntervalRef = useRef<number | null>(null);
  const metricsIntervalRef = useRef<number | null>(null);
  const lastFrameSentRef = useRef<number>(0);
  const keyListenersRef = useRef<Set<(evt: RemoteKeyEvent) => void>>(new Set());
  const pointerListenersRef = useRef<Set<(evt: RemotePointerEvent) => void>>(new Set());

  const subscribeRemoteKeys = useCallback((listener: (evt: RemoteKeyEvent) => void) => {
    keyListenersRef.current.add(listener);
    return () => {
      keyListenersRef.current.delete(listener);
    };
  }, []);

  const subscribeRemotePointer = useCallback((listener: (evt: RemotePointerEvent) => void) => {
    pointerListenersRef.current.add(listener);
    return () => {
      pointerListenersRef.current.delete(listener);
    };
  }, []);

  roleRef.current = role;
  authCodeRef.current = authCode;
  deviceNameRef.current = deviceName;
  screenModeRef.current = screenMode;
  allowRemoteExecRef.current = allowRemoteExec;
  autoApproveExecRef.current = autoApproveExec;

  const cleanupMediaAndRtc = useCallback(() => {
    if (pingIntervalRef.current) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (metricsIntervalRef.current) {
      window.clearInterval(metricsIntervalRef.current);
      metricsIntervalRef.current = null;
    }
    setHostMetrics(null);
    controlDcRef.current?.close();
    reliableDcRef.current?.close();
    controlDcRef.current = null;
    reliableDcRef.current = null;

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
    }
    if (localMicStreamRef.current) {
      localMicStreamRef.current.getTracks().forEach((t) => t.stop());
      localMicStreamRef.current = null;
    }

    setLocalVideoStream(null);
    setRemoteVideoStream(null);
    setRemoteAudioStream(null);
    setRemoteFallbackFrame(null);
    setScreenMode('none');
    setRemoteScreenMode('none');
    setRemoteAgentStatus({ connected: false, error: null });
    setVoice({
      micEnabled: false,
      speakerMuted: false,
      remoteAudioActive: false,
      localLevel: 0,
      remoteLevel: 0,
      error: null,
    });
  }, []);

  const sendEncrypted = useCallback(
    async (packet: DecryptedPacket, priority: 'control' | 'reliable' = 'reliable') => {
      const aesKey = aesKeyRef.current;
      if (!aesKey) return;

      const envelope = await encryptJson(aesKey, packet);
      const serialized = JSON.stringify(envelope);

      const dc = priority === 'control' ? controlDcRef.current : reliableDcRef.current;
      if (dc && dc.readyState === 'open') {
        dc.send(serialized);
        return;
      }

      // E2EE ciphertext fallback over signaling WebSocket (server only sees opaque AES-GCM envelope)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: priority === 'control' ? 'e2ee:control' : 'e2ee:envelope',
            envelope,
          })
        );
      }
    },
    []
  );

  const executeCommandOnHost = useCallback(
    async (execId: string, command: string) => {
      const token = hostExecTokenRef.current;
      if (!token) {
        setExecLogs((prev) =>
          prev.map((item) =>
            item.execId === execId
              ? { ...item, status: 'error', stderr: 'Host session token unavailable.' }
              : item
          )
        );
        await sendEncrypted({
          type: 'exec:result',
          execId,
          status: 'error',
          stderr: 'Host session token unavailable.',
        });
        return;
      }

      setExecLogs((prev) =>
        prev.map((item) => (item.execId === execId ? { ...item, status: 'running' } : item))
      );
      await sendEncrypted({ type: 'exec:result', execId, status: 'running' });

      try {
        const res = await fetch('/api/host/exec', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-host-token': token,
          },
          body: JSON.stringify({ command }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          stdout?: string;
          stderr?: string;
          exitCode?: number;
          durationMs?: number;
          cwd?: string;
          error?: string;
        };

        const status = data.ok ? 'completed' : 'error';
        const stdout = data.stdout ?? '';
        const stderr = data.stderr ?? data.error ?? '';

        setExecLogs((prev) =>
          prev.map((item) =>
            item.execId === execId
              ? {
                  ...item,
                  status,
                  stdout,
                  stderr,
                  exitCode: data.exitCode ?? (data.ok ? 0 : 1),
                  durationMs: data.durationMs,
                  cwd: data.cwd,
                }
              : item
          )
        );

        await sendEncrypted({
          type: 'exec:result',
          execId,
          status,
          stdout,
          stderr,
          exitCode: data.exitCode ?? (data.ok ? 0 : 1),
          durationMs: data.durationMs,
          cwd: data.cwd,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Host execution failed.';
        setExecLogs((prev) =>
          prev.map((item) =>
            item.execId === execId ? { ...item, status: 'error', stderr: message } : item
          )
        );
        await sendEncrypted({
          type: 'exec:result',
          execId,
          status: 'error',
          stderr: message,
        });
      }
    },
    [sendEncrypted]
  );

  const handleDecryptedPacket = useCallback(
    async (packet: DecryptedPacket) => {
      switch (packet.type) {
        case 'ping': {
          await sendEncrypted({ type: 'pong', ts: packet.ts }, 'control');
          break;
        }
        case 'pong': {
          const latency = Math.max(1, Math.round(performance.now() - packet.ts));
          setRttMs(latency);
          break;
        }
        case 'chat:text': {
          setMessages((prev) => {
            if (prev.some((m) => m.id === packet.id)) return prev;
            return [
              ...prev,
              {
                id: packet.id,
                sender: roleRef.current === 'host' ? 'controller' : 'host',
                senderName: packet.senderName,
                text: packet.text,
                timestamp: packet.timestamp,
              },
            ];
          });
          break;
        }
        case 'file:meta': {
          if (assemblersRef.current.has(packet.transferId)) return;
          const meta: FileTransferMeta & { messageId: string } = {
            transferId: packet.transferId,
            messageId: packet.messageId,
            name: packet.name,
            size: packet.size,
            mimeType: packet.mimeType,
            totalChunks: packet.totalChunks,
            sha256: packet.sha256,
            viaChat: packet.viaChat,
          };
          assemblersRef.current.set(packet.transferId, new FileChunkAssembler(meta));
          transferMetasRef.current.set(packet.transferId, meta);

          setMessages((prev) => {
            if (prev.some((m) => m.id === packet.messageId)) return prev;
            return [
              ...prev,
              {
                id: packet.messageId,
                sender: roleRef.current === 'host' ? 'controller' : 'host',
                senderName: packet.senderName,
                text: packet.caption ?? '',
                timestamp: packet.timestamp,
                attachment: {
                  transferId: packet.transferId,
                  name: packet.name,
                  size: packet.size,
                  mimeType: packet.mimeType,
                  sha256: packet.sha256,
                  progress: 0,
                  status: 'receiving',
                },
              },
            ];
          });
          break;
        }
        case 'file:chunk': {
          const assembler = assemblersRef.current.get(packet.transferId);
          const meta = transferMetasRef.current.get(packet.transferId);
          if (!assembler || !meta) return;

          const status = assembler.addChunk(packet.index, packet.dataBase64);
          if (!status.complete) {
            setMessages((prev) =>
              prev.map((m) =>
                m.attachment?.transferId === packet.transferId
                  ? {
                      ...m,
                      attachment: {
                        ...m.attachment,
                        progress: status.progress,
                        status: 'receiving',
                      },
                    }
                  : m
              )
            );
          } else {
            const bytes = assembler.assemble();
            const actualHash = await computeSha256Hex(bytes);
            const verified = actualHash === meta.sha256;
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            const blob = new Blob([copy.buffer], {
              type: meta.mimeType || 'application/octet-stream',
            });
            const downloadUrl = URL.createObjectURL(blob);

            setMessages((prev) =>
              prev.map((m) =>
                m.attachment?.transferId === packet.transferId
                  ? {
                      ...m,
                      attachment: {
                        ...m.attachment,
                        progress: 100,
                        status: verified ? 'verified' : 'error',
                        downloadUrl,
                        verifiedSha256: verified,
                      },
                    }
                  : m
              )
            );
            await sendEncrypted({
              type: 'file:ack',
              transferId: packet.transferId,
              verified,
            });
          }
          break;
        }
        case 'file:ack': {
          setMessages((prev) =>
            prev.map((m) =>
              m.attachment?.transferId === packet.transferId
                ? {
                    ...m,
                    attachment: {
                      ...m.attachment,
                      progress: 100,
                      status: packet.verified ? 'verified' : 'error',
                      verifiedSha256: packet.verified,
                    },
                  }
                : m
            )
          );
          break;
        }
        case 'control:pointer': {
          setRemotePointer(packet.event);
          pointerListenersRef.current.forEach((listener) => listener(packet.event));
          if (
            roleRef.current === 'host' &&
            screenModeRef.current === 'display' &&
            agentWsRef.current?.readyState === WebSocket.OPEN
          ) {
            agentWsRef.current.send(
              JSON.stringify({
                type: 'pointer',
                kind: packet.event.kind,
                x: packet.event.x,
                y: packet.event.y,
                button: packet.event.button ?? 0,
                deltaY: packet.event.deltaY ?? 0,
              })
            );
          }
          break;
        }
        case 'control:key': {
          setLastRemoteKey(packet.event);
          keyListenersRef.current.forEach((listener) => listener(packet.event));
          if (
            roleRef.current === 'host' &&
            screenModeRef.current === 'display' &&
            agentWsRef.current?.readyState === WebSocket.OPEN
          ) {
            agentWsRef.current.send(
              JSON.stringify({
                type: 'key',
                kind: packet.event.kind,
                key: packet.event.key,
                code: packet.event.code,
                ctrlKey: Boolean(packet.event.ctrlKey),
                shiftKey: Boolean(packet.event.shiftKey),
                altKey: Boolean(packet.event.altKey),
                metaKey: Boolean(packet.event.metaKey),
              })
            );
          }
          break;
        }
        case 'screen:status': {
          setRemoteScreenMode(packet.mode);
          if (packet.mode === 'none') {
            setRemoteFallbackFrame(null);
          }
          break;
        }
        case 'screen:frame': {
          setRemoteFallbackFrame(packet.dataUrl);
          break;
        }
        case 'exec:request': {
          if (roleRef.current !== 'host') return;
          if (!allowRemoteExecRef.current) {
            const denied: RemoteExecRequest = {
              execId: packet.execId,
              command: packet.command,
              requestedBy: packet.requestedBy,
              requestedAt: packet.requestedAt,
              status: 'denied',
              stderr: 'Host has disabled remote program execution.',
            };
            setExecLogs((prev) => [denied, ...prev]);
            await sendEncrypted({
              type: 'exec:result',
              execId: packet.execId,
              status: 'denied',
              stderr: 'Host has disabled remote program execution.',
            });
            return;
          }

          const reqEntry: RemoteExecRequest = {
            execId: packet.execId,
            command: packet.command,
            requestedBy: packet.requestedBy,
            requestedAt: packet.requestedAt,
            status: autoApproveExecRef.current ? 'running' : 'pending-approval',
          };
          setExecLogs((prev) => {
            if (prev.some((r) => r.execId === packet.execId)) return prev;
            return [reqEntry, ...prev];
          });

          if (autoApproveExecRef.current) {
            await executeCommandOnHost(packet.execId, packet.command);
          }
          break;
        }
        case 'exec:result': {
          setExecLogs((prev) =>
            prev.map((item) =>
              item.execId === packet.execId
                ? {
                    ...item,
                    status: packet.status,
                    stdout: packet.stdout ?? item.stdout,
                    stderr: packet.stderr ?? item.stderr,
                    exitCode: packet.exitCode ?? item.exitCode,
                    durationMs: packet.durationMs ?? item.durationMs,
                    cwd: packet.cwd ?? item.cwd,
                  }
                : item
            )
          );
          break;
        }
        case 'voice:status': {
          setVoice((prev) => ({ ...prev, remoteAudioActive: packet.micEnabled }));
          break;
        }
        case 'host:metrics': {
          setHostMetrics(packet.metrics);
          break;
        }
        case 'agent:status': {
          setRemoteAgentStatus(packet.status);
          break;
        }
      }
    },
    [executeCommandOnHost, sendEncrypted]
  );

  const wireDataChannel = useCallback(
    (dc: RTCDataChannel, kind: 'control' | 'reliable') => {
      if (kind === 'control') {
        controlDcRef.current = dc;
      } else {
        reliableDcRef.current = dc;
      }

      dc.onopen = () => {
        setTransportMode('webrtc-p2p');
      };

      dc.onclose = () => {
        if (
          controlDcRef.current?.readyState !== 'open' &&
          reliableDcRef.current?.readyState !== 'open'
        ) {
          setTransportMode('e2ee-relay');
        }
      };

      dc.onmessage = async (evt) => {
        if (!aesKeyRef.current || typeof evt.data !== 'string') return;
        try {
          const envelope = JSON.parse(evt.data) as EncryptedEnvelope;
          const packet = await decryptJson<DecryptedPacket>(aesKeyRef.current, envelope);
          await handleDecryptedPacket(packet);
        } catch {
          // Ignore malformed or wrong-key frames
        }
      };
    },
    [handleDecryptedPacket]
  );

  const setupPeerConnection = useCallback(
    async (isInitiator: boolean) => {
      if (pcRef.current) {
        pcRef.current.close();
      }
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      pendingIceRef.current = [];

      pc.onicecandidate = (evt) => {
        if (evt.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'webrtc:ice',
              candidate: evt.candidate.toJSON(),
            })
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setTransportMode('webrtc-p2p');
        } else if (
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'failed'
        ) {
          setTransportMode('e2ee-relay');
        }
      };

      pc.ontrack = (evt) => {
        const stream = evt.streams[0] ?? new MediaStream([evt.track]);
        if (evt.track.kind === 'video') {
          setRemoteVideoStream(stream);
        } else if (evt.track.kind === 'audio') {
          setRemoteAudioStream(stream);
          setVoice((prev) => ({ ...prev, remoteAudioActive: true }));
        }
      };

      if (isInitiator) {
        const controlDc = pc.createDataChannel('control', {
          ordered: false,
          maxRetransmits: 0,
        });
        const reliableDc = pc.createDataChannel('reliable', { ordered: true });
        wireDataChannel(controlDc, 'control');
        wireDataChannel(reliableDc, 'reliable');
      } else {
        pc.ondatachannel = (evt) => {
          if (evt.channel.label === 'control') {
            wireDataChannel(evt.channel, 'control');
          } else {
            wireDataChannel(evt.channel, 'reliable');
          }
        };
      }

      // Attach any already-active local media tracks
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localScreenStreamRef.current!);
        });
      }
      if (localMicStreamRef.current) {
        localMicStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localMicStreamRef.current!);
        });
      }

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsRef.current?.send(
          JSON.stringify({
            type: 'webrtc:offer',
            sdp: pc.localDescription,
          })
        );
      }
    },
    [wireDataChannel]
  );

  const renegotiateRtc = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || wsRef.current?.readyState !== WebSocket.OPEN) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current.send(
        JSON.stringify({
          type: 'webrtc:offer',
          sdp: pc.localDescription,
        })
      );
    } catch {
      // Negotiation collision handled on peer answer/offer
    }
  }, []);

  const connectSession = useCallback(
    async (selectedRole?: PeerRole, selectedCode?: string) => {
      const activeRole = selectedRole ?? roleRef.current;
      const normalized = normalizeAuthCode(selectedCode ?? authCodeRef.current);

      if (!isValidAuthCode(normalized)) {
        setErrorBanner('Enter a valid 8-character authentication code (e.g., K7M3-P9Q2).');
        return;
      }

      setErrorBanner(null);
      setRole(activeRole);
      setAuthCode(normalized);
      setPhase('waiting');
      setPeerName('');
      setFingerprint('');
      setMessages([]);
      setExecLogs([]);
      assemblersRef.current.clear();
      transferMetasRef.current.clear();

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      cleanupMediaAndRtc();

      const kp = await generateEcdhKeyPair();
      const pubB64 = await exportPublicKeyBase64(kp.publicKey);
      keyPairRef.current = kp;
      localPubKeyRef.current = pubB64;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'join',
            code: normalized,
            role: activeRole,
            pubKey: pubB64,
            deviceName: deviceNameRef.current,
          })
        );
      };

      ws.onmessage = async (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type === 'error') {
          setErrorBanner(typeof msg.message === 'string' ? msg.message : 'Session error.');
          setPhase('idle');
          return;
        }

        if (msg.type === 'joined') {
          if (typeof msg.hostExecToken === 'string') {
            hostExecTokenRef.current = msg.hostExecToken;
          }
          setPhase('waiting');
          return;
        }

        if (msg.type === 'peer:joined') {
          const remotePubKey = typeof msg.pubKey === 'string' ? msg.pubKey : '';
          const remoteName = typeof msg.deviceName === 'string' ? msg.deviceName : 'Peer Device';
          setPeerName(remoteName);
          setPhase('handshaking');

          if (keyPairRef.current && remotePubKey) {
            const aesKey = await deriveSessionAesKey(
              keyPairRef.current.privateKey,
              remotePubKey,
              normalized
            );
            aesKeyRef.current = aesKey;
            const fp = await computeSafetyFingerprint(
              localPubKeyRef.current,
              remotePubKey,
              normalized
            );
            setFingerprint(fp);
            setPhase('connected');

            // Start real RTT ping loop
            if (pingIntervalRef.current) window.clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = window.setInterval(() => {
              sendEncrypted({ type: 'ping', ts: performance.now() }, 'control');
            }, 2000);
            sendEncrypted({ type: 'ping', ts: performance.now() }, 'control');

            // Host samples real CPU & memory telemetry and streams it E2EE every 2s
            if (activeRole === 'host') {
              if (agentConnectedRef.current) {
                setHostAgentStatus((curr) => {
                  sendEncrypted({ type: 'agent:status', status: curr }, 'reliable');
                  return curr;
                });
              }
              const sampleAndSendMetrics = async () => {
                const token = hostExecTokenRef.current;
                if (!token) return;
                try {
                  const res = await fetch('/api/host/metrics', {
                    method: 'POST',
                    headers: { 'x-host-token': token },
                  });
                  const data = (await res.json()) as {
                    ok: boolean;
                    cpuPercent?: number;
                    cores?: number;
                    memUsedGb?: number;
                    memTotalGb?: number;
                    memPercent?: number;
                    loadAvg1m?: number;
                    sampledAt?: number;
                  };
                  if (data.ok && typeof data.cpuPercent === 'number') {
                    const snapshot: HostMetricsSnapshot = {
                      cpuPercent: data.cpuPercent,
                      cores: data.cores ?? 1,
                      memUsedGb: data.memUsedGb ?? 0,
                      memTotalGb: data.memTotalGb ?? 0,
                      memPercent: data.memPercent ?? 0,
                      loadAvg1m: data.loadAvg1m ?? 0,
                      sampledAt: data.sampledAt ?? Date.now(),
                    };
                    setHostMetrics(snapshot);
                    await sendEncrypted({ type: 'host:metrics', metrics: snapshot }, 'control');
                  }
                } catch {
                  // Ignore transient metric poll failures
                }
              };
              if (metricsIntervalRef.current) window.clearInterval(metricsIntervalRef.current);
              metricsIntervalRef.current = window.setInterval(sampleAndSendMetrics, 2000);
              sampleAndSendMetrics();
            }

            // Host initiates WebRTC Offer
            await setupPeerConnection(activeRole === 'host');
          }
          return;
        }

        if (msg.type === 'peer:left') {
          setPeerName('');
          setFingerprint('');
          setPhase('waiting');
          setRemoteVideoStream(null);
          setRemoteFallbackFrame(null);
          setRemoteScreenMode('none');
          setVoice((prev) => ({ ...prev, remoteAudioActive: false }));
          return;
        }

        if (msg.type === 'webrtc:offer' && msg.sdp) {
          if (!pcRef.current) {
            await setupPeerConnection(false);
          }
          const pc = pcRef.current!;
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit));
          for (const ice of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(ice));
          }
          pendingIceRef.current = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'webrtc:answer', sdp: pc.localDescription }));
          return;
        }

        if (msg.type === 'webrtc:answer' && msg.sdp && pcRef.current) {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit)
          );
          for (const ice of pendingIceRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(ice));
          }
          pendingIceRef.current = [];
          return;
        }

        if (msg.type === 'webrtc:ice' && msg.candidate) {
          const candidate = msg.candidate as RTCIceCandidateInit;
          if (pcRef.current && pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            pendingIceRef.current.push(candidate);
          }
          return;
        }

        if ((msg.type === 'e2ee:envelope' || msg.type === 'e2ee:control') && msg.envelope) {
          if (!aesKeyRef.current) return;
          try {
            const packet = await decryptJson<DecryptedPacket>(
              aesKeyRef.current,
              msg.envelope as EncryptedEnvelope
            );
            await handleDecryptedPacket(packet);
          } catch {
            // Ignore undecryptable packet
          }
        }
      };

      ws.onerror = () => {
        setErrorBanner('Signaling connection interrupted. Check network connectivity.');
      };

      ws.onclose = () => {
        setPhase((curr) => (curr === 'idle' ? 'idle' : 'disconnected'));
      };
    },
    [cleanupMediaAndRtc, handleDecryptedPacket, sendEncrypted, setupPeerConnection]
  );

  const disconnectDesktopAgent = useCallback(() => {
    if (agentWsRef.current) {
      agentWsRef.current.close();
      agentWsRef.current = null;
    }
    agentConnectedRef.current = false;
    const status: HostAgentStatus = { connected: false, error: null };
    setHostAgentStatus(status);
    sendEncrypted({ type: 'agent:status', status }, 'reliable');
  }, [sendEncrypted]);

  const connectDesktopAgent = useCallback(
    (silent: boolean = false) => {
      if (agentWsRef.current && agentWsRef.current.readyState === WebSocket.OPEN) {
        return;
      }
      if (agentWsRef.current) {
        agentWsRef.current.close();
        agentWsRef.current = null;
      }

      try {
        const ws = new WebSocket(`ws://127.0.0.1:47890/?token=${encodeURIComponent(agentToken)}`);
        agentWsRef.current = ws;

        ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data as string) as {
              type?: string;
              platform?: string;
              screenWidth?: number;
              screenHeight?: number;
            };
            if (data.type === 'ready') {
              agentConnectedRef.current = true;
              const status: HostAgentStatus = {
                connected: true,
                platform: data.platform,
                screenWidth: data.screenWidth,
                screenHeight: data.screenHeight,
                error: null,
              };
              setHostAgentStatus(status);
              sendEncrypted({ type: 'agent:status', status }, 'reliable');
            }
          } catch {
            // Ignore malformed local agent message
          }
        };

        ws.onerror = () => {
          if (!agentConnectedRef.current && !silent) {
            setHostAgentStatus({
              connected: false,
              error: 'Local control helper is not running on port 47890 yet.',
            });
          }
        };

        ws.onclose = () => {
          const wasConnected = agentConnectedRef.current;
          agentConnectedRef.current = false;
          if (agentWsRef.current === ws) {
            agentWsRef.current = null;
          }
          setHostAgentStatus((prev) => ({
            connected: false,
            error: wasConnected
              ? 'Local control helper stopped.'
              : silent
                ? prev.error
                : 'Local control helper is not running on port 47890 yet.',
          }));
          if (wasConnected) {
            sendEncrypted({ type: 'agent:status', status: { connected: false } }, 'reliable');
          }
        };
      } catch {
        if (!silent) {
          setHostAgentStatus({
            connected: false,
            error: 'Could not open connection to ws://127.0.0.1:47890.',
          });
        }
      }
    },
    [agentToken, sendEncrypted]
  );

  const disconnectSession = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    disconnectDesktopAgent();
    aesKeyRef.current = null;
    hostExecTokenRef.current = null;
    cleanupMediaAndRtc();
    setPhase('idle');
    setPeerName('');
    setFingerprint('');
    setRttMs(null);
  }, [cleanupMediaAndRtc, disconnectDesktopAgent]);

  // Share real OS display via getDisplayMedia
  const startSystemScreenShare = useCallback(async () => {
    setErrorBanner(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setErrorBanner('Display capture is unavailable in this browser context. Use Workspace Stream instead.');
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
        },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && 'contentHint' in videoTrack) {
        videoTrack.contentHint = 'motion';
      }

      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      localScreenStreamRef.current = stream;
      setLocalVideoStream(stream);
      setScreenMode('display');
      await sendEncrypted({ type: 'screen:status', mode: 'display' });

      if (pcRef.current && videoTrack) {
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(videoTrack);
        } else {
          pcRef.current.addTrack(videoTrack, stream);
          await renegotiateRtc();
        }
      }

      videoTrack.onended = async () => {
        setScreenMode('none');
        setLocalVideoStream(null);
        await sendEncrypted({ type: 'screen:status', mode: 'none' });
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Screen sharing permission declined.';
      setErrorBanner(msg);
    }
  }, [renegotiateRtc, sendEncrypted]);

  // Share interactive Host Workspace Canvas stream (works across all browsers & headless environments)
  const startWorkspaceStream = useCallback(
    async (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      setScreenMode('workspace');
      await sendEncrypted({ type: 'screen:status', mode: 'workspace' });

      try {
        const stream = canvas.captureStream(30);
        localScreenStreamRef.current = stream;
        setLocalVideoStream(stream);
        const videoTrack = stream.getVideoTracks()[0];
        if (pcRef.current && videoTrack) {
          const senders = pcRef.current.getSenders();
          const videoSender = senders.find((s) => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(videoTrack);
          } else {
            pcRef.current.addTrack(videoTrack, stream);
            await renegotiateRtc();
          }
        }
      } catch {
        // Fallback frame relay continues to carry encrypted workspace frames
      }
    },
    [renegotiateRtc, sendEncrypted]
  );

  const stopScreenShare = useCallback(async () => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
    }
    setLocalVideoStream(null);
    setScreenMode('none');
    await sendEncrypted({ type: 'screen:status', mode: 'none' });
  }, [sendEncrypted]);

  const sendWorkspaceFallbackFrame = useCallback(
    async (canvas: HTMLCanvasElement) => {
      if (phase !== 'connected' || screenMode !== 'workspace') return;
      const now = performance.now();
      if (now - lastFrameSentRef.current < 160) return; // ~6fps encrypted fallback delta
      lastFrameSentRef.current = now;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      await sendEncrypted(
        {
          type: 'screen:frame',
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          ts: Date.now(),
        },
        'control'
      );
    },
    [phase, screenMode, sendEncrypted]
  );

  const sendPointerControl = useCallback(
    async (evt: RemotePointerEvent) => {
      if (!remoteControlEnabled || phase !== 'connected') return;
      const priority = getPointerTransportPriority(evt.kind);
      await sendEncrypted({ type: 'control:pointer', event: evt }, priority);
    },
    [phase, remoteControlEnabled, sendEncrypted]
  );

  const sendKeyControl = useCallback(
    async (evt: RemoteKeyEvent) => {
      if (!remoteControlEnabled || phase !== 'connected') return;
      await sendEncrypted({ type: 'control:key', event: evt }, 'reliable');
    },
    [phase, remoteControlEnabled, sendEncrypted]
  );

  const sendChatMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || phase !== 'connected') return;
      const id = crypto.randomUUID();
      const timestamp = Date.now();
      setMessages((prev) => [
        ...prev,
        {
          id,
          sender: roleRef.current,
          senderName: deviceNameRef.current,
          text: trimmed,
          timestamp,
        },
      ]);
      await sendEncrypted({
        type: 'chat:text',
        id,
        text: trimmed,
        timestamp,
        senderName: deviceNameRef.current,
      });
    },
    [phase, sendEncrypted]
  );

  const sendFile = useCallback(
    async (file: File, viaChat: boolean = true, caption?: string) => {
      if (phase !== 'connected') return;
      const transferId = crypto.randomUUID();
      const messageId = crypto.randomUUID();
      const timestamp = Date.now();
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const sha256 = await computeSha256Hex(bytes);
      const chunks = sliceBytesIntoBase64Chunks(bytes, DEFAULT_CHUNK_SIZE);

      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          sender: roleRef.current,
          senderName: deviceNameRef.current,
          text: caption?.trim() ?? '',
          timestamp,
          attachment: {
            transferId,
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            sha256,
            progress: 0,
            status: 'sending',
          },
        },
      ]);

      await sendEncrypted({
        type: 'file:meta',
        transferId,
        messageId,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        totalChunks: chunks.length,
        sha256,
        viaChat,
        senderName: deviceNameRef.current,
        caption,
        timestamp,
      });

      for (let i = 0; i < chunks.length; i++) {
        // Respect WebRTC DataChannel backpressure when streaming over P2P
        const dc = reliableDcRef.current;
        if (dc && dc.readyState === 'open' && dc.bufferedAmount > 512 * 1024) {
          await new Promise((r) => setTimeout(r, 15));
        }

        await sendEncrypted({
          type: 'file:chunk',
          transferId,
          index: i,
          dataBase64: chunks[i],
        });

        const progress = Math.round(((i + 1) / chunks.length) * 100);
        setMessages((prev) =>
          prev.map((m) =>
            m.attachment?.transferId === transferId
              ? {
                  ...m,
                  attachment: {
                    ...m.attachment,
                    progress,
                    status: progress === 100 ? 'completed' : 'sending',
                  },
                }
              : m
          )
        );
      }
    },
    [phase, sendEncrypted]
  );

  const requestRemoteProgram = useCallback(
    async (command: string) => {
      const check = validateRemoteCommand(command);
      if (!check.valid) {
        setErrorBanner(check.reason ?? 'Invalid command.');
        return;
      }
      const execId = crypto.randomUUID();
      const requestedAt = Date.now();
      const entry: RemoteExecRequest = {
        execId,
        command: command.trim(),
        requestedBy: deviceNameRef.current,
        requestedAt,
        status: roleRef.current === 'host' ? 'running' : 'pending-approval',
      };
      setExecLogs((prev) => [entry, ...prev]);

      if (roleRef.current === 'host') {
        await executeCommandOnHost(execId, command.trim());
      } else {
        await sendEncrypted({
          type: 'exec:request',
          execId,
          command: command.trim(),
          requestedBy: deviceNameRef.current,
          requestedAt,
        });
      }
    },
    [executeCommandOnHost, sendEncrypted]
  );

  const approveRemoteExec = useCallback(
    async (execId: string) => {
      const target = execLogs.find((e) => e.execId === execId);
      if (!target) return;
      await executeCommandOnHost(execId, target.command);
    },
    [execLogs, executeCommandOnHost]
  );

  const denyRemoteExec = useCallback(
    async (execId: string) => {
      setExecLogs((prev) =>
        prev.map((item) =>
          item.execId === execId
            ? { ...item, status: 'denied', stderr: 'Denied by host operator.' }
            : item
        )
      );
      await sendEncrypted({
        type: 'exec:result',
        execId,
        status: 'denied',
        stderr: 'Denied by host operator.',
      });
    },
    [sendEncrypted]
  );

  const refreshHostFiles = useCallback(async () => {
    const token = hostExecTokenRef.current;
    if (!token) return;
    try {
      const res = await fetch('/api/host/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-host-token': token,
        },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { ok: boolean; entries?: HostWorkspaceFile[] };
      if (data.ok && data.entries) {
        setHostFiles(data.entries);
      }
    } catch {
      // Ignore transient host file list failures
    }
  }, []);

  const toggleVoiceMic = useCallback(async () => {
    if (voice.micEnabled) {
      if (localMicStreamRef.current) {
        localMicStreamRef.current.getTracks().forEach((t) => t.stop());
        localMicStreamRef.current = null;
      }
      setVoice((prev) => ({ ...prev, micEnabled: false, localLevel: 0, error: null }));
      await sendEncrypted({ type: 'voice:status', micEnabled: false });
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setVoice((prev) => ({
          ...prev,
          error: 'Microphone API unavailable in this browser context.',
        }));
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localMicStreamRef.current = stream;
      const audioTrack = stream.getAudioTracks()[0];

      if (pcRef.current && audioTrack) {
        const audioSender = pcRef.current.getSenders().find((s) => s.track?.kind === 'audio');
        if (audioSender) {
          await audioSender.replaceTrack(audioTrack);
        } else {
          pcRef.current.addTrack(audioTrack, stream);
          await renegotiateRtc();
        }
      }

      setVoice((prev) => ({ ...prev, micEnabled: true, error: null }));
      await sendEncrypted({ type: 'voice:status', micEnabled: true });

      // Live audio level metering via Web Audio API
      try {
        const AudioCtx = window.AudioContext;
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!localMicStreamRef.current) {
            ctx.close().catch(() => undefined);
            return;
          }
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
          setVoice((prev) => ({
            ...prev,
            localLevel: Math.min(100, Math.round((avg / 128) * 100)),
          }));
          window.setTimeout(tick, 120);
        };
        tick();
      } catch {
        // Metering optional if AudioContext restricted
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Microphone access denied or unavailable.';
      setVoice((prev) => ({ ...prev, micEnabled: false, error: message }));
    }
  }, [renegotiateRtc, sendEncrypted, voice.micEnabled]);

  const toggleSpeakerMute = useCallback(() => {
    setVoice((prev) => ({ ...prev, speakerMuted: !prev.speakerMuted }));
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (agentWsRef.current) {
        agentWsRef.current.close();
      }
      cleanupMediaAndRtc();
    };
  }, [cleanupMediaAndRtc]);

  return {
    role,
    setRole,
    authCode,
    setAuthCode,
    deviceName,
    setDeviceName,
    phase,
    peerName,
    fingerprint,
    transportMode,
    rttMs,
    errorBanner,
    setErrorBanner,
    screenMode,
    remoteScreenMode,
    remoteVideoStream,
    localVideoStream,
    remoteFallbackFrame,
    remoteControlEnabled,
    setRemoteControlEnabled,
    remotePointer,
    lastRemoteKey,
    messages,
    execLogs,
    allowRemoteExec,
    setAllowRemoteExec,
    autoApproveExec,
    setAutoApproveExec,
    hostFiles,
    hostMetrics,
    agentToken,
    setAgentToken,
    hostAgentStatus,
    remoteAgentStatus,
    connectDesktopAgent,
    disconnectDesktopAgent,
    voice,
    remoteAudioStream,
    connectSession,
    disconnectSession,
    startSystemScreenShare,
    startWorkspaceStream,
    stopScreenShare,
    sendWorkspaceFallbackFrame,
    sendPointerControl,
    sendKeyControl,
    sendChatMessage,
    sendFile,
    requestRemoteProgram,
    approveRemoteExec,
    denyRemoteExec,
    refreshHostFiles,
    toggleVoiceMic,
    toggleSpeakerMute,
    subscribeRemoteKeys,
    subscribeRemotePointer,
  };
}
