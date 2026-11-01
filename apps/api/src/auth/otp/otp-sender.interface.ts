import type { OtpPurpose } from '@rideppy/contracts';

/** Everything a delivery provider needs to hand one OTP to one human. */
export interface OtpDelivery {
  phone: string;
  /** 6-digit numeric code, cleartext — providers get it ONCE, storage is hashed. */
  code: string;
  purpose: OtpPurpose;
  /** Absolute expiry instant (UTC). */
  expiresAt: Date;
}

/**
 * Provider abstraction for OTP delivery (WP-1).
 *
 * Implementations:
 *  - ConsoleOtpSender — development/test only; prints to the API log. The
 *    environment layer REFUSES production boot with this provider.
 *  - Real SMS gateways (Twilio, MSG91, ...) — implement this interface and
 *    register the factory case. Until then the factory refuses to boot when
 *    such a provider is configured: the API never pretends an SMS was sent.
 */
export interface OtpSender {
  readonly name: string;
  send(delivery: OtpDelivery): Promise<void>;
}

/** DI token for the configured OtpSender implementation. */
export const OTP_SENDER = Symbol('OTP_SENDER');
