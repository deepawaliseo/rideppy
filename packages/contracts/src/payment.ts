import { Currency, ISO8601String, UUID, isOneOf } from './common';

export type PaymentMethod = 'CASH' | 'UPI' | 'WALLET';

export const PAYMENT_METHODS = [
  'CASH',
  'UPI',
  'WALLET',
] as const satisfies readonly PaymentMethod[];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return isOneOf(PAYMENT_METHODS, value);
}

export type PaymentStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const satisfies readonly PaymentStatus[];

/**
 * Money movement for one ride.
 *
 * Invariant: `driverEarningsMinor === amountMinor - platformFeeMinor`.
 * The platform fee follows FARE_RULES (ride.ts): ₹2 per eligible kilometre,
 * capped at ₹10 per ride, waived for a driver's first 30 days.
 */
export interface Payment {
  id: UUID;
  rideId: UUID;
  customerId: UUID;
  method: PaymentMethod;
  status: PaymentStatus;
  currency: Currency;
  /** Amount charged to the customer, integer paise. */
  amountMinor: number;
  /** Platform commission deducted from the driver, integer paise. */
  platformFeeMinor: number;
  /** Driver net earnings, integer paise. */
  driverEarningsMinor: number;
  /** Payment service provider reference (e.g. Razorpay id); null for cash. */
  providerRef: string | null;
  paidAt: ISO8601String | null;
  createdAt: ISO8601String;
  updatedAt: ISO8601String;
}
