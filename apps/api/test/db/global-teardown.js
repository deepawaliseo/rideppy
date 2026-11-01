'use strict';

/**
 * Jest global teardown for the database integration suite (WP-6).
 * Removes the transient db-probe.json written by global-setup.js so no
 * probe state is ever left behind in the working tree.
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = async function globalTeardown() {
  try {
    fs.unlinkSync(path.join(__dirname, 'db-probe.json'));
  } catch {
    // Nothing to clean up — fine.
  }
};
