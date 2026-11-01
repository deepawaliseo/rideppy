import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter producing one consistent JSON error envelope:
 *
 * {
 *   "success": false,
 *   "statusCode": 404,
 *   "error": "Not Found",
 *   "message": "...",
 *   "path": "/requested/path",
 *   "timestamp": "ISO-8601"
 * }
 *
 * Rules:
 * - HttpException details are preserved (status, message, error name).
 * - Unknown exceptions NEVER leak internals: clients get "Internal server
 *   error"; the real cause is logged server-side only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else if (typeof body === 'object' && body !== null) {
        const record = body as Record<string, unknown>;
        if (
          typeof record.message === 'string' ||
          Array.isArray(record.message)
        ) {
          message = record.message;
        } else {
          message = exception.message;
        }
        error =
          typeof record.error === 'string'
            ? record.error
            : (exception.name ?? error);
      }
    } else {
      // Log the real cause server-side; never expose it to clients.
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
