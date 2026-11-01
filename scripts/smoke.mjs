#!/usr/bin/env node
/**
 * Rideppy WP-6 live HTTP gate — verifies a RUNNING API instance.
 *
 * Zero dependencies (Node 18+ global fetch). Runs on Windows, Linux, macOS.
 *
 * Checks:
 *   GET /health      200 + HealthResponse contract with database:'up'
 *                    (--expect-db-down: 503 + ApiErrorResponse envelope with
 *                    message "Database unreachable" instead)
 *   GET /docs        200 + Swagger UI HTML
 *   GET /docs-json   200 + OpenAPI 3 document exposing /health
 *   GET /<unknown>   404 + ApiErrorResponse envelope (exact shape)
 *   helmet header    x-content-type-options: nosniff on every response
 *
 * Usage:
 *   node scripts/smoke.mjs [--base-url http://127.0.0.1:3100]
 *                          [--expect-db-down]
 *
 * Exit code 0 only when every check passed. This script NEVER talks to the
 * database directly — database truth comes from the API's own /health ping.
 */

const args = process.argv.slice(2);

function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

const hasFlag = (flag) => args.includes(flag);

const BASE_URL = (argValue('--base-url', 'http://127.0.0.1:3100')).replace(
  /\/+$/,
  '',
);
const EXPECT_DB_DOWN = hasFlag('--expect-db-down');
const REQUEST_TIMEOUT_MS = 5000;

let passed = 0;
let failed = 0;

function report(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function assert(condition, message, detail = '') {
  report(message, Boolean(condition), detail);
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

async function fetchJson(pathname) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, body, text };
}

/** Exact ApiErrorResponse envelope shape from @rideppy/contracts. */
function assertErrorEnvelope(envelope, expectedStatus, pathname, label) {
  assert(envelope && typeof envelope === 'object', `${label}: body is JSON`);
  if (!envelope) return;
  assert(envelope.success === false, `${label}: success === false`);
  assert(
    envelope.statusCode === expectedStatus,
    `${label}: statusCode === ${expectedStatus}`,
    `got ${String(envelope.statusCode)}`,
  );
  assert(
    typeof envelope.error === 'string' && envelope.error.length > 0,
    `${label}: error is a non-empty string`,
  );
  assert(
    typeof envelope.message === 'string' || Array.isArray(envelope.message),
    `${label}: message is string or string[]`,
  );
  assert(envelope.path === pathname, `${label}: path === ${pathname}`);
  assert(
    isIsoTimestamp(envelope.timestamp),
    `${label}: timestamp is ISO-8601`,
    String(envelope.timestamp),
  );
}

async function main() {
  console.log(
    `Rideppy live HTTP gate — ${BASE_URL}` +
      (EXPECT_DB_DOWN ? ' (expecting database DOWN)' : ''),
  );

  let reachable = false;
  try {
    await fetch(`${BASE_URL}/docs-json`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    reachable = true;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    console.error(
      `[FAIL] API not reachable at ${BASE_URL} — boot it first ` +
        '(node apps/api/dist/main.js after pnpm build).',
    );
    process.exit(1);
  }

  // --- 1) /health ----------------------------------------------------------
  console.log('1) GET /health');
  {
    const { response, body, text } = await fetchJson('/health');
    if (EXPECT_DB_DOWN) {
      assert(
        response.status === 503,
        '/health returns 503 when the database is down',
        `got ${String(response.status)}`,
      );
      assertErrorEnvelope(body, 503, '/health', '/health');
      assert(
        body?.message === 'Database unreachable',
        '/health envelope message === "Database unreachable"',
        JSON.stringify(body?.message ?? null),
      );
      assert(
        body?.database === undefined,
        '/health never reports a database field on failure',
      );
    } else {
      assert(
        response.status === 200,
        '/health returns 200',
        `got ${String(response.status)}`,
      );
      assert(body && typeof body === 'object', '/health body is JSON');
      assert(body?.status === 'ok', '/health: status === "ok"');
      assert(
        body?.service === 'Rideppy API',
        '/health: service === "Rideppy API"',
      );
      assert(
        typeof body?.version === 'string' && body.version.length > 0,
        '/health: version is a non-empty string',
      );
      assert(isIsoTimestamp(body?.timestamp), '/health: timestamp is ISO-8601');
      assert(
        body?.database === 'up',
        '/health: database === "up" (real SELECT 1 answered)',
        `got ${String(body?.database)}`,
      );
    }
    assert(
      response.headers.get('x-content-type-options') === 'nosniff',
      'helmet: x-content-type-options === nosniff',
    );
  }

  // --- 2) /docs ------------------------------------------------------------
  console.log('2) GET /docs (Swagger UI)');
  {
    const response = await fetch(`${BASE_URL}/docs`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    assert(
      response.status === 200,
      '/docs returns 200',
      `got ${String(response.status)}`,
    );
    assert(
      (response.headers.get('content-type') ?? '').includes('text/html'),
      '/docs serves HTML',
    );
    assert(/swagger/i.test(text), '/docs HTML references Swagger UI');
  }

  // --- 3) /docs-json -------------------------------------------------------
  console.log('3) GET /docs-json (OpenAPI document)');
  {
    const { response, body } = await fetchJson('/docs-json');
    assert(
      response.status === 200,
      '/docs-json returns 200',
      `got ${String(response.status)}`,
    );
    assert(
      typeof body?.openapi === 'string' && body.openapi.startsWith('3.'),
      '/docs-json: openapi 3.x',
    );
    assert(
      body?.info?.title === 'Rideppy API',
      '/docs-json: info.title === "Rideppy API"',
      String(body?.info?.title ?? ''),
    );
    assert(
      Boolean(body?.paths?.['/health']),
      '/docs-json: /health path documented',
    );
  }

  // --- 4) unknown route ----------------------------------------------------
  console.log('4) GET /wp6-smoke-unknown (error envelope)');
  {
    const { response, body } = await fetchJson('/wp6-smoke-unknown');
    assert(
      response.status === 404,
      'unknown route returns 404',
      `got ${String(response.status)}`,
    );
    assertErrorEnvelope(body, 404, '/wp6-smoke-unknown', '404');
    assert(
      body?.error === 'Not Found',
      '404 envelope error === "Not Found"',
      String(body?.error ?? ''),
    );
  }

  // --- Summary -------------------------------------------------------------
  console.log('');
  if (failed === 0) {
    console.log(
      `SMOKE OK — ${passed} checks passed` +
        (EXPECT_DB_DOWN ? ' (database-down drill)' : ' (database up)'),
    );
    process.exit(0);
  }
  console.error(`SMOKE FAILED — ${failed} check(s) failed, ${passed} passed`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`SMOKE ERROR — ${error.message}`);
  process.exit(1);
});
