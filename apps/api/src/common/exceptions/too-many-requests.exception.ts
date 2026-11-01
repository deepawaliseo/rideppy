import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 429 exception for APPLICATION-LEVEL rate limits (per-phone OTP cooldowns,
 * attempt lockouts, hourly caps). Distinct from the @nestjs/throttler 429s,
 * which are per-IP HTTP throttling — both produce the same error envelope.
 */
export class TooManyRequestsException extends HttpException {
  constructor(message: string | string[]) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
