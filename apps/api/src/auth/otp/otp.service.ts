import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TooManyRequestsException } from '../../common/exceptions/too-many-requests.exception';
import type { OtpPurpose } from '@rideppy/contracts';
import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../crypto.util';
import { OTP_SENDER } from './otp-sender.interface';
import type { OtpSender } from './otp-sender.interface';

/** Public shape of a successful OTP request (never contains the code). */
export interface OtpIssueResult {
  phone: string;
  purpose: OtpPurpose;
  /** Seconds until the just-issued code expires. */
  expiresIn: number;
  /** Seconds before another request for this phone is allowed. */
  resendCooldownSeconds: number;
  /** 'console' in development; 'sms' once a real provider is configured. */
  deliveredVia: 'console' | 'sms';
}

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  private get codeTtlSeconds(): number {
    return this.configService.get<number>('otp.codeTtlSeconds', 300);
  }
  private get resendCooldownSeconds(): number {
    return this.configService.get<number>('otp.resendCooldownSeconds', 60);
  }
  private get maxAttempts(): number {
    return this.configService.get<number>('otp.maxAttempts', 5);
  }
  private get maxActivePerPhone(): number {
    return this.configService.get<number>('otp.maxActivePerPhone', 3);
  }
  private get hourlyRequestLimit(): number {
    return this.configService.get<number>('otp.hourlyRequestLimit', 10);
  }

  /**
   * Issues one OTP for `phone`, enforcing every abuse guard at the database
   * layer (IP-level throttling happens in the HTTP layer via @nestjs/throttler):
   *  1. resend cooldown per phone+purpose,
   *  2. hourly request cap per phone,
   *  3. cap on outstanding (unconsumed, unexpired) codes per phone.
   * The plaintext code is handed to the delivery provider exactly once and
   * only its scrypt hash is stored.
   */
  async issue(
    phone: string,
    purpose: OtpPurpose,
    requestIp?: string,
  ): Promise<OtpIssueResult> {
    const now = new Date();

    // 1. Resend cooldown.
    const cooldownStart = new Date(
      now.getTime() - this.resendCooldownSeconds * 1000,
    );
    const lastIssued = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, createdAt: { gt: cooldownStart } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (lastIssued) {
      const elapsed = Math.floor(
        (now.getTime() - lastIssued.createdAt.getTime()) / 1000,
      );
      const waitSeconds = this.resendCooldownSeconds - elapsed;
      throw new TooManyRequestsException(
        `An OTP was already requested for this phone — try again in ${Math.max(waitSeconds, 1)}s`,
      );
    }

    // 2. Hourly request cap (outbound SMS cost + pumping abuse).
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const [recentCount, activeCount] = await Promise.all([
      this.prisma.otpCode.count({
        where: { phone, purpose, createdAt: { gt: hourAgo } },
      }),
      this.prisma.otpCode.count({
        where: { phone, purpose, consumedAt: null, expiresAt: { gt: now } },
      }),
    ]);
    if (recentCount >= this.hourlyRequestLimit) {
      throw new TooManyRequestsException(
        'Too many OTP requests for this phone in the last hour — try again later',
      );
    }

    // 3. Outstanding-code cap (each request invalidates nothing by itself,
    //    so a hoarder must consume or wait for expiry first).
    if (activeCount >= this.maxActivePerPhone) {
      throw new TooManyRequestsException(
        'Too many active OTP codes for this phone — use one or wait for expiry',
      );
    }

    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code);
    const expiresAt = new Date(now.getTime() + this.codeTtlSeconds * 1000);

    const record = await this.prisma.otpCode.create({
      data: {
        phone,
        purpose,
        codeHash,
        expiresAt,
        requestIp: requestIp ?? null,
      },
    });

    try {
      await this.sender.send({ phone, code, purpose, expiresAt });
    } catch (error) {
      // The code can never reach the user — remove the row so it does not
      // count against the outstanding cap, then surface an honest error.
      await this.prisma.otpCode
        .delete({ where: { id: record.id } })
        .catch(() => undefined);
      throw new BadRequestException(
        `OTP delivery failed: ${
          error instanceof Error ? error.message : 'unknown provider error'
        }`,
      );
    }

    return {
      phone,
      purpose,
      expiresIn: this.codeTtlSeconds,
      resendCooldownSeconds: this.resendCooldownSeconds,
      deliveredVia: this.sender.name === 'console' ? 'console' : 'sms',
    };
  }

  /**
   * Verifies `code` against the LATEST outstanding OTP for this phone.
   * Attempt counting happens BEFORE the hash comparison (every wrong guess
   * is recorded), and the code is consumed atomically on success.
   */
  async verify(
    phone: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const now = new Date();

    const record = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new BadRequestException(
        'No active OTP code for this phone — request a new one',
      );
    }

    // Count this attempt first, whatever the outcome.
    const updated = await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (updated.attempts > this.maxAttempts) {
      throw new TooManyRequestsException(
        'Too many incorrect attempts for this code — request a new OTP',
      );
    }

    const matches = await verifyOtpCode(record.codeHash, code);
    if (!matches) {
      const remaining = Math.max(this.maxAttempts - updated.attempts, 0);
      throw new UnauthorizedException(
        `Incorrect OTP code — ${remaining} attempt(s) remaining`,
      );
    }

    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: now },
    });
  }
}
