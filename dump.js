const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const db = new sqlite3.Database('./dbprod.sqlite');
const tableName = 'callLogs'; // Change this for other tables
const outputFile = tableName + '-migration.sql';

db.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {
  if (err) throw err;

  const sql = rows.map(row => {
    const columns = Object.keys(row).join(', ');
    const values = Object.values(row).map(val => {
      if (val === null) return 'NULL';
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`; // Escape single quotes for SQL
      if (typeof val === 'boolean') return val ? 1 : 0; // Convert to BIT for Azure
      return val;
    }).join(', ');
    
    return `INSERT INTO ${tableName} (${columns}) VALUES (${values});`;
  }).join('\n');

  fs.writeFileSync(outputFile, sql);
  console.log(`✅ Success! ${rows.length} rows exported to ${outputFile}`);
  db.close();
});