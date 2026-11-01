/**
 * Rideppy development seed — safe & idempotent.
 *
 * - Uses upserts on stable unique keys (phone / registrationNumber / fixed
 *   demo UUIDs), so it can be re-run any number of times.
 * - Never deletes data, contains no credentials, and only creates clearly
 *   fictional demo records (+91 90000 000xx numbers).
 * - WP-6: the seeding logic is exported as `runSeed()` so the database
 *   integration suite can prove idempotency (two runs → identical counts).
 *
 * Run: pnpm --filter api exec prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import { FARE_RULES, toMinor } from '@rideppy/contracts';

const prisma = new PrismaClient();

// Fixed demo UUIDs make rides/payments upsertable across seed runs.
const DEMO = {
  customerA: {
    userId: '11111111-1111-4111-8111-000000000001',
    customerId: '11111111-2222-4222-8222-000000000001',
  },
  customerB: {
    userId: '11111111-1111-4111-8111-000000000002',
    customerId: '11111111-2222-4222-8222-000000000002',
  },
  driverA: {
    userId: '22222222-1111-4111-8111-000000000001',
    driverId: '22222222-2222-4222-8222-000000000001',
    vehicleId: '33333333-3333-4333-8333-000000000001',
  },
  driverB: {
    userId: '22222222-1111-4111-8111-000000000002',
    driverId: '22222222-2222-4222-8222-000000000002',
    vehicleId: '33333333-3333-4333-8333-000000000002',
  },
  rideCompleted: '44444444-4444-4444-8444-000000000001',
  rideRequested: '44444444-4444-4444-8444-000000000002',
};

export async function runSeed(client: PrismaClient = prisma): Promise<void> {
  // --- Customers ------------------------------------------------------------
  const customerAUser = await client.user.upsert({
    where: { phone: '+919000000001' },
    update: {},
    create: {
      id: DEMO.customerA.userId,
      phone: '+919000000001',
      fullName: 'Asha Verma',
      email: 'asha@example.com',
      role: 'CUSTOMER',
      status: 'ACTIVE',
    },
  });
  await client.customer.upsert({
    where: { userId: customerAUser.id },
    update: {},
    create: { id: DEMO.customerA.customerId, userId: customerAUser.id },
  });

  const customerBUser = await client.user.upsert({
    where: { phone: '+919000000002' },
    update: {},
    create: {
      id: DEMO.customerB.userId,
      phone: '+919000000002',
      fullName: 'Rohit Sharma',
      role: 'CUSTOMER',
      status: 'ACTIVE',
    },
  });
  await client.customer.upsert({
    where: { userId: customerBUser.id },
    update: {},
    create: { id: DEMO.customerB.customerId, userId: customerBUser.id },
  });

  // --- Drivers + vehicles ---------------------------------------------------
  const driverAUser = await client.user.upsert({
    where: { phone: '+919000000011' },
    update: {},
    create: {
      id: DEMO.driverA.userId,
      phone: '+919000000011',
      fullName: 'Ravi Kumar',
      role: 'DRIVER',
      status: 'ACTIVE',
    },
  });
  const driverA = await client.driver.upsert({
    where: { userId: driverAUser.id },
    update: {},
    create: {
      id: DEMO.driverA.driverId,
      userId: driverAUser.id,
      kycStatus: 'APPROVED',
      drivingLicenseNumber: 'KA0320210001234',
      isOnline: true,
      rating: 4.8,
      ratingCount: 312,
      completedTrips: 1204,
    },
  });
  await client.vehicle.upsert({
    where: { registrationNumber: 'KA 05 JK 1234' },
    update: {},
    create: {
      id: DEMO.driverA.vehicleId,
      driverId: driverA.id,
      type: 'BIKE',
      make: 'Honda',
      model: 'Activa 6G',
      registrationNumber: 'KA 05 JK 1234',
      insuranceExpiry: new Date('2027-03-31T00:00:00.000Z'),
      status: 'ACTIVE',
      isDefault: true,
    },
  });

  const driverBUser = await client.user.upsert({
    where: { phone: '+919000000012' },
    update: {},
    create: {
      id: DEMO.driverB.userId,
      phone: '+919000000012',
      fullName: 'Sana Khan',
      role: 'DRIVER',
      status: 'ACTIVE',
    },
  });
  const driverB = await client.driver.upsert({
    where: { userId: driverBUser.id },
    update: {},
    create: {
      id: DEMO.driverB.driverId,
      userId: driverBUser.id,
      kycStatus: 'IN_REVIEW',
      isOnline: false,
    },
  });
  await client.vehicle.upsert({
    where: { registrationNumber: 'KA 01 AB 7788' },
    update: {},
    create: {
      id: DEMO.driverB.vehicleId,
      driverId: driverB.id,
      type: 'AUTO',
      make: 'Bajaj',
      model: 'RE Maxima',
      registrationNumber: 'KA 01 AB 7788',
      status: 'PENDING_VERIFICATION',
      isDefault: true,
    },
  });

  // --- One completed ride + payment (demonstrates the locked fee model) -----
  // Fare quote: ₹15 base + ₹10.50 distance = ₹25.50 total.
  const baseFareMinor = toMinor(15);
  const distanceFareMinor = toMinor(10.5);
  const totalMinor = baseFareMinor + distanceFareMinor;
  // Platform fee (driver side): ₹2 per eligible km on 4.2 km = ₹8.40, below the ₹10 cap.
  const actualDistanceKm = 4.2;
  const platformFeeMinor = Math.min(
    FARE_RULES.platformFeePerKmMinor * actualDistanceKm,
    FARE_RULES.platformFeePerRideCapMinor,
  );

  const completedRide = await client.ride.upsert({
    where: { id: DEMO.rideCompleted },
    update: {},
    create: {
      id: DEMO.rideCompleted,
      status: 'COMPLETED',
      customerId: DEMO.customerA.customerId,
      driverId: driverA.id,
      vehicleId: DEMO.driverA.vehicleId,
      vehicleType: 'BIKE',
      pickupLat: 12.9716,
      pickupLng: 77.5946,
      pickupAddress: 'MG Road Metro Station, Bengaluru',
      dropLat: 12.9352,
      dropLng: 77.6245,
      dropAddress: 'Koramangala 5th Block, Bengaluru',
      estimatedDistanceKm: 4.2,
      actualDistanceKm,
      baseFareMinor,
      distanceFareMinor,
      surgeMultiplier: 1,
      estimatedTotalMinor: totalMinor,
      quotedAt: new Date('2026-11-01T10:00:00.000Z'),
      finalFareMinor: totalMinor,
      paymentMethod: 'CASH',
      startOtp: '4821',
      requestedAt: new Date('2026-11-01T10:00:00.000Z'),
      assignedAt: new Date('2026-11-01T10:00:12.000Z'),
      startedAt: new Date('2026-11-01T10:03:00.000Z'),
      completedAt: new Date('2026-11-01T10:21:00.000Z'),
    },
  });
  await client.payment.upsert({
    where: { rideId: completedRide.id },
    update: {},
    create: {
      rideId: completedRide.id,
      customerId: DEMO.customerA.customerId,
      method: 'CASH',
      status: 'PAID',
      amountMinor: totalMinor,
      platformFeeMinor,
      driverEarningsMinor: totalMinor - platformFeeMinor,
      paidAt: new Date('2026-11-01T10:21:00.000Z'),
    },
  });

  // --- One open ride in SEARCHING (dispatch demo) ---------------------------
  await client.ride.upsert({
    where: { id: DEMO.rideRequested },
    update: {},
    create: {
      id: DEMO.rideRequested,
      status: 'SEARCHING',
      customerId: DEMO.customerB.customerId,
      vehicleType: 'BIKE',
      pickupLat: 12.9784,
      pickupLng: 77.6408,
      pickupAddress: 'Indiranagar 100ft Road, Bengaluru',
      dropLat: 12.9279,
      dropLng: 77.6271,
      dropAddress: 'Jyoti Nivas College, Bengaluru',
      estimatedDistanceKm: 6.8,
      baseFareMinor,
      distanceFareMinor: toMinor(17),
      surgeMultiplier: 1,
      estimatedTotalMinor: baseFareMinor + toMinor(17),
      quotedAt: new Date('2026-11-01T11:00:00.000Z'),
      paymentMethod: 'UPI',
      requestedAt: new Date('2026-11-01T11:00:00.000Z'),
    },
  });

  console.log(
    'Seed complete: 4 users, 2 customers, 2 drivers, 2 vehicles, 2 rides, 1 payment.',
  );
}

/* CLI entry — `prisma db seed` executes this file directly. When the seed is
 * imported by the integration suite, the module is only loaded, not run. */
if (require.main === module) {
  runSeed()
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
