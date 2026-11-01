import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

/**
 * OTP hashing — OWASP-recommended scrypt parameters (N=2^15, r=8, p=1).
 *
 * OTPs are 6 digits (≈ 20 bits), so unlike high-entropy API keys they MUST
 * be hashed with a memory-hard KDF to make offline guessing expensive; the
 * per-code attempt limit and short TTL bound online guessing on top.
 *
 * Stored format (self-describing, upgrade-safe):
 *   scrypt$N$r$p$<salt b64url>$<hash b64url>
 * Plaintext OTP codes are never persisted anywhere.
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

export async function hashOtpCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(code, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // 128 * N * r = 32 MiB working memory; headroom avoids Node's maxmem guard.
    maxmem: 96 * 1024 * 1024,
  });
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

/** Constant-time verification of a candidate code against a stored hash. */
export async function verifyOtpCode(
  stored: string,
  candidate: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  try {
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const actual = await scrypt(candidate, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 96 * 1024 * 1024,
    });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Cryptographically random 6-digit OTP (leading zeros preserved). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Refresh tokens are 384 bits of CSPRNG output — the token entropy IS the
 * defense, so a plain SHA-256 (no KDF needed) is the correct storage hash.
 * The raw token is shown to the client exactly once and never stored.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Parses durations like '15m' | '45s' | '12h' | '7d' into seconds.
 * Used for the JWT expiry config so the TokenPair can mirror `exp`.
 */
export function parseDurationToSeconds(raw: string): number {
  const match = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${raw}" — expected <number><s|m|h|d>, e.g. '15m'`,
    );
  }
  const amount = Number(match[1]);
  const unitSeconds: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3_600,
    d: 86_400,
  };
  return amount * unitSeconds[match[2]];
}
