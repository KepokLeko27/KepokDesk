export function sanitizeAgentToken(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export function buildWindowsBatLauncher(origin: string, token: string): string {
  const safeOrigin = origin.replace(/[^a-zA-Z0-9:/._-]/g, '');
  const safeToken = sanitizeAgentToken(token);
  const psUrl = `${safeOrigin}/api/agent/windows.ps1?token=${safeToken}`;
  return [
    '@echo off',
    'title KepokDesk Remote Control Helper',
    'echo Starting KepokDesk OS Click ^& Keyboard Helper...',
    'echo Keep this window open while your partner repairs your laptop.',
    'echo Close this window anytime to immediately stop remote control.',
    'echo.',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm '${psUrl}' | iex"`,
    'if errorlevel 1 (',
    '  echo.',
    '  echo KepokDesk Helper exited with an error.',
    '  pause',
    ')',
    '',
  ].join('\r\n');
}

export function buildWindowsPowerShellAgent(token: string): string {
  const safeToken = sanitizeAgentToken(token);
  return `# KepokDesk Local OS Control Helper (Windows)
# Runs strictly on 127.0.0.1:47890 and authenticates with your session token.
$ErrorActionPreference = 'Stop'
$AgentToken = '${safeToken}'

$csharp = @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class KepokAgent {
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;

    private const uint MOUSEEVENTF_MOVE = 0x0001;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;
    private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

    private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    private static string expectedToken = "";

    public static void Run(string token) {
        expectedToken = token ?? "";
        try { SetProcessDPIAware(); } catch {}

        int screenW = Math.Max(1, GetSystemMetrics(0));
        int screenH = Math.Max(1, GetSystemMetrics(1));

        var listener = new HttpListener();
        listener.Prefixes.Add("http://127.0.0.1:47890/");
        listener.Start();

        Console.WriteLine("[KepokDesk] OS Control Helper listening on ws://127.0.0.1:47890 (" + screenW + "x" + screenH + ")");
        Console.WriteLine("[KepokDesk] Keep this window open. Press Ctrl+C or close to stop remote control.");

        while (listener.IsListening) {
            HttpListenerContext ctx = null;
            try {
                ctx = listener.GetContext();
            } catch {
                break;
            }
            if (ctx == null) continue;
            Task.Run(() => HandleContext(ctx, screenW, screenH));
        }
    }

    private static async Task HandleContext(HttpListenerContext ctx, int screenW, int screenH) {
        try {
            if (!ctx.Request.IsWebSocketRequest) {
                string q = ((char)34).ToString();
                ctx.Response.StatusCode = 200;
                ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
                ctx.Response.Headers.Add("Access-Control-Allow-Private-Network", "true");
                byte[] ok = Encoding.UTF8.GetBytes("{" + q + "ok" + q + ":true," + q + "agent" + q + ":" + q + "KepokDesk" + q + "}");
                ctx.Response.ContentType = "application/json";
                await ctx.Response.OutputStream.WriteAsync(ok, 0, ok.Length);
                ctx.Response.Close();
                return;
            }

            string reqToken = ctx.Request.QueryString["token"] ?? "";
            if (!string.IsNullOrEmpty(expectedToken) && !string.Equals(reqToken, expectedToken, StringComparison.Ordinal)) {
                ctx.Response.StatusCode = 403;
                ctx.Response.Close();
                Console.WriteLine("[KepokDesk] Rejected connection with invalid token.");
                return;
            }

            var wsContext = await ctx.AcceptWebSocketAsync(null);
            var ws = wsContext.WebSocket;
            Console.WriteLine("[KepokDesk] Host browser connected - real OS mouse & keyboard control active.");

            string q2 = ((char)34).ToString();
            string hello = "{" + q2 + "type" + q2 + ":" + q2 + "ready" + q2 + "," + q2 + "platform" + q2 + ":" + q2 + "windows" + q2 + "," + q2 + "screenWidth" + q2 + ":" + screenW + "," + q2 + "screenHeight" + q2 + ":" + screenH + "}";
            byte[] helloBytes = Encoding.UTF8.GetBytes(hello);
            await ws.SendAsync(new ArraySegment<byte>(helloBytes), WebSocketMessageType.Text, true, CancellationToken.None);

            var buffer = new byte[16384];
            var msgBytes = new List<byte>();
            while (ws.State == WebSocketState.Open) {
                msgBytes.Clear();
                WebSocketReceiveResult result;
                do {
                    result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                    if (result.MessageType == WebSocketMessageType.Close) {
                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                        Console.WriteLine("[KepokDesk] Host browser disconnected.");
                        return;
                    }
                    for (int i = 0; i < result.Count; i++) msgBytes.Add(buffer[i]);
                } while (!result.EndOfMessage);

                string json = Encoding.UTF8.GetString(msgBytes.ToArray());
                ProcessCommand(json);
            }
        } catch (Exception ex) {
            Console.WriteLine("[KepokDesk] Session closed: " + ex.Message);
        }
    }

    private static string ReadJsonString(string json, ref int i) {
        if (i >= json.Length || json[i] != (char)34) return "";
        i++;
        var sb = new StringBuilder();
        while (i < json.Length) {
            char c = json[i++];
            if (c == (char)34) return sb.ToString();
            if (c == (char)92 && i < json.Length) {
                char esc = json[i++];
                if (esc == 'n') sb.Append((char)10);
                else if (esc == 'r') sb.Append((char)13);
                else if (esc == 't') sb.Append((char)9);
                else if (esc == 'u' && i + 4 <= json.Length) {
                    int code;
                    if (int.TryParse(json.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out code)) {
                        sb.Append((char)code);
                        i += 4;
                    }
                } else {
                    sb.Append(esc);
                }
            } else {
                sb.Append(c);
            }
        }
        return sb.ToString();
    }

    private static void SkipWhitespace(string json, ref int i) {
        while (i < json.Length && char.IsWhiteSpace(json[i])) i++;
    }

    private static int FindJsonValueIndex(string json, string targetKey) {
        int i = 0;
        while (i < json.Length) {
            char c = json[i];
            if (c == (char)34) {
                string key = ReadJsonString(json, ref i);
                SkipWhitespace(json, ref i);
                if (i < json.Length && json[i] == ':') {
                    i++;
                    SkipWhitespace(json, ref i);
                    if (string.Equals(key, targetKey, StringComparison.Ordinal)) {
                        return i;
                    }
                    if (i < json.Length && json[i] == (char)34) {
                        ReadJsonString(json, ref i);
                    }
                }
            } else {
                i++;
            }
        }
        return -1;
    }

    private static string GetJsonString(string json, string key) {
        int idx = FindJsonValueIndex(json, key);
        if (idx < 0 || idx >= json.Length || json[idx] != (char)34) return "";
        return ReadJsonString(json, ref idx);
    }

    private static double GetJsonDouble(string json, string key, double fallback) {
        int idx = FindJsonValueIndex(json, key);
        if (idx < 0 || idx >= json.Length) return fallback;
        int end = idx;
        while (end < json.Length) {
            char c = json[end];
            if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') {
                end++;
            } else {
                break;
            }
        }
        if (end == idx) return fallback;
        double v;
        return double.TryParse(json.Substring(idx, end - idx), NumberStyles.Float, CultureInfo.InvariantCulture, out v) ? v : fallback;
    }

    private static bool GetJsonBool(string json, string key) {
        int idx = FindJsonValueIndex(json, key);
        if (idx < 0 || idx + 4 > json.Length) return false;
        return string.Compare(json, idx, "true", 0, 4, StringComparison.Ordinal) == 0;
    }

    private static void ProcessCommand(string json) {
        string type = GetJsonString(json, "type");
        if (type == "pointer") {
            string kind = GetJsonString(json, "kind");
            double x = Math.Max(0.0, Math.Min(1.0, GetJsonDouble(json, "x", 0.5)));
            double y = Math.Max(0.0, Math.Min(1.0, GetJsonDouble(json, "y", 0.5)));
            int button = (int)GetJsonDouble(json, "button", 0);
            double deltaY = GetJsonDouble(json, "deltaY", 0);

            int absX = (int)Math.Round(x * 65535.0);
            int absY = (int)Math.Round(y * 65535.0);

            if (kind == "move") {
                SendMouse(absX, absY, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE);
            } else if (kind == "down") {
                uint btnFlag = button == 2 ? MOUSEEVENTF_RIGHTDOWN : (button == 1 ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_LEFTDOWN);
                SendMouse(absX, absY, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | btnFlag);
            } else if (kind == "up") {
                uint btnFlag = button == 2 ? MOUSEEVENTF_RIGHTUP : (button == 1 ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_LEFTUP);
                SendMouse(absX, absY, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | btnFlag);
            } else if (kind == "wheel") {
                int wheelDelta = Math.Max(-360, Math.Min(360, (int)Math.Round(-deltaY * 1.2)));
                SendMouse(absX, absY, unchecked((uint)wheelDelta), MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_WHEEL);
            }
        } else if (type == "key") {
            string kind = GetJsonString(json, "kind");
            string key = GetJsonString(json, "key");
            bool ctrl = GetJsonBool(json, "ctrlKey");
            bool alt = GetJsonBool(json, "altKey");
            bool meta = GetJsonBool(json, "metaKey");
            bool isUp = kind == "keyup";
            SendKey(key, isUp, ctrl, alt, meta);
        }
    }

    private static void SendMouse(int absX, int absY, uint mouseData, uint flags) {
        var inputs = new INPUT[1];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].U.mi.dx = absX;
        inputs[0].U.mi.dy = absY;
        inputs[0].U.mi.mouseData = mouseData;
        inputs[0].U.mi.dwFlags = flags;
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    private static void SendKey(string key, bool isUp, bool ctrl, bool alt, bool meta) {
        if (string.IsNullOrEmpty(key)) return;
        ushort vk = MapSpecialKey(key);
        if (vk != 0) {
            uint flags = isUp ? KEYEVENTF_KEYUP : 0;
            if (IsExtendedVk(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
            SendVk(vk, flags);
            return;
        }

        if (key.Length == 1) {
            char ch = key[0];
            if (ctrl || alt || meta) {
                char upper = char.ToUpperInvariant(ch);
                if ((upper >= 'A' && upper <= 'Z') || (upper >= '0' && upper <= '9')) {
                    SendVk((ushort)upper, isUp ? KEYEVENTF_KEYUP : 0);
                }
                return;
            }
            var inputs = new INPUT[1];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].U.ki.wVk = 0;
            inputs[0].U.ki.wScan = (ushort)ch;
            inputs[0].U.ki.dwFlags = KEYEVENTF_UNICODE | (isUp ? KEYEVENTF_KEYUP : 0);
            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }
    }

    private static void SendVk(ushort vk, uint flags) {
        var inputs = new INPUT[1];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].U.ki.wVk = vk;
        inputs[0].U.ki.dwFlags = flags;
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    private static bool IsExtendedVk(ushort vk) {
        return vk == 0x21 || vk == 0x22 || vk == 0x23 || vk == 0x24 ||
               vk == 0x25 || vk == 0x26 || vk == 0x27 || vk == 0x28 ||
               vk == 0x2D || vk == 0x2E || vk == 0x5B;
    }

    private static ushort MapSpecialKey(string key) {
        switch (key) {
            case "Backspace": return 0x08;
            case "Tab": return 0x09;
            case "Enter": return 0x0D;
            case "Shift": return 0x10;
            case "Control": return 0x11;
            case "Alt": return 0x12;
            case "Pause": return 0x13;
            case "CapsLock": return 0x14;
            case "Escape": return 0x1B;
            case " ": return 0x20;
            case "PageUp": return 0x21;
            case "PageDown": return 0x22;
            case "End": return 0x23;
            case "Home": return 0x24;
            case "ArrowLeft": return 0x25;
            case "ArrowUp": return 0x26;
            case "ArrowRight": return 0x27;
            case "ArrowDown": return 0x28;
            case "Insert": return 0x2D;
            case "Delete": return 0x2E;
            case "Meta": return 0x5B;
            case "F1": return 0x70;
            case "F2": return 0x71;
            case "F3": return 0x72;
            case "F4": return 0x73;
            case "F5": return 0x74;
            case "F6": return 0x75;
            case "F7": return 0x76;
            case "F8": return 0x77;
            case "F9": return 0x78;
            case "F10": return 0x79;
            case "F11": return 0x7A;
            case "F12": return 0x7B;
            default: return 0;
        }
    }
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp
[KepokAgent]::Run($AgentToken)
`;
}

export function buildMacOsAgentScript(token: string): string {
  const safeToken = sanitizeAgentToken(token);
  return `#!/usr/bin/env bash
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to run the KepokDesk macOS control helper."
  exit 1
fi

echo "Starting KepokDesk macOS OS Control Helper on ws://127.0.0.1:47890"
echo "If clicks do not move the cursor, grant Terminal Accessibility permission in:"
echo "  System Settings -> Privacy & Security -> Accessibility"

KEPOK_TOKEN="${safeToken}" python3 - <<'PY'
import base64, ctypes, hashlib, json, os, socket, struct, threading
from urllib.parse import urlparse, parse_qs

EXPECTED_TOKEN = os.environ.get("KEPOK_TOKEN", "")
cg = ctypes.CDLL("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
cf = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")

class CGPoint(ctypes.Structure):
    _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

cg.CGMainDisplayID.restype = ctypes.c_uint32
cg.CGDisplayPixelsWide.argtypes = [ctypes.c_uint32]
cg.CGDisplayPixelsWide.restype = ctypes.c_size_t
cg.CGDisplayPixelsHigh.argtypes = [ctypes.c_uint32]
cg.CGDisplayPixelsHigh.restype = ctypes.c_size_t

cg.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, CGPoint, ctypes.c_uint32]
cg.CGEventCreateMouseEvent.restype = ctypes.c_void_p
cg.CGEventCreateScrollWheelEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_int32]
cg.CGEventCreateScrollWheelEvent.restype = ctypes.c_void_p
cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
cf.CFRelease.argtypes = [ctypes.c_void_p]

main_id = cg.CGMainDisplayID()
SCREEN_W = int(cg.CGDisplayPixelsWide(main_id)) or 1440
SCREEN_H = int(cg.CGDisplayPixelsHigh(main_id)) or 900

MAC_KEYS = {
    "Return": 36, "Enter": 36, "Tab": 48, " ": 49, "Backspace": 51, "Escape": 53,
    "Delete": 117, "ArrowLeft": 123, "ArrowRight": 124, "ArrowDown": 125, "ArrowUp": 126,
    "Home": 115, "End": 119, "PageUp": 116, "PageDown": 121,
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
    "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
    "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26,
    "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35,
    "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\\\": 42, ",": 43, "/": 44, "n": 45,
    "m": 46, ".": 47, "\`": 50
}

def post_mouse(ev_type, x, y, btn=0):
    ev = cg.CGEventCreateMouseEvent(None, ev_type, CGPoint(x, y), btn)
    if ev:
        cg.CGEventPost(0, ev)
        cf.CFRelease(ev)

def handle_cmd(msg):
    t = msg.get("type")
    if t == "pointer":
        kind = msg.get("kind")
        x = max(0.0, min(1.0, float(msg.get("x", 0.5)))) * SCREEN_W
        y = max(0.0, min(1.0, float(msg.get("y", 0.5)))) * SCREEN_H
        btn = int(msg.get("button", 0) or 0)
        if kind == "move":
            post_mouse(5, x, y, 0)
        elif kind == "down":
            ev_t = 3 if btn == 2 else (25 if btn == 1 else 1)
            post_mouse(ev_t, x, y, btn)
        elif kind == "up":
            ev_t = 4 if btn == 2 else (26 if btn == 1 else 2)
            post_mouse(ev_t, x, y, btn)
        elif kind == "wheel":
            dy = int(-float(msg.get("deltaY", 0)) / 10)
            ev = cg.CGEventCreateScrollWheelEvent(None, 0, 1, dy)
            if ev:
                cg.CGEventPost(0, ev)
                cf.CFRelease(ev)
    elif t == "key":
        key = msg.get("key", "")
        is_down = msg.get("kind") != "keyup"
        kc = MAC_KEYS.get(key) or MAC_KEYS.get(key.lower())
        if kc is not None:
            ev = cg.CGEventCreateKeyboardEvent(None, kc, is_down)
            if ev:
                cg.CGEventPost(0, ev)
                cf.CFRelease(ev)

def ws_send(conn, text):
    data = text.encode("utf-8")
    header = bytes([0x81]) + (bytes([len(data)]) if len(data) < 126 else struct.pack("!BH", 126, len(data)))
    conn.sendall(header + data)

def ws_recv(conn):
    b = conn.recv(2)
    if len(b) < 2: return None
    opcode = b[0] & 0x0F
    if opcode == 8: return None
    masked = (b[1] & 0x80) != 0
    length = b[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", conn.recv(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", conn.recv(8))[0]
    mask = conn.recv(4) if masked else b""
    payload = bytearray()
    while len(payload) < length:
        chunk = conn.recv(length - len(payload))
        if not chunk: return None
        payload.extend(chunk)
    if masked:
        for i in range(len(payload)):
            payload[i] ^= mask[i % 4]
    return payload.decode("utf-8", errors="ignore")

def serve_client(conn):
    try:
        req = conn.recv(4096).decode("utf-8", errors="ignore")
        first = req.splitlines()[0] if req else ""
        path = first.split(" ")[1] if len(first.split(" ")) > 1 else "/"
        token = parse_qs(urlparse(path).query).get("token", [""])[0]
        if EXPECTED_TOKEN and token != EXPECTED_TOKEN:
            conn.sendall(b"HTTP/1.1 403 Forbidden\\r\\n\\r\\n")
            return
        key = ""
        for line in req.splitlines():
            if line.lower().startswith("sec-websocket-key:"):
                key = line.split(":", 1)[1].strip()
        accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        conn.sendall(f"HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: {accept}\\r\\n\\r\\n".encode())
        ws_send(conn, json.dumps({"type": "ready", "platform": "macos", "screenWidth": SCREEN_W, "screenHeight": SCREEN_H}))
        while True:
            raw = ws_recv(conn)
            if raw is None: break
            try: handle_cmd(json.loads(raw))
            except Exception: pass
    finally:
        conn.close()

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", 47890))
srv.listen(4)
print(f"[KepokDesk] Ready ({SCREEN_W}x{SCREEN_H})")
while True:
    c, _ = srv.accept()
    threading.Thread(target=serve_client, args=(c,), daemon=True).start()
PY
`;
}

export function buildLinuxAgentScript(token: string): string {
  const safeToken = sanitizeAgentToken(token);
  return `#!/usr/bin/env bash
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to run the KepokDesk Linux control helper."
  exit 1
fi
if ! command -v xdotool >/dev/null 2>&1; then
  echo "xdotool is required for X11 desktop clicking. Install it first:"
  echo "  sudo apt install xdotool   (Debian/Ubuntu)"
  echo "  sudo dnf install xdotool   (Fedora)"
  exit 1
fi

echo "Starting KepokDesk Linux OS Control Helper on ws://127.0.0.1:47890"

KEPOK_TOKEN="${safeToken}" python3 - <<'PY'
import base64, hashlib, json, os, socket, struct, subprocess, threading
from urllib.parse import urlparse, parse_qs

EXPECTED_TOKEN = os.environ.get("KEPOK_TOKEN", "")
try:
    dims = subprocess.check_output(["xdotool", "getdisplaygeometry"]).decode().strip().split()
    SCREEN_W, SCREEN_H = int(dims[0]), int(dims[1])
except Exception:
    SCREEN_W, SCREEN_H = 1920, 1080

KEY_MAP = {
    "Enter": "Return", "Backspace": "BackSpace", "Tab": "Tab", "Escape": "Escape",
    "Delete": "Delete", "Home": "Home", "End": "End", "PageUp": "Prior", "PageDown": "Next",
    "ArrowLeft": "Left", "ArrowRight": "Right", "ArrowUp": "Up", "ArrowDown": "Down", " ": "space"
}

def handle_cmd(msg):
    t = msg.get("type")
    if t == "pointer":
        kind = msg.get("kind")
        x = int(max(0.0, min(1.0, float(msg.get("x", 0.5)))) * SCREEN_W)
        y = int(max(0.0, min(1.0, float(msg.get("y", 0.5)))) * SCREEN_H)
        btn = int(msg.get("button", 0) or 0)
        xbtn = "3" if btn == 2 else ("2" if btn == 1 else "1")
        if kind == "move":
            subprocess.Popen(["xdotool", "mousemove", str(x), str(y)])
        elif kind == "down":
            subprocess.Popen(["xdotool", "mousemove", str(x), str(y), "mousedown", xbtn])
        elif kind == "up":
            subprocess.Popen(["xdotool", "mousemove", str(x), str(y), "mouseup", xbtn])
        elif kind == "wheel":
            dy = float(msg.get("deltaY", 0))
            subprocess.Popen(["xdotool", "click", "5" if dy > 0 else "4"])
    elif t == "key" and msg.get("kind") != "keyup":
        key = msg.get("key", "")
        if key in KEY_MAP:
            subprocess.Popen(["xdotool", "key", KEY_MAP[key]])
        elif len(key) == 1:
            subprocess.Popen(["xdotool", "type", "--delay", "0", key])

def ws_send(conn, text):
    data = text.encode("utf-8")
    header = bytes([0x81]) + (bytes([len(data)]) if len(data) < 126 else struct.pack("!BH", 126, len(data)))
    conn.sendall(header + data)

def ws_recv(conn):
    b = conn.recv(2)
    if len(b) < 2: return None
    if (b[0] & 0x0F) == 8: return None
    masked = (b[1] & 0x80) != 0
    length = b[1] & 0x7F
    if length == 126: length = struct.unpack("!H", conn.recv(2))[0]
    elif length == 127: length = struct.unpack("!Q", conn.recv(8))[0]
    mask = conn.recv(4) if masked else b""
    payload = bytearray()
    while len(payload) < length:
        chunk = conn.recv(length - len(payload))
        if not chunk: return None
        payload.extend(chunk)
    if masked:
        for i in range(len(payload)): payload[i] ^= mask[i % 4]
    return payload.decode("utf-8", errors="ignore")

def serve_client(conn):
    try:
        req = conn.recv(4096).decode("utf-8", errors="ignore")
        first = req.splitlines()[0] if req else ""
        path = first.split(" ")[1] if len(first.split(" ")) > 1 else "/"
        token = parse_qs(urlparse(path).query).get("token", [""])[0]
        if EXPECTED_TOKEN and token != EXPECTED_TOKEN:
            conn.sendall(b"HTTP/1.1 403 Forbidden\\r\\n\\r\\n")
            return
        key = ""
        for line in req.splitlines():
            if line.lower().startswith("sec-websocket-key:"):
                key = line.split(":", 1)[1].strip()
        accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        conn.sendall(f"HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: {accept}\\r\\n\\r\\n".encode())
        ws_send(conn, json.dumps({"type": "ready", "platform": "linux", "screenWidth": SCREEN_W, "screenHeight": SCREEN_H}))
        while True:
            raw = ws_recv(conn)
            if raw is None: break
            try: handle_cmd(json.loads(raw))
            except Exception: pass
    finally:
        conn.close()

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", 47890))
srv.listen(4)
print(f"[KepokDesk] Ready ({SCREEN_W}x{SCREEN_H})")
while True:
    c, _ = srv.accept()
    threading.Thread(target=serve_client, args=(c,), daemon=True).start()
PY
`;
}
