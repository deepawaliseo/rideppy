import { ConfigService } from '@nestjs/config';
import { createOtpSender } from './otp-sender.factory';
import { ConsoleOtpSender } from './console-otp.sender';

describe('OtpSender factory (unit)', () => {
  const configWith = (provider: string) =>
    ({
      get: (key: string) => (key === 'otp.provider' ? provider : undefined),
    }) as unknown as ConfigService;

  it('selects the console provider for development', () => {
    const sender = createOtpSender(configWith('console'));
    expect(sender).toBeInstanceOf(ConsoleOtpSender);
    expect(sender.name).toBe('console');
  });

  it('REFUSES TO BOOT for declared-but-unimplemented SMS providers', () => {
    // The honesty rule: a configured real provider without an implementation
    // must stop the process instead of pretending SMS delivery works.
    expect(() => createOtpSender(configWith('twilio'))).toThrow(
      /refusing to boot rather than pretending/,
    );
    expect(() => createOtpSender(configWith('msg91'))).toThrow(
      /refusing to boot rather than pretending/,
    );
  });

  it('rejects unknown provider values', () => {
    expect(() => createOtpSender(configWith('smoke-signals'))).toThrow(
      /Unknown OTP_PROVIDER/,
    );
  });
});
