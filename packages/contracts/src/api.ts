import { ISO8601String } from './common';

/**
 * Payload of `GET /health`.
 * Must stay in sync with `AppService.getHealth()` in the API.
 */
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  /** ISO-8601 timestamp of the moment the response was built. */
  timestamp: ISO8601String;
}

/**
 * The one consistent error envelope produced by the API's global
 * AllExceptionsFilter. Unknown server errors never leak internals:
 * clients always receive this shape.
 */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  /** Machine-readable error name, e.g. "Not Found". */
  error: string;
  /** Human-readable detail; array form for validation errors. */
  message: string | string[];
  path: string;
  timestamp: ISO8601String;
}

/**
 * Standard envelope for future list endpoints (rides history, driver
 * listings, admin tables).
 */
export interface Paginated<T> {
  items: T[];
  /** 1-based page number. */
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
}
