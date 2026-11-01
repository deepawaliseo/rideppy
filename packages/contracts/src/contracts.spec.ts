import {
  ACCOUNT_STATUSES,
  AccountStatus,
  ApiErrorResponse,
  Currency,
  Driver,
  FARE_RULES,
  FareEstimate,
  fromMinor,
  HealthResponse,
  isOneOf,
  isAuthRole,
  isE164Phone,
  isOtpPurpose,
  isPaymentMethod,
  isRideStatus,
  isUserRole,
  isVehicleType,
  KycStatus,
  KYC_STATUSES,
  Paginated,
  Payment,
  PaymentMethod,
  PaymentStatus,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  RIDE_CANCEL_REASONS,
  RideCancelReason,
  RIDE_STATUSES,
  Ride,
  RideStatus,
  toMinor,
  USER_ROLES,
  UserRole,
  Vehicle,
  VehicleType,
  VEHICLE_TYPES,
} from './index';

/**
 * Compile-time exhaustiveness proofs: each runtime array must cover every
 * member of its union type. If a literal is added to the union without
 * updating the array, the conditional type stops being `true` and this file
 * fails to compile.
 */
const USER_ROLES_COMPLETE: [UserRole] extends [
  (typeof USER_ROLES)[number],
]
  ? true
  : false = true;
const ACCOUNT_STATUSES_COMPLETE: [AccountStatus] extends [
  (typeof ACCOUNT_STATUSES)[number],
]
  ? true
  : false = true;
const KYC_STATUSES_COMPLETE: [KycStatus] extends [
  (typeof KYC_STATUSES)[number],
]
  ? true
  : false = true;
const VEHICLE_TYPES_COMPLETE: [VehicleType] extends [
  (typeof VEHICLE_TYPES)[number],
]
  ? true
  : false = true;
const PAYMENT_METHODS_COMPLETE: [PaymentMethod] extends [
  (typeof PAYMENT_METHODS)[number],
]
  ? true
  : false = true;
const PAYMENT_STATUSES_COMPLETE: [PaymentStatus] extends [
  (typeof PAYMENT_STATUSES)[number],
]
  ? true
  : false = true;
const RIDE_STATUSES_COMPLETE: [RideStatus] extends [
  (typeof RIDE_STATUSES)[number],
]
  ? true
  : false = true;
const RIDE_CANCEL_REASONS_COMPLETE: [RideCancelReason] extends [
  (typeof RIDE_CANCEL_REASONS)[number],
]
  ? true
  : false = true;

describe('contract value lists', () => {
  it('exposes every role/status/type literal exactly once', () => {
    expect(USER_ROLES).toEqual(['CUSTOMER', 'DRIVER', 'ADMIN']);
    expect(ACCOUNT_STATUSES).toEqual([
      'PENDING_VERIFICATION',
      'ACTIVE',
      'SUSPENDED',
      'DEACTIVATED',
    ]);
    expect(RIDE_STATUSES).toEqual([
      'REQUESTED',
      'SEARCHING',
      'ASSIGNED',
      'ARRIVING',
      'ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ]);
    expect(VEHICLE_TYPES).toEqual(['BIKE', 'AUTO']);
    expect(PAYMENT_METHODS).toEqual(['CASH', 'UPI', 'WALLET']);

    for (const list of [
      USER_ROLES,
      ACCOUNT_STATUSES,
      RIDE_STATUSES,
      VEHICLE_TYPES,
      PAYMENT_METHODS,
      PAYMENT_STATUSES,
      RIDE_CANCEL_REASONS,
    ]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('encodes the locked Day-1 platform fee model', () => {
    // ₹2 per eligible km, capped at ₹10 per ride, 30-day new-driver waiver.
    expect(FARE_RULES.platformFeePerKmMinor).toBe(200);
    expect(FARE_RULES.platformFeePerRideCapMinor).toBe(1000);
    expect(FARE_RULES.platformFeeWaiverDays).toBe(30);
    expect(FARE_RULES.currency).toBe('INR');
  });
});

describe('money helpers', () => {
  it('converts rupees to integer paise and back', () => {
    expect(toMinor(2)).toBe(200);
    expect(toMinor(10)).toBe(1000);
    expect(toMinor(10.555)).toBe(1056); // rounds, never truncates
    expect(toMinor(0.1 + 0.2)).toBe(30); // float noise eliminated
    expect(fromMinor(1000)).toBe(10);
    expect(fromMinor(toMinor(42.13))).toBeCloseTo(42.13);
  });
});

describe('runtime guards', () => {
  it('isOneOf narrows to the literal union', () => {
    expect(isOneOf(['A', 'B'] as const, 'A')).toBe(true);
    expect(isOneOf(['A', 'B'] as const, 'C')).toBe(false);
    expect(isOneOf(['A', 'B'] as const, 42)).toBe(false);
    expect(isOneOf(['A', 'B'] as const, null)).toBe(false);
  });

  it('validates the main unions against untrusted input', () => {
    expect(isRideStatus('IN_PROGRESS')).toBe(true);
    expect(isRideStatus('in_progress')).toBe(false); // case-sensitive
    expect(isRideStatus('TELEPORTING')).toBe(false);

    expect(isUserRole('DRIVER')).toBe(true);
    expect(isUserRole('DRIVER_ADMIN')).toBe(false);

    expect(isVehicleType('BIKE')).toBe(true);
    expect(isVehicleType('HELICOPTER')).toBe(false);

    expect(isPaymentMethod('UPI')).toBe(true);
    expect(isPaymentMethod('IOU')).toBe(false);
  });

  it('guards the auth role set (ADMIN never self-serviceable)', () => {
    expect(isAuthRole('CUSTOMER')).toBe(true);
    expect(isAuthRole('DRIVER')).toBe(true);
    expect(isAuthRole('ADMIN')).toBe(false);
    expect(isAuthRole('admin')).toBe(false);
    expect(isAuthRole(undefined)).toBe(false);
  });

  it('guards the OTP purpose set', () => {
    expect(isOtpPurpose('LOGIN')).toBe(true);
    expect(isOtpPurpose('SIGNUP')).toBe(false);
  });

  it('validates E.164 phone numbers strictly', () => {
    expect(isE164Phone('+919876543210')).toBe(true);
    expect(isE164Phone('+12025550123')).toBe(true);
    expect(isE164Phone('919876543210')).toBe(false); // missing +
    expect(isE164Phone('++919876543210')).toBe(false);
    expect(isE164Phone('+0919876543210')).toBe(false); // leading zero
    expect(isE164Phone('+91')).toBe(false); // too short
    expect(isE164Phone('+919876543210123456')).toBe(false); // > 15 digits
    expect(isE164Phone('+91-9876543210')).toBe(false); // separator
    expect(isE164Phone(919876543210)).toBe(false); // not a string
  });
});

describe('contract shapes', () => {
  it('accepts a well-formed ride aggregate', () => {
    const quotedAt = '2026-11-01T10:00:00.000Z';
    const estimate: FareEstimate = {
      currency: 'INR',
      vehicleType: 'BIKE',
      distanceKm: 4.2,
      baseFareMinor: 1500,
      distanceFareMinor: 1050,
      surgeMultiplier: 1,
      totalMinor: 2550,
      quotedAt,
    };
    const ride: Ride = {
      id: '0b8f6c0e-6c5d-4f0a-9d1e-2f7a8b9c0d1e',
      status: 'ASSIGNED',
      customerId: '11111111-1111-4111-8111-111111111111',
      driverId: '22222222-2222-4222-8222-222222222222',
      vehicleId: '33333333-3333-4333-8333-333333333333',
      vehicleType: 'BIKE',
      pickupLocation: { latitude: 12.9716, longitude: 77.5946 },
      pickupAddress: 'MG Road Metro Station',
      dropLocation: { latitude: 12.9352, longitude: 77.6245 },
      dropAddress: 'Koramangala 5th Block',
      estimatedDistanceKm: 4.2,
      actualDistanceKm: null,
      estimatedFare: estimate,
      finalFareMinor: null,
      paymentMethod: 'UPI',
      paymentId: null,
      startOtp: '4821',
      requestedAt: quotedAt,
      assignedAt: '2026-11-01T10:00:12.000Z',
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
      cancelledBy: null,
      createdAt: quotedAt,
      updatedAt: '2026-11-01T10:00:12.000Z',
    };

    expect(ride.status).toBe('ASSIGNED');
    expect(ride.estimatedFare.totalMinor).toBe(2550);
    expect(isRideStatus(ride.status)).toBe(true);
  });

  it('accepts driver, vehicle and payment records', () => {
    const driver: Driver = {
      id: '22222222-2222-4222-8222-222222222222',
      phone: '+919876543210',
      fullName: 'Ravi Kumar',
      email: null,
      status: 'ACTIVE',
      kycStatus: 'APPROVED',
      drivingLicenseNumber: 'KA0320210001234',
      isOnline: true,
      rating: 4.8,
      ratingCount: 312,
      completedTrips: 1204,
      createdAt: '2026-01-15T08:00:00.000Z',
      updatedAt: '2026-11-01T09:59:00.000Z',
    };
    const vehicle: Vehicle = {
      id: '33333333-3333-4333-8333-333333333333',
      driverId: driver.id,
      type: 'BIKE',
      make: 'Honda',
      model: 'Activa 6G',
      registrationNumber: 'KA 05 JK 1234',
      insuranceExpiry: '2027-03-31T00:00:00.000Z',
      status: 'ACTIVE',
      isDefault: true,
      createdAt: '2026-01-15T08:05:00.000Z',
      updatedAt: '2026-01-15T08:05:00.000Z',
    };
    const payment: Payment = {
      id: '44444444-4444-4444-8444-444444444444',
      rideId: '0b8f6c0e-6c5d-4f0a-9d1e-2f7a8b9c0d1e',
      customerId: '11111111-1111-4111-8111-111111111111',
      method: 'CASH',
      status: 'PAID',
      currency: 'INR',
      amountMinor: 2550,
      // 2.55 km eligible x ₹2/km = ₹5.10, under the ₹10 cap.
      platformFeeMinor: 510,
      driverEarningsMinor: 2040,
      providerRef: null,
      paidAt: '2026-11-01T10:21:00.000Z',
      createdAt: '2026-11-01T10:21:00.000Z',
      updatedAt: '2026-11-01T10:21:00.000Z',
    };

    expect(payment.driverEarningsMinor).toBe(
      payment.amountMinor - payment.platformFeeMinor,
    );
    expect(vehicle.driverId).toBe(driver.id);
  });

  it('types the HTTP surface payloads', () => {
    const health: HealthResponse = {
      status: 'ok',
      service: 'Rideppy API',
      version: '0.0.1',
      timestamp: new Date().toISOString(),
      database: 'up',
    };
    const error: ApiErrorResponse = {
      success: false,
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /definitely-not-here',
      path: '/definitely-not-here',
      timestamp: new Date().toISOString(),
    };
    const page: Paginated<Ride> = {
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
      hasMore: false,
    };

    expect(health.status).toBe('ok');
    expect(error.success).toBe(false);
    expect(page.items).toEqual([]);
    expect(new Date(health.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('keeps the currency set explicit', () => {
    const inr: Currency = 'INR';
    expect(inr).toBe('INR');
  });
});
