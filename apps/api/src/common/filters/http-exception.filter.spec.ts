import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AllExceptionsFilter } from './http-exception.filter';

type ErrorEnvelope = {
  success: boolean;
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
};

describe('AllExceptionsFilter', () => {
  function createHost(url = '/test-path'): {
    host: ArgumentsHost;
    statusMock: jest.Mock;
    jsonMock: jest.Mock<unknown, [ErrorEnvelope]>;
  } {
    const jsonMock = jest.fn<unknown, [ErrorEnvelope]>(() => undefined);
    const statusMock = jest.fn(() => ({ json: jsonMock }));
    const response = { status: statusMock } as unknown as Response;
    const request = { url } as unknown as Request;
    const httpContext = {
      getResponse: (): Response => response,
      getRequest: (): Request => request,
    };
    const host = {
      switchToHttp: () => httpContext,
    } as unknown as ArgumentsHost;
    return { host, statusMock, jsonMock };
  }

  const getBody = (
    jsonMock: jest.Mock<unknown, [ErrorEnvelope]>,
  ): ErrorEnvelope => jsonMock.mock.calls[0][0];

  it('wraps HttpExceptions in the consistent error envelope', () => {
    const filter = new AllExceptionsFilter();
    const { host, statusMock, jsonMock } = createHost('/missing');
    const exception = new HttpException(
      'Something was not found',
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(getBody(jsonMock)).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: 404,
        message: 'Something was not found',
        path: '/missing',
      }),
    );
  });

  it('passes validation message arrays through untouched', () => {
    const filter = new AllExceptionsFilter();
    const { host, statusMock, jsonMock } = createHost();
    const exception = new HttpException(
      {
        statusCode: 400,
        message: ['property must be a string'],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(400);
    const body = getBody(jsonMock);
    expect(body.message).toEqual(['property must be a string']);
    expect(body.error).toBe('Bad Request');
  });

  it('hides internals for unknown exceptions and never leaks the original message', () => {
    const filter = new AllExceptionsFilter();
    const { host, statusMock, jsonMock } = createHost('/db-crash');
    const exception = new Error(
      'DATABASE_URL password is hunter2 at postgres://...',
    );

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    const body = getBody(jsonMock);
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(JSON.stringify(body)).not.toContain('DATABASE_URL');
  });

  it('includes path and timestamp on every envelope', () => {
    const filter = new AllExceptionsFilter();
    const { host, jsonMock } = createHost('/anything');

    filter.catch(new HttpException('nope', HttpStatus.FORBIDDEN), host);

    const body = getBody(jsonMock);
    expect(body.path).toBe('/anything');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });
});
