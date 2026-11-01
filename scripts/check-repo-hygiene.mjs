#!/usr/bin/env node
/**
 * Rideppy WP-6 repository hygiene + accidental-secret gate.
 *
 * Zero dependencies. Runs against the GIT TRACKED tree only (what would be
 * pushed), so build artifacts or local .env files that are properly ignored
 * never produce noise.
 *
 * FAILS when any tracked file:
 *   - is a build artifact / dependency directory (dist/, coverage/, build/,
 *     .turbo/, node_modules/) or a log/backup/key file;
 *   - is an environment file (.env, .env.local, ...) — .env.example is allowed;
 *   - contains a private key block, a cloud/API token pattern, or a
 *     credential-bearing service URL pointing at a NON-localhost host.
 *
 * Localhost dev credential URLs (e.g. the documented
 * postgresql://rideppy:rideppy@localhost dev setup) are printed as info,
 * never as failures — they are inert local-only examples.
 *
 * Usage: node scripts/check-repo-hygiene.mjs   (exit 0 = clean)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let infos = 0;
let scanned = 0;

function fail(message) {
  failures += 1;
  console.error(`  [FAIL] ${message}`);
}

function info(message) {
  infos += 1;
  console.log(`  [info] ${message}`);
}

/** Tracked files as NUL-separated names (safe for spaces). */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  }).toString('utf8');
  return out.split('\0').filter(Boolean);
}

const ARTIFACT_PATTERNS = [
  { re: /^(dist|coverage|build|\.turbo|\.next|node_modules)\//, why: 'build artifact / dependency directory tracked' },
  { re: /\.(log|bak|pem|key|p12|pfx)$/, why: 'log/backup/key file tracked' },
];

const ENV_FILE_RE = /(^|\/)\.env(\..+)?$/;
const ENV_EXAMPLE_RE = /(^|\/)\.env(\..+)?\.example$/;

/** High-risk secret patterns. Anything matching MUST NOT be tracked. */
const SECRET_PATTERNS = [
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, why: 'private key block' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: 'AWS access key id' },
  { re: /\bghp_[A-Za-z0-9]{36}\b/, why: 'GitHub personal access token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/, why: 'GitHub fine-grained token' },
  { re: /\bsk-[A-Za-z0-9_-]{20,}\b/, why: 'sk- style API key' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, why: 'Slack token' },
  { re: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/, why: 'JWT' },
];

/**
 * Credential-bearing service URLs. Group 3 is the host. Only NON-localhost
 * hosts are failures (documented localhost dev URLs are info only).
 */
const CREDENTIAL_URL_RE =
  /\b(?:postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?|amqp):\/\/([^\s:@/"']+):([^\s@/"']+)@([^\s"'`,)\]]+)/g;

const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|\[::1\]|::1|host\.docker\.internal)/i;
/**
 * RFC 2606 / 6761 / 8301 reserved suffixes — hosts under these TLDs cannot
 * be routable public hosts, so credential URLs pointing at them are
 * documentation/test placeholders, not real secrets.
 */
const FICTIONAL_HOST_RE = /\.(internal|example|test|invalid|local)$/i;
const PLACEHOLDER_RE = /^(change_me|changeit|example|password|postgres(?:ql)?_password)/i;

function isTextFile(filePath) {
  try {
    if (statSync(filePath).size > 1_000_000) return false;
    const buf = readFileSync(filePath);
    if (buf.includes(0)) return false; // binary
    return true;
  } catch {
    return false;
  }
}

function main() {
  console.log('Rideppy repository hygiene + secret scan (tracked files only)');

  const files = trackedFiles();
  console.log(`  tracked files: ${files.length}`);

  const fileSet = new Set(files);

  // --- Required files present ---------------------------------------------
  for (const required of ['.env.example', 'pnpm-lock.yaml', 'README.md']) {
    if (fileSet.has(required)) {
      console.log(`  [PASS] required file tracked: ${required}`);
    } else {
      fail(`required file NOT tracked: ${required}`);
    }
  }

  // --- Per-file checks -----------------------------------------------------
  for (const rel of files) {
    // Structural hygiene.
    const artifact = ARTIFACT_PATTERNS.find(({ re }) => re.test(rel));
    if (artifact) {
      fail(`${rel}: ${artifact.why}`);
      continue;
    }
    if (ENV_FILE_RE.test(rel) && !ENV_EXAMPLE_RE.test(rel)) {
      fail(`${rel}: environment file tracked (secrets risk) — only *.example may be committed`);
      continue;
    }

    // Content scan (text files below 1 MB only).
    const abs = join(REPO_ROOT, rel);
    if (!isTextFile(abs)) continue;
    scanned += 1;
    let content;
    try {
      content = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    for (const { re, why } of SECRET_PATTERNS) {
      const match = content.match(re);
      if (match) {
        fail(`${rel}: ${why} detected (${match[0].slice(0, 12)}…)`);
      }
    }

    for (const match of content.matchAll(CREDENTIAL_URL_RE)) {
      const [, user, password, hostPort] = match;
      const host = hostPort.split(/[/:]/)[0];
      if (LOCALHOST_RE.test(host)) {
        info(`${rel}: localhost dev credential URL (inert local-only example)`);
      } else if (FICTIONAL_HOST_RE.test(host)) {
        info(
          `${rel}: placeholder credential URL to a reserved-TLD host ` +
            `(${user}@${host}) — documentation/test fixture, not a secret`,
        );
      } else if (PLACEHOLDER_RE.test(password) || /^(change_me)/i.test(password)) {
        info(`${rel}: non-localhost placeholder credential URL (${user}@${host}) — verify it is a template`);
      } else {
        fail(
          `${rel}: credential-bearing URL to non-localhost host ` +
            `${user}:***@${host} — remove the secret and rotate it`,
        );
      }
    }
  }

  // --- Summary -------------------------------------------------------------
  console.log('');
  if (failures === 0) {
    console.log(
      `HYGIENE OK — ${scanned} text files scanned, ${infos} info note(s), 0 failures`,
    );
    process.exit(0);
  }
  console.error(
    `HYGIENE FAILED — ${failures} failure(s), ${infos} info note(s). ` +
      'Fix the tracked-file issues above before pushing.',
  );
  process.exit(1);
}

main();
