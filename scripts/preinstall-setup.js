const fs = require('fs');

// Define the directory path for the sqlite database
const DATA_DIR = '/home/data';

try {
    console.log(`[Preinstall] Checking for persistent data directory: ${DATA_DIR}`);

    // fs.mkdirSync creates the directory synchronously.
    // { recursive: true } is crucial: it creates the directory only if it doesn't exist,
    // and suppresses the error if it already exists.
    fs.mkdirSync(DATA_DIR, { recursive: true });
    
    console.log(`[Preinstall] Success: The persistent directory ${DATA_DIR} is ready.`);
    
} catch (error) {
    // If directory creation fails, the deployment should halt.
    console.error(`[Preinstall] ERROR: Failed to create persistent directory ${DATA_DIR}. Deployment stopped.`, error);
    process.exit(1); 
}