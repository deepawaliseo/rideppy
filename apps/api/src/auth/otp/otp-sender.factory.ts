import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleOtpSender } from './console-otp.sender';
import type { OtpSender } from './otp-sender.interface';

/**
 * Selects the OtpSender implementation from validated environment config.
 *
 * Fail-fast semantics (the "never pretend" rule):
 * - 'console'  -> dev provider (production boot is already blocked upstream
 *                 by env.schema.ts assertProductionSafety).
 * - 'twilio' / 'msg91' -> declared-but-unimplemented: throwing here FAILS
 *                 THE BOOT instead of silently dropping OTPs.
 * Adding a real provider = implement OtpSender + add a case here + provide
 * credentials via env. No behavior change for existing deployments.
 */
export function createOtpSender(configService: ConfigService): OtpSender {
  const provider = configService.get<string>('otp.provider', 'console');
  switch (provider) {
    case 'console':
      return new ConsoleOtpSender();
    case 'twilio':
    case 'msg91':
      throw new Error(
        `OTP_PROVIDER=${provider} is declared but has no implementation or credentials in this build — ` +
          `refusing to boot rather than pretending SMS delivery works. ` +
          `Implement the OtpSender interface and configure its credentials, or use OTP_PROVIDER=console for local development.`,
      );
    default:
      throw new Error(`Unknown OTP_PROVIDER=${String(provider)}`);
  }
}

@Injectable()
export class OtpSenderFactory {
  constructor(private readonly configService: ConfigService) {}

  create(): OtpSender {
    return createOtpSender(this.configService);
  }
}
