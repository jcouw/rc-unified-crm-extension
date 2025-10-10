// ...existing code...
require('dotenv').config();
const path = require('path');

// adjust require path to your workspace layout if needed
const { sequelize } = require('@app-connect/core/models/sequelize');

async function run() {
  try {
    console.log('[migrate] authenticating sequelize...');
    await sequelize.authenticate();
    console.log('[migrate] connected.');

    console.log("[migrate] checking if 'rcAccountId' column exists on users...");
    const [rows] = await sequelize.query("PRAGMA table_info('users');");
    const exists = rows.some(r => r.name === 'rcAccountId');

    if (exists) {
      console.log("[migrate] column 'rcAccountId' already exists. Nothing to do.");
    } else {
      console.log("[migrate] adding column 'rcAccountId' to users...");
      await sequelize.query("ALTER TABLE users ADD COLUMN rcAccountId VARCHAR(255);");
      console.log("[migrate] column added.");
    }

    await sequelize.close();
    console.log('[migrate] done.');
    process.exit(0);
  } catch (err) {
    console.error('[migrate] error:', err && err.stack ? err.stack : err);
    try { await sequelize.close(); } catch (e) {}
    process.exit(1);
  }
}

run();