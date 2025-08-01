import dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables for integration tests
dotenv.config({ path: resolve(process.cwd(), ".env") });

// Integration tests need real filesystem access, so no mocks here
// Only set up environment variables and global test configuration