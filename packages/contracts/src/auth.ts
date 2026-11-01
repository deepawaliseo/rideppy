/**
 * Authentication contracts (Phase 1 / WP-1 — phone + OTP foundation).
 *
 * Rules (same as every contracts file):
 * - Framework-independent: NO NestJS, Express, Prisma or zod imports.
 *   Pure TypeScript types + plain constants/functions only.
 * - The API, the React Native apps and the admin panel all speak these shapes.
 */

import { ISO8601String, PhoneNumber, UUID, isOneOf } from './common';
import { AccountStatus, UserRole } from './user';

/**
 * Roles that may authenticate through the self-service phone + OTP flow.
 * ADMIN accounts are provisioned by operations and must NEVER be
 * registrable through the public API — enforced by DTO validation.
 */
export type AuthRole = Exclude<UserRole, 'ADMIN'>;

export const AUTH_ROLES = ['CUSTOMER', 'DRIVER'] as const satisfies readonly AuthRole[];

export function isAuthRole(value: unknown): value is AuthRole {
  return isOneOf(AUTH_ROLES, value);
}

/** Purposes an OTP can be issued for (extensible; LOGIN is the only Day-1 flow). */
export type OtpPurpose = 'LOGIN';

export const OTP_PURPOSES = ['LOGIN'] as const satisfies readonly OtpPurpose[];

export function isOtpPurpose(value: unknown): value is OtpPurpose {
  return isOneOf(OTP_PURPOSES, value);
}

/**
 * E.164 sanity check shared by every surface (apps pre-validate before the
 * API does; the API validation remains the source of truth).
 * Format: '+' followed by 1-9 then 7..14 more digits (8..15 digits total).
 */
export function isE164Phone(value: unknown): value is PhoneNumber {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value);
}

/** The pair issued on every successful login / refresh. */
export interface TokenPair {
  /** Short-lived JWT (HS256) — see AuthTokenPayload for the claims. */
  accessToken: string;
  /** Opaque 256-bit random token; SHA-256 hash stored server-side. */
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in SECONDS (mirror of the JWT exp claim). */
  expiresIn: number;
}

/**
 * Authenticated user projection returned by login/refresh/profile endpoints.
 * Deliberately excludes every credential material (there is none in the
 * phone+OTP model, but the contract makes the guarantee explicit).
 */
export interface AuthUser {
  id: UUID;
  phone: PhoneNumber;
  fullName: string;
  email: string | null;
  role: UserRole;
  status: AccountStatus;
  createdAt: ISO8601String;
  updatedAt: ISO8601String;
}

/** Successful OTP verification / refresh response. */
export interface AuthSession {
  user: AuthUser;
  tokens: TokenPair;
}

/**
 * Access-token JWT claims. `typ` rejects refresh tokens being replayed as
 * access tokens (defense in depth — refresh tokens are opaque anyway).
 */
export interface AuthTokenPayload {
  /** User id. */
  sub: UUID;
  role: UserRole;
  typ: 'access';
  /** Standard JWT registered claims (filled by the sign/verify layer). */
  iat?: number;
  exp?: number;
}

/** Body of POST /auth/otp/request. */
export interface OtpRequestInput {
  phone: PhoneNumber;
  role: AuthRole;
}

/** Body of POST /auth/otp/verify. */
export interface OtpVerifyInput {
  phone: PhoneNumber;
  role: AuthRole;
  /** 6-digit code exactly as delivered. */
  code: string;
  /** Required ONLY when the phone has no account yet (first login). */
  fullName?: string;
}

/** Body of POST /auth/refresh. */
export interface RefreshInput {
  refreshToken: string;
}

/** Body of POST /auth/logout. */
export interface LogoutInput {
  refreshToken: string;
  /** When true every refresh token of the account is revoked (all devices). */
  allDevices?: boolean;
}
