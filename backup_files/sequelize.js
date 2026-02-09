const { Sequelize } = require('sequelize');

// Azure SQL connection strings usually come in a standard URI format,
// but we'll use the constructor for better control over Azure-specific options.
const sequelize = new Sequelize(
  process.env.DB_NAME,      
  process.env.DB_USER,      
  process.env.DB_PASSWORD,  
  {
    host: process.env.DB_HOST, 
    port: 1433,
    dialect: 'mssql',
    logging: false,
    dialectOptions: {
      options: {
        // Essential for Azure SQL
        encrypt: true, 
        // Ensures the connection waits for Azure to respond
        connectTimeout: 30000, 
        // Useful if you are using a newer SQL version
        trustServerCertificate: false ,
        useUTC: false, 
        enableArithAbort: true
      }
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

exports.sequelize = sequelize;
