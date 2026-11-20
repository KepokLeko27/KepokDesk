


# KepokDesk

### Peer-to-Peer Remote Desktop & Collaboration Console

KepokDesk is a web-based remote desktop application designed to allow users to remotely access, control and troubleshoot another computer over the internet.

It uses peer-to-peer communication, end-to-end session encryption and a shared authentication code to establish a connection between two devices.

![KepokDesk Application](https://github.com/user-attachments/assets/2f9b0869-5094-48df-b766-848034ca5d21)

---

## Features

- **Device Pairing** – Connect two devices using an 8-character authentication code or QR code.
- **End-to-End Encryption** – Protect session messages and control data using ECDH, HKDF and AES-256-GCM.
- **Remote Desktop Control** – Share screens and remotely control mouse and keyboard inputs.
- **Chat & File Transfer** – Exchange encrypted messages and transfer files between connected devices.
- **Remote Command Execution** – Request diagnostic commands on the Host device with approval controls.
- **Voice Communication** – Communicate through real-time WebRTC audio.
- **System Monitoring** – Monitor Host CPU usage, memory consumption and connection latency.
- **Cross-Platform Desktop Agent** – Optional native control helpers for Windows, macOS and Linux.

## Technologies Used

| Category | Technologies |
|---|---|
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Development | Vite 8 |
| Backend | Node.js, Express |
| Communication | WebRTC, WebSocket |
| Cryptography | Web Crypto API, AES-256-GCM |
| QR Integration | qrcode, jsqr |

## How It Works

1. **Host Device:** Opens KepokDesk and generates a pairing code or QR code.
2. **Controller Device:** Enters the shared code or scans the QR code.
3. **Secure Connection:** Both devices establish an encrypted session and verify their security fingerprints.
4. **Remote Access:** The Controller can access the shared screen and available collaboration features, subject to Host permissions.

## Project Structure

```text
KepokDesk/
├── public/
├── server/
│   ├── agentScripts.ts
│   └── agentScripts.test.ts
├── src/
│   ├── components/
│   ├── hooks/
│   ├── types/
│   └── utils/
├── server.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Getting Started

### Prerequisites

- Node.js 22+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/KepokLeko27/KepokDesk.git

# Navigate into the project
cd KepokDesk

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build the Project

```bash
npm run build
```

### Run Tests

```bash
npx tsx --test src/utils/*.test.ts server/*.test.ts
```

## Security Notes

KepokDesk implements encrypted peer sessions and Host authorization controls.

Because the application supports remote desktop input and command execution, only connect to trusted devices. Verify the security fingerprint on both devices and review remote commands before approving them.

The command validation is a basic safeguard, not a complete execution sandbox. An independent security review is recommended before using the application with sensitive systems.

---

**KepokDesk** – Remote Access. Secure Connection. Seamless Collaboration.


---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
