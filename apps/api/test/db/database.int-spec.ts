/**
 * Database integration tests — run against a REAL PostgreSQL 16 + PostGIS.
 *
 * CI: runs in the `database` job with a postgis/postgis:16 service container.
 * Local: `pnpm --filter api test:db` with the database running (see
 * docs/DATABASE-SETUP.md). Every test self-skips when the database is
 * unreachable, so this file never fails a machine without a database.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const itIfDb = (name: string, fn: () => Promise<void>): void =>
  it(name, async () => {
    const up = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
    if (!up) {
      console.warn(`SKIP (database unreachable): ${name}`);
      return;
    }
    await fn();
  });

afterAll(async () => {
  await prisma.$disconnect();
});

describe('database integration (PostgreSQL 16 + PostGIS)', () => {
  itIfDb('has the postgis extension installed', async () => {
    const rows = await prisma.$queryRaw<{ installed: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed
    `;
    expect(rows[0]?.installed).toBe(true);
  });

  itIfDb(
    'roundtrips a customer through the User 1:1 profile model',
    async () => {
      const phone = '+919812345678';
      const user = await prisma.user.create({
        data: {
          phone,
          fullName: 'Integration Test Rider',
          role: 'CUSTOMER',
          status: 'ACTIVE',
          customer: { create: {} },
        },
        include: { customer: true },
      });

      expect(user.phone).toBe(phone);
      expect(user.customer).not.toBeNull();

      const fetched = await prisma.customer.findUnique({
        where: { userId: user.id },
        include: { user: true },
      });
      expect(fetched?.user.fullName).toBe('Integration Test Rider');

      // Cleanup (integration fixtures only).
      await prisma.user.delete({ where: { id: user.id } });
      expect(await prisma.customer.count({ where: { userId: user.id } })).toBe(
        0,
      );
    },
  );

  itIfDb('enforces the unique phone constraint', async () => {
    const phone = '+919812345679';
    await prisma.user.create({ data: { phone, fullName: 'First' } });
    await expect(
      prisma.user.create({ data: { phone, fullName: 'Duplicate' } }),
    ).rejects.toThrow();
    await prisma.user.deleteMany({ where: { phone } });
  });

  itIfDb(
    'populates the GENERATED geography columns and GiST indexes',
    async () => {
      const customerId = await ensureCustomer();
      const ride = await prisma.ride.create({
        data: {
          customerId,
          vehicleType: 'BIKE',
          pickupLat: 12.9716,
          pickupLng: 77.5946,
          dropLat: 12.9352,
          dropLng: 77.6245,
          estimatedDistanceKm: 4.2,
          baseFareMinor: 1500,
          distanceFareMinor: 1050,
          estimatedTotalMinor: 2550,
          quotedAt: new Date(),
          paymentMethod: 'CASH',
        },
      });

      const point = await prisma.$queryRaw<{ lng: number; lat: number }[]>`
      SELECT ST_X("pickupGeo"::geometry)::float8 AS lng, ST_Y("pickupGeo"::geometry)::float8 AS lat
      FROM "rides" WHERE "id" = ${ride.id}::uuid
    `;
      expect(point[0]?.lng).toBeCloseTo(77.5946);
      expect(point[0]?.lat).toBeCloseTo(12.9716);

      // ...and the GiST indexes created by the migration exist.
      const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'rides' AND indexdef LIKE '%gist%' AND indexdef LIKE '%Geo%'
    `;
      const names = indexes.map((row) => row.indexname).sort();
      expect(names).toContain('rides_pickupGeo_idx');
      expect(names).toContain('rides_dropGeo_idx');

      await prisma.ride.delete({ where: { id: ride.id } });
    },
  );
  itIfDb(
    'supports a ST_DWithin proximity query (raw SQL pattern)',
    async () => {
      const customerId = await ensureCustomer();
      const ride = await prisma.ride.create({
        data: {
          customerId,
          vehicleType: 'BIKE',
          pickupLat: 12.9716,
          pickupLng: 77.5946,
          dropLat: 12.9352,
          dropLng: 77.6245,
          estimatedDistanceKm: 4.2,
          baseFareMinor: 1500,
          distanceFareMinor: 1050,
          estimatedTotalMinor: 2550,
          quotedAt: new Date(),
          paymentMethod: 'CASH',
        },
      });

      // MG Road Metro pickup must be found within 500 m of itself, and the
      // query exercises the GiST index path (no seq-scan assertion possible
      // on a tiny table, but the geometry math is verified).
      const hits = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"::text FROM "rides"
      WHERE ST_DWithin(
        "pickupGeo",
        ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography,
        500
      ) AND "id" = ${ride.id}::uuid
    `;
      expect(hits).toHaveLength(1);

      await prisma.ride.delete({ where: { id: ride.id } });
    },
  );

  itIfDb('rejects a payment pointing at an unknown ride', async () => {
    const customerId = await ensureCustomer();
    await expect(
      prisma.payment.create({
        data: {
          rideId: randomUUID(),
          customerId,
          method: 'UPI',
          amountMinor: 1000,
          platformFeeMinor: 0,
          driverEarningsMinor: 1000,
        },
      }),
    ).rejects.toThrow();
  });
});

/** Creates (or reuses) one integration-fixture customer; cleaned per test. */
let fixtureUserId: string | null = null;
async function ensureCustomer(): Promise<string> {
  if (!fixtureUserId) {
    const user = await prisma.user.create({
      data: {
        phone: '+919800000001',
        fullName: 'Geo Fixture Rider',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        customer: { create: {} },
      },
      include: { customer: true },
    });
    fixtureUserId = user.id;
  }
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { userId: fixtureUserId },
  });
  return customer.id;
}

afterAll(async () => {
  if (fixtureUserId) {
    await prisma.user.deleteMany({ where: { id: fixtureUserId } });
  }
});
