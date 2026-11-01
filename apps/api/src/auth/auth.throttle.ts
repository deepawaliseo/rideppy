/**
 * Per-route throttle options for the auth surface.
 *
 * The @Throttle decorator evaluates at class-decoration time (module import),
 * BEFORE dependency injection — so values are read from raw process.env with
 * defaults identical to throttleConfig (src/config/configuration.ts). The
 * env.schema validates every variable; invalid values refuse to boot before
 * any request is served.
 *
 * The auth e2e suite raises these limits via test/auth-test-env.ts, imported
 * before AppModule so the decorator sees the test values.
 */
const throttleOptions = (limitEnv: string, defaultLimit: number) => ({
  default: {
    limit: Number(process.env[limitEnv] ?? defaultLimit),
    ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
  },
});

/** POST /auth/otp/request — tightest limit (SMS spend + pumping abuse). */
export const OTP_REQUEST_THROTTLE = throttleOptions(
  'THROTTLE_OTP_REQUEST_LIMIT',
  5,
);

/** POST /auth/otp/verify — attempt-guarded by OtpService on top. */
export const OTP_VERIFY_THROTTLE = throttleOptions(
  'THROTTLE_OTP_VERIFY_LIMIT',
  10,
);

/** POST /auth/refresh — rotation is cheap but must not be hammered. */
export const REFRESH_THROTTLE = throttleOptions('THROTTLE_REFRESH_LIMIT', 20);
