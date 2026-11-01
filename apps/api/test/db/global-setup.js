'use strict';

/**
 * Jest global setup for the database integration suite (WP-6).
 *
 * Probes the database exactly once, BEFORE tests are collected, and records
 * the result in db-probe.json next to this file. The spec file reads that
 * result synchronously so it can:
 *  - run every test for real when the database is up;
 *  - register native `it.skip` tests when the database is down and database
 *    verification is NOT required (skips are never reported as passes);
 *  - let tests fail EXPLICITLY when the database is down but verification
 *    IS required (RIDEPPY_DB_REQUIRED=1 — set by scripts/verify.ps1 and CI).
 *
 * The probe result never contains credentials — only host:port/dbname.
 * global-teardown.js deletes the probe file after the run.
 */

const fs = require('node:fs');
const path = require('node:path');

const PROBE_FILE = path.join(__dirname, 'db-probe.json');
const PROBE_TIMEOUT_MS = 8000;

const REQUIRED = /^(1|true|yes|on)$/i.test(
  String(process.env.RIDEPPY_DB_REQUIRED || ''),
);

/** Redact credentials — only host:port/dbname may appear in the probe file. */
function redactDatabaseUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return 'unparseable DATABASE_URL';
  }
}

/** Real round-trip probe: only a successful `SELECT 1` counts as "up". */
async function probeDatabase() {
  let PrismaClient;
  try {
    ({ PrismaClient } = require('@prisma/client'));
  } catch (error) {
    return { up: false, error: `@prisma/client not loadable: ${error.message}` };
  }

  const prisma = new PrismaClient();
  let timer;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`probe timed out after ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS,
        );
        // Do not keep the Node event loop (or Jest) alive for the timer.
        if (typeof timer.unref === 'function') timer.unref();
      }),
    ]);
    return { up: true, error: null };
  } catch (error) {
    return { up: false, error: error.message || String(error) };
  } finally {
    if (timer) clearTimeout(timer);
    await prisma.$disconnect().catch(() => {});
  }
}

module.exports = async function globalSetup() {
  const { up, error } = await probeDatabase();

  const result = {
    probedAt: new Date().toISOString(),
    required: REQUIRED,
    up,
    error,
    endpoint:
      up && process.env.DATABASE_URL
        ? redactDatabaseUrl(process.env.DATABASE_URL)
        : null,
  };

  fs.writeFileSync(PROBE_FILE, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `[db-gate] probe: database=${up ? 'up' : 'down'} ` +
      `required=${REQUIRED ? 'yes' : 'no'}` +
      `${error ? ` (${error})` : ''}`,
  );
  if (REQUIRED && !up) {
    console.warn(
      '[db-gate] RIDEPPY_DB_REQUIRED=1 but the database is unreachable — ' +
        'the integration suite will FAIL explicitly. Skipped tests are never ' +
        'counted as database verification.',
    );
  }
};
