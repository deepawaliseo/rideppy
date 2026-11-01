import {
  generateOtpCode,
  generateRefreshToken,
  hashOtpCode,
  parseDurationToSeconds,
  sha256Hex,
  verifyOtpCode,
} from './crypto.util';

describe('crypto.util', () => {
  describe('generateOtpCode', () => {
    it('produces 6-digit numeric strings (leading zeros preserved)', () => {
      for (let i = 0; i < 200; i += 1) {
        const code = generateOtpCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });

    it('is not deterministic (CSPRNG)', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 50; i += 1) seen.add(generateOtpCode());
      expect(seen.size).toBeGreaterThan(1);
    });
  });

  describe('hashOtpCode / verifyOtpCode', () => {
    it('round-trips the correct code and rejects wrong ones', async () => {
      const stored = await hashOtpCode('042917');
      await expect(verifyOtpCode(stored, '042917')).resolves.toBe(true);
      await expect(verifyOtpCode(stored, '042918')).resolves.toBe(false);
      await expect(verifyOtpCode(stored, '04291')).resolves.toBe(false);
      await expect(verifyOtpCode(stored, '0429170')).resolves.toBe(false);
    });

    it('never stores the plaintext and salts every hash', async () => {
      const a = await hashOtpCode('123456');
      const b = await hashOtpCode('123456');
      expect(a).not.toContain('123456');
      expect(b).not.toContain('123456');
      expect(a).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
      expect(a).not.toBe(b); // unique salt per hash
    });

    it('rejects malformed stored hashes without throwing', async () => {
      await expect(verifyOtpCode('garbage', '123456')).resolves.toBe(false);
      await expect(verifyOtpCode('scrypt$x$y', '123456')).resolves.toBe(false);
      await expect(verifyOtpCode('', '123456')).resolves.toBe(false);
    });
  });

  describe('generateRefreshToken / sha256Hex', () => {
    it('produces long base64url tokens without padding', () => {
      const token = generateRefreshToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThanOrEqual(64); // 48 bytes -> 64 chars
    });

    it('hashes deterministically and distinguishes inputs', () => {
      expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
      expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
      expect(sha256Hex('x')).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('parseDurationToSeconds', () => {
    it('parses every supported unit', () => {
      expect(parseDurationToSeconds('45s')).toBe(45);
      expect(parseDurationToSeconds('15m')).toBe(900);
      expect(parseDurationToSeconds('12h')).toBe(43_200);
      expect(parseDurationToSeconds('7d')).toBe(604_800);
      expect(parseDurationToSeconds(' 15m ')).toBe(900); // tolerant of spaces
    });

    it('rejects anything else (fail fast at config load)', () => {
      expect(() => parseDurationToSeconds('1d30m')).toThrow(/Invalid duration/);
      expect(() => parseDurationToSeconds('m')).toThrow(/Invalid duration/);
      expect(() => parseDurationToSeconds('')).toThrow(/Invalid duration/);
      expect(() => parseDurationToSeconds('15x')).toThrow(/Invalid duration/);
    });
  });
});
