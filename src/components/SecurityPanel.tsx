import React from 'react';
import { Lock, Radio, ShieldCheck, Volume2 } from 'lucide-react';
import type { PeerRole, TransportMode, VoiceState } from '../types/session';

interface SecurityPanelProps {
  authCode: string;
  fingerprint: string;
  localRole: PeerRole;
  peerName: string;
  transportMode: TransportMode;
  rttMs: number | null;
  voice: VoiceState;
}

export const SecurityPanel: React.FC<SecurityPanelProps> = ({
  authCode,
  fingerprint,
  localRole,
  peerName,
  transportMode,
  rttMs,
  voice,
}) => {
  return (
    <div className="flex-1 overflow-y-auto bg-white p-4 space-y-4">
      <div className="rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] p-4">
        <div className="flex items-center gap-2 text-[#15803D]">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[#111214]">End-to-End Encrypted</h3>
        </div>
        <p className="mt-2 text-xs text-[#4B5058] leading-relaxed">
          All messages, file chunks, pointer events, and program outputs are encrypted client-side
          with AES-256-GCM derived via ECDH P-256 and HKDF salted with code{' '}
          <span className="font-mono font-medium text-[#111214]">{authCode}</span>.
        </p>

        <div className="mt-4 border-t border-[#D6D6CE] pt-3">
          <p className="text-xs font-medium text-[#111214]">Session Safety Fingerprint</p>
          <p
            data-testid="safety-fingerprint"
            className="mt-1.5 rounded-[2px] border border-[#111214] bg-white px-3 py-2 font-mono text-xs font-semibold tracking-wider text-[#15803D]"
          >
            {fingerprint || 'Negotiating keys...'}
          </p>
          <p className="mt-1.5 text-[11px] text-[#6E747E]">
            Confirm this exact 24-character fingerprint matches on {peerName || 'the remote device'}.
          </p>
        </div>
      </div>

      <div className="rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-[#D9381E]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[#111214]">Transport & Latency</h3>
        </div>

        <dl className="grid grid-cols-2 gap-y-2.5 text-xs">
          <dt className="text-[#4B5058]">Local Role</dt>
          <dd className="text-right font-medium text-[#111214] capitalize">{localRole}</dd>

          <dt className="text-[#4B5058]">Paired Peer</dt>
          <dd className="text-right font-medium text-[#111214] truncate">
            {peerName || 'Connecting'}
          </dd>

          <dt className="text-[#4B5058]">Data Channel</dt>
          <dd className="text-right font-medium text-[#111214]">
            {transportMode === 'webrtc-p2p' ? 'Direct WebRTC P2P' : 'E2EE Relay'}
          </dd>

          <dt className="text-[#4B5058]">Round-Trip Time</dt>
          <dd className="text-right font-mono tabular-nums text-[#111214]">
            {rttMs !== null ? `${rttMs} ms` : 'Measuring'}
          </dd>

          <dt className="text-[#4B5058]">Cipher Suite</dt>
          <dd className="text-right font-mono text-[#111214]">AES-256-GCM</dd>
        </dl>
      </div>

      <div className="rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-[#D9381E]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[#111214]">Voice Channel Status</h3>
        </div>
        <div className="flex items-center justify-between text-xs text-[#111214]">
          <span>Your Microphone</span>
          <span>{voice.micEnabled ? 'Transmitting' : 'Muted'}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden bg-[#D6D6CE]">
          <div
            className="h-full bg-[#15803D] transition-all duration-100"
            style={{ width: `${voice.micEnabled ? Math.max(4, voice.localLevel) : 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-[#4B5058] pt-1">
          <span>Peer Audio</span>
          <span>{voice.remoteAudioActive ? 'Active (SRTP)' : 'Muted / Idle'}</span>
        </div>
        {voice.error && (
          <p className="mt-1 text-xs text-[#B45309]">{voice.error}</p>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-[#6E747E] px-1">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Zero server-side plaintext storage. Ephemeral keys purge on disconnect.</span>
      </div>
    </div>
  );
};
