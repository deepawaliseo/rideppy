import { ISO8601String, PhoneNumber, UUID, isOneOf } from './common';

export type UserRole = 'CUSTOMER' | 'DRIVER' | 'ADMIN';

export const USER_ROLES = [
  'CUSTOMER',
  'DRIVER',
  'ADMIN',
] as const satisfies readonly UserRole[];

export function isUserRole(value: unknown): value is UserRole {
  return isOneOf(USER_ROLES, value);
}

export type AccountStatus =
  | 'PENDING_VERIFICATION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DEACTIVATED';

export const ACCOUNT_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED',
] as const satisfies readonly AccountStatus[];

export type KycStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export const KYC_STATUSES = [
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
] as const satisfies readonly KycStatus[];

/** Ride-requesting side of the platform. */
export interface Customer {
  id: UUID;
  phone: PhoneNumber;
  /** Display name; user-editable. */
  fullName: string;
  email: string | null;
  status: AccountStatus;
  createdAt: ISO8601String;
  updatedAt: ISO8601String;
}

/** Ride-fulfilling side of the platform. */
export interface Driver {
  id: UUID;
  phone: PhoneNumber;
  fullName: string;
  email: string | null;
  status: AccountStatus;
  /**
   * Onboarding state. A driver can only be matched to rides once the KYC is
   * APPROVED (and at least one Vehicle is ACTIVE).
   */
  kycStatus: KycStatus;
  drivingLicenseNumber: string | null;
  /** Whether the driver is reachable for ride assignment right now. */
  isOnline: boolean;
  /** Average rating 0..5; null until the first rated trip. */
  rating: number | null;
  ratingCount: number;
  completedTrips: number;
  createdAt: ISO8601String;
  updatedAt: ISO8601String;
}
