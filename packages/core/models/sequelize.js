const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,      
  process.env.DB_USER,      
  process.env.DB_PASSWORD,  
  {
    host: process.env.DB_HOST, 
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions:{
      ssl: {
        rejectUnauthorized: false
      }
    },
    logging: false
  }
);
 

exports.sequelize = sequelize;