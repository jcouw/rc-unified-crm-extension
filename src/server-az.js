// main file for local server, specific for Azure deployment
require('dotenv').config()

const { getServer } = require('./index');
const port = process.env.PORT || 8080; // Use Azure-provided PORT or default

getServer().listen(port, () => {
  console.log(`-> server running at port: ${port}`);
});