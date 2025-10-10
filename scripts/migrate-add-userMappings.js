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

    console.log("[migrate] checking if 'userMappings' column exists on adminConfigs...");
    const [rows] = await sequelize.query("PRAGMA table_info('adminConfigs');");
    const exists = rows.some(r => r.name === 'userMappings');

    if (exists) {
      console.log("[migrate] column 'userMappings' already exists. Nothing to do.");
    } else {
      console.log("[migrate] adding column 'userMappings' to adminConfigs...");
      await sequelize.query("ALTER TABLE adminConfigs ADD COLUMN userMappings TEXT;");
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