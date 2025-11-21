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

    // adminConfigs.adminAccessToken
    console.log("[migrate] checking if 'adminAccessToken' column exists on adminConfigs...");
    let [rows] = await sequelize.query("PRAGMA table_info('adminConfigs');");
    let exists = rows.some(r => r.name === 'adminAccessToken');
    if (exists) {
      console.log("[migrate] column 'adminAccessToken' already exists. Nothing to do.");
    } else {
      console.log("[migrate] adding column 'adminAccessToken' to adminConfigs...");
      await sequelize.query("ALTER TABLE adminConfigs ADD COLUMN adminAccessToken VARCHAR(512);");
      console.log("[migrate] column added.");
    }

    // adminConfigs.adminRefreshToken
    console.log("[migrate] checking if 'adminRefreshToken' column exists on adminConfigs...");
    [rows] = await sequelize.query("PRAGMA table_info('adminConfigs');");
    exists = rows.some(r => r.name === 'adminRefreshToken');
    if (exists) {
      console.log("[migrate] column 'adminRefreshToken' already exists. Nothing to do.");
    } else {
      console.log("[migrate] adding column 'adminRefreshToken' to adminConfigs...");
      await sequelize.query("ALTER TABLE adminConfigs ADD COLUMN adminRefreshToken VARCHAR(512);");
      console.log("[migrate] column added.");
    }

    // adminConfigs.adminTokenExpiry
    console.log("[migrate] checking if 'adminTokenExpiry' column exists on adminConfigs...");
    [rows] = await sequelize.query("PRAGMA table_info('adminConfigs');");
    exists = rows.some(r => r.name === 'adminTokenExpiry');
    if (exists) {
      console.log("[migrate] column 'adminTokenExpiry' already exists. Nothing to do.");
    } else {
      console.log("[migrate] adding column 'adminTokenExpiry' to adminConfigs...");
      await sequelize.query("ALTER TABLE adminConfigs ADD COLUMN adminTokenExpiry DATE;");
      console.log("[migrate] column added.");
    }

    // adminConfigs.userMappings
    console.log("[migrate] checking if 'userMappings' column exists on adminConfigs...");
    [rows] = await sequelize.query("PRAGMA table_info('adminConfigs');");
    exists = rows.some(r => r.name === 'userMappings');
    if (exists) {
      console.log("[migrate] column 'userMappings' already exists. Nothing to do.");
    } else {
      console.log("[migrate] adding column 'userMappings' to adminConfigs...");
      await sequelize.query("ALTER TABLE adminConfigs ADD COLUMN userMappings TEXT;");
      console.log("[migrate] column added.");
    }

    // users.rcAccountId
    console.log("[migrate] checking if 'rcAccountId' column exists on users...");
    [rows] = await sequelize.query("PRAGMA table_info('users');");
    exists = rows.some(r => r.name === 'rcAccountId');
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