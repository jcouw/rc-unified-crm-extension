const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
exports.UserModel = sequelize.define('users', {
  // id = {crmName}-{crmUserId}
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  rcAccountId: {
    type: Sequelize.STRING,
  },
  hostname: {
    type: Sequelize.STRING,
  },
  timezoneName: {
    type: Sequelize.STRING,
  },
  timezoneOffset: {
    type: Sequelize.STRING,
  },
  platform: {
    type: Sequelize.STRING,
  },
  // in apiKey auth, accessToken will be API key
  accessToken: {
    type: Sequelize.STRING(2000),
  },
  refreshToken: {
    type: Sequelize.STRING(2000),
  },
  tokenExpiry: {
    type: Sequelize.DATE
  },
  platformAdditionalInfo: {
    type: Sequelize.TEXT, // Using TEXT for MSSQL compatibility
    get() {
      const val = this.getDataValue('platformAdditionalInfo');
      if (typeof val === 'string') {
        try {
          console.log('Getting platformAdditionalInfo A:', val);
          return JSON.parse(val);
        } catch (e) {
          console.log('Getting platformAdditionalInfo B1:', e);
          console.log('Getting platformAdditionalInfo B2:', val);
          return {};
        }
      }
      console.log('Getting platformAdditionalInfo C:', val || {});
      return val || {};
    },
    set(value) {
      if (value === null || value === undefined) {
        console.log('Setting platformAdditionalInfo A:', value);
        return this.setDataValue('platformAdditionalInfo', null);
      }

      let stringValue;
      if (typeof value === 'object') {
        console.log('Setting platformAdditionalInfo B1:', value);
        stringValue = JSON.stringify(value);
        console.log('Setting platformAdditionalInfo B2:', stringValue);
      } else {
        // If it's already a string, we ensure it's not a "stringified object" 
        // that looks like '{"0":"{"...}'
        console.log('Setting platformAdditionalInfo C:', stringValue);
        stringValue = String(value);
      }

      // VITAL: Ensure we are not sending an empty object or a corrupted string
      console.log('Setting platformAdditionalInfo:', stringValue);
      this.setDataValue('platformAdditionalInfo', stringValue);
    }
  },
  userSettings: {
    type: Sequelize.TEXT, // Using TEXT for MSSQL compatibility
    get() {
      const val = this.getDataValue('userSettings');
      if (typeof val === 'string') {
        try {
          console.log('Getting userSettings A:', val);
          return JSON.parse(val);
        } catch (e) {
          console.log('Getting userSettings B1:', e);
          console.log('Getting userSettings B2:', val);
          return {};
        }
      }
      console.log('Getting userSettings:', val || {});
      return val || {};
    },
    set(value) {
      if (value === null || value === undefined) {
        console.log('Setting userSettings A:', value);
        return this.setDataValue('userSettings', null);
      }

      let stringValue;
      if (typeof value === 'object') {
        console.log('Setting userSettings B1:', value);
        stringValue = JSON.stringify(value);
        console.log('Setting userSettings B2:', stringValue);
      } else {
        // If it's already a string, we ensure it's not a "stringified object" 
        // that looks like '{"0":"{"...}'
        stringValue = String(value);
        console.log('Setting userSettings C:', stringValue);
      }

      // VITAL: Ensure we are not sending an empty object or a corrupted string
      console.log('Setting userSettings D:', stringValue);
      this.setDataValue('userSettings', stringValue);
      
    }
  }
});
