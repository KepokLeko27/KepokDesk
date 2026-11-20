# KEPOKDESK

> End-to-End Encrypted Peer-to-Peer Remote Desktop & Collaboration Console

KepokDesk is a low-latency, peer-to-peer remote support and collaboration web application designed for operating and troubleshooting a distant laptop over the internet. Two peers connect using a shared 8-character authentication code (`XXXX-XXXX`) or scannable QR pairing link to establish an ephemeral ECDH-derived AES-256-GCM encrypted session supporting live screen sharing, remote desktop clicking and typing, in-chat chunked file transfers, host-consented command execution, full-duplex WebRTC voice audio, and real-time host CPU/memory diagnostics.

---

## Features

- **Code & QR Peer Pairing:** Connects a Host and Controller using a matching 8-character pairing code (`XXXX-XXXX`), deep link (`?pair=CODE`), or live camera / screenshot QR scanner (`jsqr` + `qrcode`).
- **End-to-End Session Encryption:** Negotiates ephemeral `ECDH P-256` keypairs salted with the shared pairing code via `HKDF-SHA256` to derive `AES-256-GCM` keys inside the Web Crypto API, generating a verifiable 6-block safety fingerprint on both peers while leaving the signaling server blind to payloads.
- **Low-Latency Screen & Input Control:** Streams full OS displays (`getDisplayMedia`) or an interactive browser workspace (`captureStream`) over WebRTC with `object-contain` coordinate normalization, right-click/double-click/wheel support, and lossless reliable delivery for discrete clicks and keystrokes.
- **Native OS Control Helper (Windows, macOS, Linux):** Serves zero-dependency localhost WebSocket helpers (`/api/agent/windows.bat`, `/api/agent/windows.ps1`, `/api/agent/macos.sh`, `/api/agent/linux.sh`) on `127.0.0.1:47890` with per-session token authentication so remote clicks and keystrokes drive native Win32 (`SendInput`), macOS (`CoreGraphics`), and Linux X11 (`xdotool`) desktops directly.
- **In-Chat Chunked File Transfers:** Splits files attached directly in encrypted chat into 48 KB `AES-256-GCM` envelopes over reliable DataChannels with WebRTC backpressure control, progress indicators, and end-to-end `SHA-256` integrity verification.
- **Consented Remote Program Execution:** Lets a Controller dispatch diagnostic commands or quick presets to the Host behind a server-enforced command policy, per-session `x-host-token` authorization, and explicit Host approval or auto-approve controls.
- **Full-Duplex Encrypted Voice Chat:** Adds WebRTC SRTP microphone audio with echo cancellation, noise suppression, live audio level metering, and speaker mute controls without leaving the active session.
- **Live Host Resource Overlay:** Streams real-time Host CPU percentage, core count, memory usage (`GB` & `%`), 1-minute load average, and round-trip latency (`RTT`) inside `ActiveSessionView` to help diagnose lag.

---

## Technologies Used

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide React
- **Backend & Signaling:** Node.js 22+, Express 4, WebSockets (`ws`), TSX
- **Transport & Cryptography:** WebRTC (`RTCPeerConnection`, `RTCDataChannel`, SRTP), Web Crypto API (`ECDH P-256`, `HKDF-SHA256`, `AES-256-GCM`, `SHA-256`)
- **QR & Media Utilities:** `qrcode`, `jsqr`, `getDisplayMedia`, `getUserMedia`, Web Audio API
- **OS Control Helpers:** PowerShell / C# Win32 `SendInput` (Windows), Python 3 + `CoreGraphics` (macOS), Python 3 + `xdotool` (Linux)

---

## Folder Structure

```text
├── index.html                        # Document entry point, metadata, and typography links
├── metadata.json                     # Applet capability and permission manifest
├── package.json                      # Dependencies, build, lint, and runtime scripts
├── server.ts                         # Express server, WebSocket signaling relay, and host APIs
├── tsconfig.json                     # TypeScript compiler configuration
├── vite.config.ts                    # Vite bundling and Tailwind CSS 4 setup
├── .env.example                      # Environment variable template
├── server/
│   ├── agentScripts.ts               # Windows, macOS, and Linux local OS helper generators
│   └── agentScripts.test.ts          # Unit tests for OS helper script generation
└── src/
    ├── App.tsx                       # Root state orchestration and ?pair= deep-link handler
    ├── main.tsx                      # React 19 DOM entry point
    ├── index.css                     # Tailwind CSS 4 theme tokens and base typography
    ├── components/
    │   ├── ActiveSessionView.tsx     # Split-pane remote control, chat, and session header
    │   ├── ChatAndFilesPanel.tsx     # Encrypted messaging and inline SHA-256 file transfers
    │   ├── DesktopAgentModal.tsx     # Cross-platform OS control helper installer & status
    │   ├── HostMetricsOverlay.tsx    # Collapsible live Host CPU, memory, load, and RTT HUD
    │   ├── HostWorkspaceCanvas.tsx   # Host broadcast surface and interactive canvas fallback
    │   ├── PairingLanding.tsx        # Asymmetric pairing console and QR code generator
    │   ├── ProgramsPanel.tsx         # Consented remote command runner and approval queue
    │   ├── QrScannerModal.tsx        # Camera and image-upload QR code scanner
    │   ├── RemoteViewport.tsx        # Controller screen surface with pointer/key capture
    │   ├── SecurityPanel.tsx         # Safety fingerprint, cipher suite, and transport inspector
    │   └── TopNav.tsx                # Landing navigation bar
    ├── hooks/
    │   └── usePeerSession.ts         # E2EE handshake, WebRTC, relay fallback, and agent bridge
    ├── types/
    │   └── session.ts                # Shared TypeScript interfaces and encrypted packet types
    └── utils/
        ├── e2ee.ts                   # ECDH, HKDF, AES-256-GCM, and SHA-256 helpers
        ├── e2ee.test.ts              # Cryptography and key-isolation unit tests
        ├── fileChunker.ts            # Chunk slicing and out-of-order reassembly
        ├── fileChunker.test.ts       # File chunking and reassembly unit tests
        ├── pairing.ts                # Auth code generation, normalization, and QR URL parsing
        ├── pairing.test.ts           # Pairing code and QR payload unit tests
        ├── remoteCommandPolicy.ts    # Command presets and destructive-pattern validation
        ├── remoteCommandPolicy.test.ts
        ├── remoteInput.ts            # Contained video coordinate mapping and channel priority
        ├── remoteInput.test.ts       # Pointer mapping and transport routing unit tests
        ├── systemMetrics.ts          # CPU tick delta and memory calculation helpers
        └── systemMetrics.test.ts     # Telemetry math unit tests
```

---

## Getting Started

### Prerequisites

- **Node.js 22+** (supports native TypeScript execution via `node server.ts`)
- **npm** (or **bun**)

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (optional for local dev)
cp .env.example .env

# 3. Start Express + Vite development server on http://localhost:3000
npm run dev
```

### Production Build & Start

```bash
# Build frontend assets into dist/
npm run build

# Start production server on PORT (defaults to 3000)
NODE_ENV=production npm start
```

---

## Remote Desktop Control Workflow

1. **Pair Peers:** Open KepokDesk on the **Host** device, select **Host This Device**, and start a session to generate an 8-character code and QR payload. Enter the same code or scan the QR code on the **Controller** device.
2. **Verify Session:** Confirm the 6-block safety fingerprint in the **Security** tab matches on both devices.
3. **Share Screen & Enable OS Clicking:**
   - Click **Share System Screen** on the Host to broadcast a monitor or application window.
   - Click **Enable OS Clicking** on the Host to launch the local `127.0.0.1:47890` helper (`kepokdesk-agent.bat` on Windows, or the single-line shell script on macOS/Linux) so Controller mouse clicks and keyboard shortcuts operate native OS windows directly.
4. **Diagnose & Repair:** Use **Chat & Files** for encrypted file transfer, **Programs** for host-approved diagnostics, **Voice** for live audio, and the **Host Resources** overlay to monitor remote CPU/memory load.

---

## Verification & Testing

```bash
# Run all unit tests (crypto, pairing, chunking, input mapping, metrics, agent scripts)
npx tsx --test src/utils/*.test.ts server/*.test.ts

# Type-check codebase
npm run lint
```

---

## Security Architecture

- **Zero-Knowledge Signaling:** `server.ts` routes WebRTC SDP/ICE messages and opaque AES-GCM envelopes (`e2ee:envelope`, `e2ee:control`) between two room peers without holding session decryption keys.
- **Session-Scoped Host Authorization:** Host command execution (`/api/host/exec`), directory listing (`/api/host/files`), and telemetry (`/api/host/metrics`) require a per-session `x-host-token` issued exclusively to the Host peer.
- **Loopback-Only OS Agent:** The optional native input helper binds strictly to `127.0.0.1:47890`, verifies the session query token on WebSocket upgrade, and terminates immediately when the helper window is closed.
