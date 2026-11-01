import { Injectable, Logger } from '@nestjs/common';
import type { OtpDelivery, OtpSender } from './otp-sender.interface';

/**
 * Development/test delivery provider: logs the OTP to the server console so
 * engineers can complete the flow without SMS credentials.
 *
 * Honesty rules enforced across the stack:
 * - never claims an SMS was sent (responses say deliveredVia: 'console');
 * - production boot with this provider is rejected by env validation;
 * - OTP plaintext appears ONLY here and in the HTTP flow — the database
 *   stores a scrypt hash.
 */
@Injectable()
export class ConsoleOtpSender implements OtpSender {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleOtpSender.name);

  async send(delivery: OtpDelivery): Promise<void> {
    this.logger.log(
      `[DEV OTP] purpose=${delivery.purpose} phone=${delivery.phone} ` +
        `code=${delivery.code} expiresAt=${delivery.expiresAt.toISOString()} ` +
        `— printed to console, NOT delivered as SMS`,
    );
    // Interface is async so real SMS gateways can drop in without changing
    // callers; the console write is synchronous by nature.
    return Promise.resolve();
  }
}
