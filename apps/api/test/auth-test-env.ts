/**
 * Test-environment side-effect module for the auth e2e suite.
 *
 * MUST be imported BEFORE AppModule: @Throttle decorator options evaluate at
 * class-decoration (import) time from raw process.env, so the raised limits
 * below must already be set when the controller module loads.
 *
 * Values are still validated by env.schema (positive integers), so an
 * accidentally invalid value refuses to boot rather than silently weakening
 * the test.
 */
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '1000';
process.env.THROTTLE_OTP_REQUEST_LIMIT = '100';
process.env.THROTTLE_OTP_VERIFY_LIMIT = '100';
process.env.THROTTLE_REFRESH_LIMIT = '100';
// Tight attempt limit so the lockout test needs only 4 requests.
process.env.OTP_MAX_ATTEMPTS = '3';

export {};
