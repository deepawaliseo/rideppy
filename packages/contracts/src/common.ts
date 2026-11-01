/**
 * Primitive types shared across every Rideppy surface.
 *
 * Contracts rules:
 * - Framework-independent: NO NestJS, React, React Native, Prisma or zod
 *   imports. Pure TypeScript types + plain constants/functions only.
 * - Money is always an INTEGER amount of paise (1 INR = 100 paise) to avoid
 *   floating-point rounding errors. Field names end in `Minor`.
 * - Timestamps are ISO-8601 UTC strings ("2026-11-01T10:00:00.000Z").
 */

/** Canonical UUID (v4) string. */
export type UUID = string;

/** ISO-8601 UTC timestamp string, e.g. "2026-11-01T10:00:00.000Z". */
export type ISO8601String = string;

/** Phone number in E.164 format, e.g. "+919876543210". */
export type PhoneNumber = string;

/** Only INR is supported at launch; the type exists so call sites are explicit. */
export type Currency = 'INR';

/**
 * Converts a rupee amount (e.g. 10.555) to integer paise (1056), rounding
 * half away from zero semantics via Math.round on the scaled value.
 */
export function toMinor(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Converts integer paise back to a rupee amount (1000 -> 10). */
export function fromMinor(minor: number): number {
  return Math.round(minor) / 100;
}

/**
 * Runtime guard: true when `value` is one of the given string literals.
 * Used to validate untrusted input (socket payloads, query params) against
 * contract unions without duplicating the literal lists.
 */
export function isOneOf<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
