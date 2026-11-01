import { ISO8601String, UUID, isOneOf } from './common';

/** Vehicle classes the platform supports at launch. */
export type VehicleType = 'BIKE' | 'AUTO';

export const VEHICLE_TYPES = [
  'BIKE',
  'AUTO',
] as const satisfies readonly VehicleType[];

export function isVehicleType(value: unknown): value is VehicleType {
  return isOneOf(VEHICLE_TYPES, value);
}

export type VehicleStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';

export const VEHICLE_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
] as const satisfies readonly VehicleStatus[];

/** A driver-registered vehicle used to fulfill rides. */
export interface Vehicle {
  id: UUID;
  driverId: UUID;
  type: VehicleType;
  /** Manufacturer, e.g. "Honda". */
  make: string;
  /** Model, e.g. "Activa 6G". */
  model: string;
  /** Regional registration plate, e.g. "DL 3S AB 1234" (uppercase). */
  registrationNumber: string;
  insuranceExpiry: ISO8601String | null;
  status: VehicleStatus;
  /** Vehicle used for new ride matching while the driver is online. */
  isDefault: boolean;
  createdAt: ISO8601String;
  updatedAt: ISO8601String;
}
