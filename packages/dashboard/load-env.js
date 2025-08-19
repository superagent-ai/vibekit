// Load environment variables from root .env file for Next.js
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Prevent multiple loads
if (!global._vibekitEnvLoaded) {
  global._vibekitEnvLoaded = true;
  
  // Explicitly load only from root .env file
  const rootEnvPath = path.resolve(__dirname, '../../.env');

  // Check if the file exists first
  if (fs.existsSync(rootEnvPath)) {
    const result = dotenv.config({ 
      path: rootEnvPath,
      override: false  // Don't override existing env vars
    });

    if (result.error) {
      console.warn('Warning: Could not load root .env file:', result.error.message);
    } else {
      console.log('✅ Loaded environment variables from root .env file');
    }
  } else {
    console.warn('⚠️ Root .env file not found at:', rootEnvPath);
  }
  
  // Log which GitHub token is available
  if (process.env.GITHUB_TOKEN) {
    console.log('✓ GITHUB_TOKEN is set');
  } else if (process.env.GITHUB_API_KEY) {
    console.log('✓ GITHUB_API_KEY is set (will be used as GITHUB_TOKEN)');
    // Map GITHUB_API_KEY to GITHUB_TOKEN for consistency
    process.env.GITHUB_TOKEN = process.env.GITHUB_API_KEY;
  } else {
    console.log('⚠ No GitHub token found in environment');
  }
}