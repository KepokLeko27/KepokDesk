const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generates an unambiguous 8-character authentication code formatted as XXXX-XXXX.
 */
export function generateAuthCode(randomValues?: Uint8Array): string {
  const bytes = randomValues ?? crypto.getRandomValues(new Uint8Array(8));
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

/**
 * Normalizes user-entered auth codes or pairing URLs into canonical XXXX-XXXX form.
 */
export function normalizeAuthCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length <= 4) {
    return cleaned;
  }
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
}

/**
 * Validates whether a normalized or raw string contains an 8-character alphanumeric pairing code.
 */
export function isValidAuthCode(input: string): boolean {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length === 8;
}

export interface PairingQrPayload {
  app: 'KepokDesk';
  code: string;
  v: 1;
}

/**
 * Builds a shareable pairing URL for QR encoding so mobile or desktop cameras can open it directly.
 */
export function buildPairingUrl(origin: string, authCode: string): string {
  const normalized = normalizeAuthCode(authCode);
  const url = new URL(origin);
  url.searchParams.set('pair', normalized);
  return url.toString();
}

/**
 * Parses a scanned QR string — supports pairing URLs (?pair=...), JSON payloads, or raw codes.
 */
export function parsePairingInput(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // 1. Try URL with ?pair=
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      const param = url.searchParams.get('pair');
      if (param && isValidAuthCode(param)) {
        return normalizeAuthCode(param);
      }
    }
  } catch {
    // Fall through to other parsers
  }

  // 2. Try JSON payload
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<PairingQrPayload>;
      if (parsed.code && isValidAuthCode(parsed.code)) {
        return normalizeAuthCode(parsed.code);
      }
    } catch {
      // Fall through
    }
  }

  // 3. Try raw code
  if (isValidAuthCode(trimmed)) {
    return normalizeAuthCode(trimmed);
  }

  return null;
}
