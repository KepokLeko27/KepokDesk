import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  KeyRound,
  Laptop,
  Monitor,
  QrCode,
  RefreshCw,
  ScanLine,
} from 'lucide-react';
import type { ConnectionPhase, PeerRole } from '../types/session';
import { buildPairingUrl, generateAuthCode, isValidAuthCode, normalizeAuthCode } from '../utils/pairing';
import { QrScannerModal } from './QrScannerModal';

interface PairingLandingProps {
  role: PeerRole;
  setRole: (role: PeerRole) => void;
  authCode: string;
  setAuthCode: (code: string) => void;
  deviceName: string;
  setDeviceName: (name: string) => void;
  phase: ConnectionPhase;
  errorBanner: string | null;
  onStartSession: (overrideRole?: PeerRole, overrideCode?: string) => void;
  onCancelWaiting: () => void;
  pairingInputRef: React.RefObject<HTMLInputElement | null>;
}

const PROTOCOL_SPECS = [
  {
    index: '01',
    id: 'architecture',
    title: 'Screen & Input Forwarding',
    detail:
      'Streams full OS displays or interactive workspaces over WebRTC with 60Hz unordered pointer frames and reliable keyboard dispatch.',
  },
  {
    index: '02',
    id: 'transfers',
    title: 'In-Chat Chunked File Stream',
    detail:
      'Attaches documents and binaries directly inside encrypted chat, split into 48 KB AES-GCM envelopes and verified via SHA-256.',
  },
  {
    index: '03',
    id: 'execution',
    title: 'Consented Program Execution',
    detail:
      'Dispatches diagnostic commands and host scripts remotely behind a per-session token and explicit Host approval gates.',
  },
  {
    index: '04',
    id: 'cryptography',
    title: 'ECDH Keying & SRTP Voice',
    detail:
      'Derives session AES-256-GCM keys from ephemeral P-256 keypairs salted with your pairing code, alongside full-duplex voice.',
  },
];

export const PairingLanding: React.FC<PairingLandingProps> = ({
  role,
  setRole,
  authCode,
  setAuthCode,
  deviceName,
  setDeviceName,
  phase,
  errorBanner,
  onStartSession,
  onCancelWaiting,
  pairingInputRef,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const normalizedCode = normalizeAuthCode(authCode);
  const codeReady = isValidAuthCode(normalizedCode);

  useEffect(() => {
    if (!codeReady) {
      setQrDataUrl('');
      return;
    }
    const url = buildPairingUrl(window.location.origin, normalizedCode);
    QRCode.toDataURL(url, {
      width: 240,
      margin: 2,
      color: {
        dark: '#111214',
        light: '#FFFFFF',
      },
    })
      .then((dataUrl) => setQrDataUrl(dataUrl))
      .catch(() => setQrDataUrl(''));
  }, [codeReady, normalizedCode]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(normalizedCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = buildPairingUrl(window.location.origin, normalizedCode);
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleRegenerateCode = () => {
    setAuthCode(generateAuthCode());
  };

  const handleQrDetected = (detectedCode: string) => {
    setRole('controller');
    setAuthCode(detectedCode);
    onStartSession('controller', detectedCode);
  };

  return (
    <main className="mx-auto max-w-[1360px] px-6 py-10 lg:py-14">
      <section
        id="pairing-console"
        className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start"
      >
        {/* Left 7 Columns: Editorial Masthead + Numbered Swiss Specification Ledger */}
        <div className="lg:col-span-7 lg:pr-6">
          <p className="font-mono text-xs font-medium tracking-wide text-[#D9381E]">
            Peer-to-Peer Remote Console
          </p>

          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#111214] sm:text-5xl lg:text-[3.5rem] leading-[1.06] [text-wrap:balance]">
            Operate another laptop over the internet from one shared code.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#4B5058]">
            Two devices enter the same 8-character authentication code or scan one QR code to open
            an encrypted WebRTC tunnel for screen control, in-chat file transfer, remote command
            execution, and voice audio.
          </p>

          {/* Hairline-divided 2x2 Editorial Specification Ledger (Asymmetric, No Pill/Card Clones) */}
          <div className="mt-10 border-t border-[#111214]">
            <div className="grid grid-cols-1 sm:grid-cols-2">
              {PROTOCOL_SPECS.map((spec, idx) => (
                <article
                  key={spec.id}
                  id={spec.id}
                  className={`py-6 border-b border-[#D6D6CE] ${
                    idx % 2 === 0 ? 'sm:pr-8 sm:border-r' : 'sm:pl-8'
                  }`}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs font-semibold text-[#D9381E]">
                      {spec.index}
                    </span>
                    <h2 className="font-display text-base font-semibold text-[#111214]">
                      {spec.title}
                    </h2>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[#4B5058] pl-7">
                    {spec.detail}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#6E747E] font-mono">
            <span>ECDH P-256 + AES-256-GCM</span>
            <span aria-hidden="true">/</span>
            <span>SHA-256 File Checksums</span>
            <span aria-hidden="true">/</span>
            <span>Host-Approved Execution</span>
          </div>
        </div>

        {/* Right 5 Columns: Utilitarian Pairing Instrument */}
        <div className="lg:col-span-5">
          <div className="rounded-[2px] border border-[#111214] bg-white p-6 sm:p-7">
            {/* Role Switch */}
            <div
              role="tablist"
              aria-label="Session Role"
              className="grid grid-cols-2 border border-[#D6D6CE] bg-[#F7F7F4] p-1 rounded-[2px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={role === 'host'}
                onClick={() => setRole('host')}
                disabled={phase === 'waiting'}
                className={`flex items-center justify-center gap-2 rounded-[2px] px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  role === 'host'
                    ? 'bg-[#111214] text-white'
                    : 'text-[#4B5058] hover:text-[#111214]'
                }`}
              >
                <Laptop className="h-4 w-4" aria-hidden="true" />
                Host This Device
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={role === 'controller'}
                onClick={() => setRole('controller')}
                disabled={phase === 'waiting'}
                className={`flex items-center justify-center gap-2 rounded-[2px] px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  role === 'controller'
                    ? 'bg-[#111214] text-white'
                    : 'text-[#4B5058] hover:text-[#111214]'
                }`}
              >
                <Monitor className="h-4 w-4" aria-hidden="true" />
                Connect to Device
              </button>
            </div>

            {errorBanner && (
              <div
                role="alert"
                className="mt-4 rounded-[2px] border border-[#B91C1C] bg-[#FEF2F2] px-3.5 py-2.5 text-sm text-[#991B1B]"
              >
                {errorBanner}
              </div>
            )}

            {phase === 'disconnected' && !errorBanner && (
              <div
                role="status"
                className="mt-4 rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] px-3.5 py-2.5 text-sm text-[#4B5058]"
              >
                Session closed. Start a new Host session or reconnect with an authentication code.
              </div>
            )}

            {/* Device Name */}
            <div className="mt-5">
              <label
                htmlFor="device-name-input"
                className="block text-xs font-medium text-[#111214]"
              >
                This Device Name
              </label>
              <input
                id="device-name-input"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                maxLength={48}
                disabled={phase === 'waiting'}
                placeholder="e.g. Studio MacBook Pro"
                className="mt-1.5 w-full rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] px-3.5 py-2.5 text-sm text-[#111214] placeholder:text-[#6E747E] focus:border-[#111214] focus:bg-white focus:outline-none"
              />
            </div>

            {/* Auth Code & QR */}
            <div className="mt-5 border-t border-[#D6D6CE] pt-5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="auth-code-input"
                  className="text-xs font-medium text-[#111214]"
                >
                  Shared Authentication Code
                </label>
                {role === 'host' && phase !== 'waiting' && (
                  <button
                    type="button"
                    onClick={handleRegenerateCode}
                    className="flex items-center gap-1 text-xs font-medium text-[#D9381E] hover:text-[#B82D16] transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    New Code
                  </button>
                )}
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <KeyRound
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E747E]"
                    aria-hidden="true"
                  />
                  <input
                    ref={pairingInputRef}
                    id="auth-code-input"
                    type="text"
                    value={authCode}
                    onChange={(e) => setAuthCode(normalizeAuthCode(e.target.value))}
                    maxLength={9}
                    disabled={phase === 'waiting'}
                    placeholder="K7M3-P9Q2"
                    className="w-full rounded-[2px] border border-[#111214] bg-white py-2.5 pl-9 pr-3 font-mono text-lg font-semibold tracking-wider text-[#111214] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#D9381E]/30"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCopyCode}
                  aria-label="Copy authentication code"
                  className="rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] p-2.5 text-[#111214] hover:border-[#111214] transition-colors shrink-0"
                >
                  {copiedCode ? (
                    <Check className="h-4 w-4 text-[#15803D]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="mt-2 text-xs text-[#4B5058] leading-relaxed">
                {role === 'host'
                  ? 'Share this code or QR with your remote partner. Both peers must use the exact same code.'
                  : 'Enter the Host authentication code or scan their QR code to establish an encrypted link.'}
              </p>

              {/* QR Display + Controls Row */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 border border-[#D6D6CE] bg-[#F7F7F4] p-4 rounded-[2px]">
                <div className="shrink-0 flex flex-col items-center">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`QR code for pairing code ${normalizedCode}`}
                      referrerPolicy="no-referrer"
                      className="h-28 w-28 border border-[#D6D6CE] bg-white p-1"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center border border-dashed border-[#D6D6CE] bg-white text-[11px] text-[#6E747E] text-center px-2">
                      Enter 8-character code
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-2.5">
                  <div className="font-mono text-xs text-[#4B5058]">
                    QR Pair Payload ·{' '}
                    <span className="font-semibold text-[#111214]">
                      {codeReady ? normalizedCode : '---- ----'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {role === 'controller' && (
                      <button
                        type="button"
                        onClick={() => setScannerOpen(true)}
                        disabled={phase === 'waiting'}
                        className="flex items-center gap-1.5 rounded-[2px] border border-[#111214] bg-white px-3 py-2 text-xs font-medium text-[#111214] hover:bg-[#111214] hover:text-white transition-colors whitespace-nowrap shrink-0"
                      >
                        <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
                        Scan QR Code
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleCopyLink}
                      disabled={!codeReady}
                      className="flex items-center gap-1.5 rounded-[2px] border border-[#D6D6CE] bg-white px-3 py-2 text-xs font-medium text-[#4B5058] hover:border-[#111214] hover:text-[#111214] transition-colors whitespace-nowrap shrink-0 disabled:opacity-40"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-[#15803D]" aria-hidden="true" />
                          Link Copied
                        </>
                      ) : (
                        <>
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                          Copy Pairing Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Action */}
            <div className="mt-6 border-t border-[#D6D6CE] pt-5">
              {phase === 'waiting' ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#111214]">
                      Waiting for {role === 'host' ? 'Controller' : 'Host'} on{' '}
                      <span className="font-mono text-[#D9381E]">{normalizedCode}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[#4B5058]">
                      ECDH P-256 public key advertised. Session opens automatically upon peer join.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onCancelWaiting}
                    className="rounded-[2px] border border-[#111214] bg-white px-4 py-2 text-sm font-medium text-[#111214] hover:bg-[#111214] hover:text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onStartSession()}
                  disabled={!codeReady}
                  className="w-full rounded-[2px] bg-[#D9381E] px-5 py-3 text-sm font-semibold text-white hover:bg-[#B82D16] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111214] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {role === 'host'
                    ? 'Open Host Session & Wait for Peer'
                    : 'Connect to Remote Device'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onCodeDetected={handleQrDetected}
      />
    </main>
  );
};
