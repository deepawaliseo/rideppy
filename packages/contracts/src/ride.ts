import { Currency, ISO8601String, UUID, isOneOf } from './common';
import { Location } from './geo';
import { PaymentMethod } from './payment';
import { UserRole } from './user';
import { VehicleType } from './vehicle';

export type RideStatus =
  | 'REQUESTED'
  | 'SEARCHING'
  | 'ASSIGNED'
  | 'ARRIVING'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export const RIDE_STATUSES = [
  'REQUESTED',
  'SEARCHING',
  'ASSIGNED',
  'ARRIVING',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly RideStatus[];

export function isRideStatus(value: unknown): value is RideStatus {
  return isOneOf(RIDE_STATUSES, value);
}

export type RideCancelReason =
  | 'CUSTOMER_CANCELLED'
  | 'DRIVER_CANCELLED'
  | 'SYSTEM_TIMEOUT'
  | 'OPERATIONS_CANCELLED'
  | 'PAYMENT_FAILED';

export const RIDE_CANCEL_REASONS = [
  'CUSTOMER_CANCELLED',
  'DRIVER_CANCELLED',
  'SYSTEM_TIMEOUT',
  'OPERATIONS_CANCELLED',
  'PAYMENT_FAILED',
] as const satisfies readonly RideCancelReason[];

/**
 * Customer-facing price quote produced at ride request time.
 * `totalMinor === Math.round((baseFareMinor + distanceFareMinor) * surgeMultiplier)`.
 */
export interface FareEstimate {
  currency: Currency;
  vehicleType: VehicleType;
  /** Estimated trip distance in kilometres. */
  distanceKm: number;
  baseFareMinor: number;
  distanceFareMinor: number;
  /** 1 = no surge. */
  surgeMultiplier: number;
  /** Quoted total, integer paise. */
  totalMinor: number;
  quotedAt: ISO8601String;
}

/**
 * The full lifecycle record of one bike-taxi ride.
 * Status flow:
 * REQUESTED -> SEARCHING -> ASSIGNED -> ARRIVING -> ARRIVED -> IN_PROGRESS ->
 * COMPLETED; any pre-IN_PROGRESS state may transition to CANCELLED.
 */
export interface Ride {
  id: UUID;
  status: RideStatus;
  customerId: UUID;
  /** Assigned driver; null while the ride is unassigned. */
  driverId: UUID | null;
  vehicleId: UUID | null;
  vehicleType: VehicleType;
  pickupLocation: Location;
  pickupAddress: string | null;
  dropLocation: Location;
  dropAddress: string | null;
  estimatedDistanceKm: number;
  /** GPS-tracked distance; null until completion. */
  actualDistanceKm: number | null;
  estimatedFare: FareEstimate;
  /** Final charged amount; null until completion. Integer paise. */
  finalFareMinor: number | null;
  paymentMethod: PaymentMethod;
  paymentId: UUID | null;
  /** 4-digit start OTP confirmed by the customer before IN_PROGRESS. */
  startOtp: string | null;
  requestedAt: ISO8601String;
  assignedAt: ISO8601String | null;
  startedAt: ISO8601String | null;
  completedAt: ISO8601String | null;
  cancelledAt: ISO8601String | null;
  cancelReason: RideCancelReason | null;
  cancelledBy: UserRole | null;
  createdAt: ISO8601String;
  updatedAt: ISO8601String;
}

/**
 * Locked Day-1 business model — the DRIVER-side platform fee.
 * Customers are never charged this fee; it is deducted from driver earnings.
 */
export const FARE_RULES = {
  currency: 'INR',
  /** Platform fee per eligible kilometre: ₹2. */
  platformFeePerKmMinor: 200,
  /** Maximum platform fee per single ride: ₹10. */
  platformFeePerRideCapMinor: 1000,
  /** New drivers pay 0% platform fee during their first 30 days. */
  platformFeeWaiverDays: 30,
} as const;
