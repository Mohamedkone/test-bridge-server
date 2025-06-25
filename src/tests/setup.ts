import dotenv from 'dotenv';
import path from 'path';

// Load environment variables for tests
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Add global test setup here
beforeAll(async () => {
  // Setup test database, etc.
  console.log('Test suite setup complete');
});

afterAll(async () => {
  // Cleanup
  console.log('Test suite cleanup complete');
});