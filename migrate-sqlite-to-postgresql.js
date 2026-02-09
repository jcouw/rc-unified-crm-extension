require('dotenv').config();
// Ensure your sequelize.js is configured for the Postgres dialect
const { sequelize } = require('./packages/core/models/sequelize');
const { AdminConfigModel } = require('./packages/core/models/adminConfigModel');
const { CacheModel } = require('./packages/core/models/cacheModel');
const { CallDownListModel } = require('./packages/core/models/callDownListModel');
const { CallLogModel } = require('./packages/core/models/callLogModel');
const { MessageLogModel } = require('./packages/core/models/messageLogModel');
const { UserModel } = require('./packages/core/models/userModel');

const sqlite3 = require('sqlite3').verbose();

async function startMigration() {
    const sqliteDb = new sqlite3.Database('./dbprod.sqlite');
    const BATCH_SIZE = 500; // PostgreSQL handles moderate batches best

    try {
        // 1. Authenticate PostgreSQL Connection
        await sequelize.authenticate();
        console.log('Connected to Azure PostgreSQL.');

        // 2. Migration Function
        const migrateTable = async (model, tableName) => {
            let offset = 0;
            let totalMigrated = 0;

            console.log(`\n--- Starting Migration for ${tableName} ---`);

            const count = await new Promise((resolve, reject) => {
                sqliteDb.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
                    if (err) return reject(err);
                    resolve(row ? row.count : 0);
                });
            });

            console.log(`Total rows to migrate from SQLite: ${count}`);
            if (count === 0) return;

            while (offset < count) {
                const rows = await new Promise((resolve, reject) => {
                    sqliteDb.all(`SELECT * FROM ${tableName} LIMIT ${BATCH_SIZE} OFFSET ${offset}`, [], (err, data) => {
                        if (err) reject(err);
                        resolve(data);
                    });
                });

                if (rows.length === 0) break;

                const cleanedRows = rows.map(row => {
                    const newRow = { ...row };

                    // Specific fix for adminConfigs table
                    if (tableName === 'adminConfigs') {
                        try {
                            // Convert the SQLite string back into a real JavaScript Object
                            newRow.userSettings = JSON.parse(newRow.userSettings);
                            newRow.customAdapter = JSON.parse(newRow.customAdapter);
                        } catch (e) {
                            console.warn(`[${tableName}] Failed to parse JSON for a row, keeping as-is.`);
                        }
                    }

                    // Specific fix for users table
                    if (tableName === 'users') {
                        try {
                            // Convert the SQLite string back into a real JavaScript Object
                            newRow.userSettings = JSON.parse(newRow.userSettings);
                            newRow.platformAdditionalInfo = JSON.parse(newRow.platformAdditionalInfo);
                        } catch (e) {
                            console.warn(`[${tableName}] Failed to parse JSON for a row, keeping as-is.`);
                        }
                    }

                    return newRow;
                });

                try {
                    if (cleanedRows.length > 0) {
                        await model.bulkCreate(cleanedRows, {
                            ignoreDuplicates: true, // Native Postgres conflict handling
                            hooks: false,
                            logging: false
                        });
                    }
                } catch (insertError) {
                    console.error(`[${tableName}] Batch insert error:`, insertError.message);
                }

                totalMigrated += rows.length;
                offset += BATCH_SIZE;
                console.log(`[${tableName}] Progress: ${totalMigrated}/${count}`);
            }
        };

        // 3. Execute for your tables
        // Order is critical for foreign key relationships: Users must come first.
        await migrateTable(UserModel, 'users');
        await migrateTable(CallLogModel, 'callLogs');
        await migrateTable(MessageLogModel, 'messageLogs');
        await migrateTable(AdminConfigModel, 'adminConfigs');
        await migrateTable(CacheModel, 'caches');
        await migrateTable(CallDownListModel, 'callDownLists');

        console.log('\nAll migrations to PostgreSQL complete!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        sqliteDb.close();
        await sequelize.close();
    }
}

startMigration();