# Testing Strategy

## Overview

This document outlines a comprehensive testing strategy for the file transfer application. The strategy ensures that all components are thoroughly tested, from individual units to the entire system, and establishes a framework for continuous testing throughout the development lifecycle.

## 1. Testing Approach

### Testing Pyramid

Our testing strategy follows the testing pyramid approach, with a solid foundation of unit tests, complemented by integration tests, and topped with end-to-end tests:

```
                    ┌───────────┐
                    │   E2E     │  ← Fewer, slower, more comprehensive tests
                    └───────────┘
                   ┌─────────────┐
                   │ Integration │  ← Test interaction between components
                   └─────────────┘
                 ┌─────────────────┐
                 │      Unit       │  ← Many, fast, focused tests
                 └─────────────────┘
```

### Development Process Integration

Testing is integrated throughout the development process:

1. **Test-Driven Development (TDD)** for core services and critical functionality
2. **Tests Before Refactoring** for existing code migrated from LoopBack 4
3. **Continuous Integration** with automated test runs on every PR
4. **Regular Test Coverage Reviews** to identify gaps

## 2. Test Types

### Unit Testing

Unit tests focus on testing individual components in isolation, with dependencies mocked or stubbed.

#### Scope

- **Services**: Business logic and domain rules
- **Repositories**: Data access methods
- **Controllers**: Request handling and response formatting
- **Middleware**: Authentication, authorization, validation
- **Utilities**: Helper functions and shared utilities

#### Examples

```typescript
// Example unit test for a service method
describe('FileService.getDownloadUrl', () => {
  let fileService: FileService;
  let fileRepositoryMock: MockType<FileRepository>;
  let storageServiceMock: MockType<StorageService>;
  let authServiceMock: MockType<AuthService>;
  
  beforeEach(() => {
    // Setup mocks
    fileRepositoryMock = createMock<FileRepository>();
    storageServiceMock = createMock<StorageService>();
    authServiceMock = createMock<AuthService>();
    
    // Create service with mocked dependencies
    fileService = new FileServiceImpl(
      fileRepositoryMock,
      storageServiceMock,
      authServiceMock
    );
  });
  
  it('should generate a download URL for an existing file', async () => {
    // Arrange
    const fileId = 'test-file-id';
    const userId = 'test-user-id';
    const mockFile = {
      id: fileId,
      storageId: 'test-storage-id',
      storageKey: 'test/storage/key.pdf',
      size: 1024,
      name: 'test-file.pdf'
    };
    const mockUrl = 'https://test-download-url.example.com';
    
    fileRepositoryMock.findById.mockResolvedValue(mockFile);
    storageServiceMock.getSignedUrl.mockResolvedValue({
      success: true,
      url: mockUrl
    });
    
    // Act
    const result = await fileService.getDownloadUrl(fileId, { userId });
    
    // Assert
    expect(result).toBe(mockUrl);
    expect(fileRepositoryMock.findById).toHaveBeenCalledWith(fileId);
    expect(storageServiceMock.getSignedUrl).toHaveBeenCalledWith(
      mockFile.storageId,
      mockFile.storageKey,
      expect.objectContaining({
        operation: 'read',
        expiresIn: expect.any(Number)
      })
    );
  });
  
  it('should throw NotFoundError for non-existent file', async () => {
    // Arrange
    const fileId = 'non-existent-file';
    fileRepositoryMock.findById.mockResolvedValue(null);
    
    // Act & Assert
    await expect(fileService.getDownloadUrl(fileId, {}))
      .rejects
      .toThrow(NotFoundError);
  });
  
  it('should log file download activity', async () => {
    // Arrange
    const fileId = 'test-file-id';
    const userId = 'test-user-id';
    const mockFile = {
      id: fileId,
      storageId: 'test-storage-id',
      storageKey: 'test/storage/key.pdf',
      size: 1024,
      name: 'test-file.pdf'
    };
    
    fileRepositoryMock.findById.mockResolvedValue(mockFile);
    storageServiceMock.getSignedUrl.mockResolvedValue({
      success: true,
      url: 'https://test-url.com'
    });
    
    // Act
    await fileService.getDownloadUrl(fileId, { userId });
    
    // Assert
    expect(fileRepositoryMock.logActivity).toHaveBeenCalledWith(
      fileId,
      userId,
      'download',
      expect.any(Object)
    );
  });
});
```

### Integration Testing

Integration tests verify that different components work together correctly.

#### Scope

- **Repository + Database**: Database connectivity and query execution
- **Service + Repository**: Service interactions with data layer
- **Controller + Service**: API endpoint functionality
- **WebSocket + Redis**: Pub/Sub functionality for real-time features
- **Authentication + Authorization**: Security flows

#### Examples

```typescript
// Example integration test for repository and database
describe('FileRepository (Integration)', () => {
  let connection: mysql.Connection;
  let fileRepository: FileRepository;
  
  beforeAll(async () => {
    // Setup test database connection
    connection = await createTestDatabaseConnection();
    
    // Run migrations to set up schema
    await runMigrations(connection);
    
    // Create repository with real database connection
    fileRepository = new FileRepositoryImpl(connection);
  });
  
  afterAll(async () => {
    // Close database connection
    await connection.end();
  });
  
  beforeEach(async () => {
    // Clear test data before each test
    await clearTestData(connection);
  });
  
  it('should create and retrieve a file record', async () => {
    // Arrange
    const fileData = {
      name: 'test-file.pdf',
      size: 1024,
      mimeType: 'application/pdf',
      roomId: 'test-room-id',
      storageId: 'test-storage-id',
      uploadedById: 'test-user-id',
      fileType: 'file' as const
    };
    
    // Act
    const createdFile = await fileRepository.create(fileData);
    const retrievedFile = await fileRepository.findById(createdFile.id);
    
    // Assert
    expect(retrievedFile).toBeTruthy();
    expect(retrievedFile?.name).toBe(fileData.name);
    expect(retrievedFile?.size).toBe(fileData.size);
    // Additional assertions...
  });
  
  it('should find files by room ID', async () => {
    // Arrange - Create multiple files in different rooms
    const roomId1 = 'room-1';
    const roomId2 = 'room-2';
    
    await fileRepository.create({ 
      name: 'file1.pdf', 
      roomId: roomId1,
      // other required fields...
    });
    
    await fileRepository.create({ 
      name: 'file2.pdf', 
      roomId: roomId1,
      // other required fields...
    });
    
    await fileRepository.create({ 
      name: 'file3.pdf', 
      roomId: roomId2,
      // other required fields...
    });
    
    // Act
    const room1Files = await fileRepository.findByRoomId(roomId1);
    const room2Files = await fileRepository.findByRoomId(roomId2);
    
    // Assert
    expect(room1Files.length).toBe(2);
    expect(room2Files.length).toBe(1);
    expect(room1Files[0].roomId).toBe(roomId1);
    expect(room2Files[0].roomId).toBe(roomId2);
  });
});

// Example integration test for controller + service
describe('FileController (Integration)', () => {
  let app: Express;
  let authToken: string;
  
  beforeAll(async () => {
    // Setup test application
    app = await setupTestApp();
    
    // Get auth token for test user
    authToken = await getTestUserToken();
  });
  
  it('should upload a file and return file metadata', async () => {
    // Arrange
    const testFile = Buffer.from('test file content');
    const fileName = 'test-upload.txt';
    const roomId = 'test-room-id';
    
    // Act
    const response = await request(app)
      .post('/api/files/upload-url')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fileName,
        roomId,
        size: testFile.length,
        parentId: null
      });
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('uploadId');
    expect(response.body.data).toHaveProperty('fileId');
    expect(response.body.data).toHaveProperty('signedUrls');
    expect(response.body.data.signedUrls.length).toBeGreaterThan(0);
  });
});
```

### End-to-End Testing

E2E tests verify entire user flows and scenarios from start to finish.

#### Scope

- **User Registration and Authentication**
- **File Upload and Download**
- **Room Creation and Management**
- **User and Company Administration**
- **Storage Integration**
- **WebSocket-based Real-time Features**

#### Examples

```typescript
// Example E2E test for file upload flow
describe('File Upload Flow (E2E)', () => {
  let browser: Browser;
  let page: Page;
  let testUser: TestUser;
  
  beforeAll(async () => {
    // Setup browser
    browser = await puppeteer.launch();
    
    // Create test user
    testUser = await createTestUser();
  });
  
  afterAll(async () => {
    await browser.close();
    await cleanupTestUser(testUser);
  });
  
  beforeEach(async () => {
    page = await browser.newPage();
    
    // Log in the test user
    await loginTestUser(page, testUser);
  });
  
  afterEach(async () => {
    await page.close();
  });
  
  it('should upload a file to a room', async () => {
    // Navigate to a room
    await page.goto(`${appUrl}/rooms/${testUser.roomId}`);
    await page.waitForSelector('.room-files-container');
    
    // Get initial file count
    const initialFileCount = await page.evaluate(() => {
      return document.querySelectorAll('.file-item').length;
    });
    
    // Trigger file upload
    const fileInput = await page.$('input[type="file"]');
    await fileInput?.uploadFile('./test-assets/test-file.pdf');
    
    // Wait for upload to complete (progress bar disappears)
    await page.waitForFunction(() => {
      return !document.querySelector('.upload-progress');
    }, { timeout: 10000 });
    
    // Check that file appears in the list
    await page.waitForFunction((count) => {
      return document.querySelectorAll('.file-item').length > count;
    }, {}, initialFileCount);
    
    // Verify file name is displayed
    const fileNameElement = await page.waitForSelector('.file-item:last-child .file-name');
    const fileName = await page.evaluate(el => el.textContent, fileNameElement);
    expect(fileName).toBe('test-file.pdf');
    
    // Verify file can be opened/previewed
    await page.click('.file-item:last-child .file-preview-button');
    await page.waitForSelector('.file-preview-container');
    
    // Verify preview contains expected elements
    const previewVisible = await page.evaluate(() => {
      return !!document.querySelector('.preview-content');
    });
    expect(previewVisible).toBe(true);
  });
});
```

### Performance Testing

Performance tests measure the system's responsiveness and stability under various load conditions.

#### Scope

- **API Endpoint Response Times**
- **File Upload/Download Speeds**
- **WebSocket Message Handling**
- **Database Query Performance**
- **Concurrent User Capacity**

#### Examples

```typescript
// Example performance test for file upload
describe('File Upload Performance', () => {
  const testFiles = [
    { name: 'small.txt', size: 100 * 1024 }, // 100 KB
    { name: 'medium.pdf', size: 10 * 1024 * 1024 }, // 10 MB
    { name: 'large.mp4', size: 100 * 1024 * 1024 } // 100 MB
  ];
  
  let testUser: TestUser;
  
  beforeAll(async () => {
    testUser = await createTestUser();
    await generateTestFiles(testFiles);
  });
  
  afterAll(async () => {
    await cleanupTestUser(testUser);
    await cleanupTestFiles(testFiles);
  });
  
  it('should upload small files quickly', async () => {
    const file = testFiles[0];
    const fileBuffer = await readTestFile(file.name);
    
    const startTime = Date.now();
    
    // Perform upload
    const { fileId } = await uploadFile(testUser.token, {
      fileName: file.name,
      roomId: testUser.roomId,
      fileBuffer
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Verify the file was uploaded successfully
    const uploadedFile = await getFile(testUser.token, fileId);
    expect(uploadedFile).toBeTruthy();
    
    // Assert performance requirements
    expect(duration).toBeLessThan(2000); // Less than 2 seconds for small file
  });
  
  it('should handle concurrent uploads efficiently', async () => {
    const concurrentUploads = 5;
    const file = testFiles[0];
    const fileBuffer = await readTestFile(file.name);
    
    const startTime = Date.now();
    
    // Start multiple concurrent uploads
    const uploadPromises = Array(concurrentUploads).fill(0).map(() => 
      uploadFile(testUser.token, {
        fileName: file.name,
        roomId: testUser.roomId,
        fileBuffer
      })
    );
    
    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Verify all files were uploaded
    for (const result of results) {
      expect(result.fileId).toBeTruthy();
    }
    
    // Assert performance for concurrent uploads
    // Total time should be less than 5x single upload time
    expect(duration).toBeLessThan(8000); // Less than 8 seconds for 5 concurrent small files
  });
});

// Example load test using k6
// This would be defined in a separate k6 script file
/*
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 }, // Ramp up to 50 users
    { duration: '2m', target: 50 }, // Stay at 50 users
    { duration: '1m', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    'http_req_duration{staticAsset:true}': ['p(95)<100'], // 95% of static asset requests must complete below 100ms
    'http_req_duration{endpoint:upload}': ['p(95)<1000'], // 95% of upload requests must complete below 1000ms
  },
};

export default function() {
  // Authentication
  const loginRes = http.post('https://api.example.com/auth/login', {
    email: 'loadtest@example.com',
    password: 'password123',
  });
  
  check(loginRes, {
    'logged in successfully': (resp) => resp.json('success') === true,
  });
  
  const authToken = loginRes.json('data.token');
  
  // Simulate user viewing rooms
  const roomsRes = http.get('https://api.example.com/api/rooms', {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  
  check(roomsRes, {
    'retrieved rooms': (resp) => resp.status === 200,
  });
  
  // Simulate file upload initiation
  const uploadRes = http.post('https://api.example.com/api/files/upload-url', 
    JSON.stringify({
      fileName: 'loadtest.txt',
      roomId: 'test-room-id',
      size: 1024,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      tags: {
        endpoint: 'upload',
      },
    }
  );
  
  check(uploadRes, {
    'upload URL generated': (resp) => resp.status === 200 && resp.json('data.signedUrls'),
  });
  
  sleep(1);
}
*/
```

### Security Testing

Security tests identify vulnerabilities and ensure the application meets security requirements.

#### Scope

- **Authentication and Authorization**
- **Data Encryption**
- **Input Validation and Sanitization**
- **File Upload Security**
- **API Security**
- **Session Management**
- **Dependency Vulnerabilities**

#### Examples

```typescript
// Example security test for authentication
describe('Authentication Security', () => {
  it('should require authentication for protected endpoints', async () => {
    const protectedEndpoints = [
      '/api/users/profile',
      '/api/companies',
      '/api/rooms',
      '/api/files',
    ];
    
    for (const endpoint of protectedEndpoints) {
      // Try accessing without authentication
      const response = await request(app).get(endpoint);
      
      // Verify authentication is required
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    }
  });
  
  it('should prevent authentication with invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      });
    
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
  
  it('should enforce password strength requirements', async () => {
    // Try with weak password
    const weakPasswordResponse = await request(app)
      .post('/api/users')
      .send({
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
        password: '12345',
        userType: 'b2c'
      });
    
    expect(weakPasswordResponse.status).toBe(400);
    expect(weakPasswordResponse.body.error.code).toBe('VALIDATION_ERROR');
    
    // Try with strong password
    const strongPasswordResponse = await request(app)
      .post('/api/users')
      .send({
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
        password: 'StrongP@ssw0rd123',
        userType: 'b2c'
      });
    
    expect(strongPasswordResponse.status).toBe(201);
    expect(strongPasswordResponse.body.success).toBe(true);
  });
});

// Example security test for file upload
describe('File Upload Security', () => {
  let authToken: string;
  
  beforeAll(async () => {
    // Get auth token for test user
    authToken = await getTestUserToken();
  });
  
  it('should prevent uploading malicious file types', async () => {
    const maliciousFiles = [
      { name: 'malicious.php', content: '<?php echo "hacked"; ?>' },
      { name: 'malicious.js', content: 'alert("XSS attack");' },
      { name: 'malicious.exe', content: Buffer.from([0x4D, 0x5A]) }, // EXE header
    ];
    
    for (const file of maliciousFiles) {
      const response = await request(app)
        .post('/api/files/upload-url')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName: file.name,
          roomId: 'test-room-id',
          size: Buffer.from(file.content).length
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  
  it('should prevent path traversal attacks', async () => {
    const traversalFileNames = [
      '../../../etc/passwd',
      '..\\..\\Windows\\System32\\config\\SAM',
      'normal_name/../../../etc/passwd',
    ];
    
    for (const fileName of traversalFileNames) {
      const response = await request(app)
        .post('/api/files/upload-url')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileName,
          roomId: 'test-room-id',
          size: 1024
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  
  it('should enforce file size limits', async () => {
    // Try to upload a file that exceeds the size limit
    const response = await request(app)
      .post('/api/files/upload-url')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fileName: 'toobig.jpg',
        roomId: 'test-room-id',
        size: 20 * 1024 * 1024 * 1024 // 20GB (assuming limit is lower)
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('size');
  });
});
```

## 3. Testing Tools and Framework

### Core Testing Stack

- **Jest**: Primary testing framework
- **SuperTest**: HTTP assertion library for API testing
- **Socket.io-Client**: WebSocket testing
- **Puppeteer/Playwright**: End-to-end testing with browser automation
- **k6**: Performance and load testing
- **OWASP ZAP**: Security testing

### Supporting Tools

- **Jest Mock Extensions**: Enhanced mocking capabilities
- **Testcontainers**: Containerized dependencies for integration tests
- **faker.js**: Test data generation
- **nyc (Istanbul)**: Code coverage reporting
- **ESLint Jest Plugin**: Lint test files

## 4. Test Data Management

### Test Data Strategies

1. **Isolated Test Databases**
   - Separate database for testing
   - Migrations run before test suite
   - Data cleaned between test runs

2. **Factory Pattern for Test Data**
   - Factories to create consistent test entities
   - Support for customization per test
   - Relationship management

3. **Containerized Dependencies**
   - Docker containers for MySQL, Redis
   - Consistent, isolated environment
   - Parallelizable tests

### Example Test Data Factory

```typescript
// User factory example
interface UserFactoryOptions {
  email?: string;
  firstName?: string;
  lastName?: string;
  userType?: 'b2c' | 'b2b';
  isActive?: boolean;
  companyId?: string;
}

class UserFactory {
  static async create(options: UserFactoryOptions = {}): Promise<User> {
    const defaultOptions: UserFactoryOptions = {
      email: faker.internet.email(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      userType: 'b2c',
      isActive: true
    };
    
    const userData = { ...defaultOptions, ...options };
    
    // Create user in database
    const user = await userRepository.create({
      ...userData,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    // If companyId provided, create company relationship
    if (userData.companyId) {
      await userCompanyRoleRepository.create({
        id: uuidv4(),
        userId: user.id,
        companyId: userData.companyId,
        role: 'member',
        joinedAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    return user;
  }
  
  static async createMany(count: number, options: UserFactoryOptions = {}): Promise<User[]> {
    const users = [];
    for (let i = 0; i < count; i++) {
      users.push(await this.create(options));
    }
    return users;
  }
}
```

## 5. Mocking and Stubbing

### Mocking Strategy

1. **External Dependencies**
   - Storage providers
   - Authentication services
   - Email services
   - Payment gateways

2. **Internal Services**
   - Service-to-service interactions in unit tests
   - Repository layer in service tests

3. **Browser APIs for Client Testing**
   - File system APIs
   - Crypto APIs
   - WebSocket connections

### Example Mock Implementations

```typescript
// Storage provider mock
const createStorageProviderMock = () => ({
  initialize: jest.fn().mockResolvedValue({ success: true }),
  testConnection: jest.fn().mockResolvedValue({ success: true }),
  getSignedUrl: jest.fn().mockResolvedValue({
    success: true,
    url: 'https://mock-signed-url.example.com'
  }),
  createFolder: jest.fn().mockResolvedValue({
    success: true,
    data: { key: 'mock-folder/', name: 'mock-folder' }
  }),
  listFiles: jest.fn().mockResolvedValue({
    success: true,
    files: [
      { key: 'mock-file.txt', name: 'mock-file.txt', size: 1024 }
    ]
  }),
  getFileMetadata: jest.fn().mockResolvedValue({
    success: true,
    metadata: { key: 'mock-file.txt', name: 'mock-file.txt', size: 1024 }
  }),
  deleteFile: jest.fn().mockResolvedValue({ success: true }),
  fileExists: jest.fn().mockResolvedValue({ success: true, exists: true }),
  createMultipartUpload: jest.fn().mockResolvedValue({
    success: true,
    data: { uploadId: 'mock-upload-id' }
  }),
  completeMultipartUpload: jest.fn().mockResolvedValue({ success: true }),
  getCapabilities: jest.fn().mockReturnValue({
    supportsMultipartUpload: true,
    supportsRangeRequests: true,
    supportsServerSideEncryption: true,
    maximumFileSize: 5 * 1024 * 1024 * 1024,
    maximumPartSize: 100 * 1024 * 1024
  })
});

// Redis client mock
const createRedisClientMock = () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockImplementation(async (key) => {
    // Simulate cache data for specific keys
    if (key.startsWith('user:')) {
      return JSON.stringify({
        id: 'mock-user-id',
        email: 'mock@example.com'
      });
    }
    return null;
  }),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(1),
  sendCommand: jest.fn().mockResolvedValue('OK')
});

// Auth0 API mock
const createAuth0ApiMock = () => ({
  getProfile: jest.fn().mockResolvedValue({
    sub: 'auth0|12345',
    email: 'auth0user@example.com',
    email_verified: true,
    name: 'Auth0 User',
    nickname: 'auth0user',
    picture: 'https://example.com/profile.jpg'
  }),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 'auth0|12345',
    aud: 'test-audience',
    iss: 'https://test-domain.auth0.com/'
  })
});
```

## 6. Continuous Integration

### CI Pipeline Integration

1. **Pre-commit Hooks**
   - Lint test files
   - Run affected unit tests

2. **Pull Request Checks**
   - Run all unit and integration tests
   - Generate and check code coverage
   - Security scanning of dependencies

3. **Scheduled Tests**
   - Full end-to-end test suite
   - Performance tests
   - Security scanning

### CI Configuration Example

```yaml
# Example GitHub Actions workflow
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Upload unit test coverage
        uses: actions/upload-artifact@v3
        with:
          name: unit-test-coverage
          path: coverage/
  
  integration-tests:
    runs-on: ubuntu-latest
    
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: test
          MYSQL_DATABASE: test_db
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping" --health-interval=10s --health-timeout=5s --health-retries=3
      
      redis:
        image: redis:6
        ports:
          - 6379:6379
        options: --health-cmd="redis-cli ping" --health-interval=10s --health-timeout=5s --health-retries=3
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run migrations
        run: npm run db:migrate
        env:
          MYSQL_HOST: localhost
          MYSQL_PORT: 3306
          MYSQL_USER: root
          MYSQL_PASSWORD: test
          MYSQL_DATABASE: test_db
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          MYSQL_HOST: localhost
          MYSQL_PORT: 3306
          MYSQL_USER: root
          MYSQL_PASSWORD: test
          MYSQL_DATABASE: test_db
          REDIS_HOST: localhost
          REDIS_PORT: 6379
      
      - name: Upload integration test coverage
        uses: actions/upload-artifact@v3
        with:
          name: integration-test-coverage
          path: coverage/
  
  e2e-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    if: github.event_name == 'pull_request'
    
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: test
          MYSQL_DATABASE: test_db
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping" --health-interval=10s --health-timeout=5s --health-retries=3
      
      redis:
        image: redis:6
        ports:
          - 6379:6379
        options: --health-cmd="redis-cli ping" --health-interval=10s --health-timeout=5s --health-retries=3
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build application
        run: npm run build
      
      - name: Start application
        run: npm run start:test &
        env:
          MYSQL_HOST: localhost
          MYSQL_PORT: 3306
          MYSQL_USER: root
          MYSQL_PASSWORD: test
          MYSQL_DATABASE: test_db
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          NODE_ENV: test
          PORT: 3001
      
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          APP_URL: http://localhost:3001
  
  security-scan:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run dependency vulnerability scan
        run: npm audit --production
      
      - name: Run SAST scan
        uses: github/codeql-action/analyze@v2
        with:
          languages: javascript
```

## 7. Code Coverage

### Coverage Goals

| Component | Minimum Coverage | Target Coverage |
|-----------|------------------|----------------|
| Services | 80% | 95% |
| Repositories | 70% | 90% |
| Controllers | 70% | 90% |
| Middleware | 80% | 95% |
| Utilities | 80% | 95% |
| Models | 60% | 80% |
| **Overall** | **75%** | **90%** |

### Coverage Reporting

```typescript
// Jest configuration for coverage reporting
module.exports = {
  // ... other Jest config
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!src/migrations/**',
    '!src/**/index.ts',
    '!src/tests/**'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 75,
      functions: 75,
      lines: 75
    },
    './src/services/': {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    },
    './src/middleware/': {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  }
};
```

## 8. Testing Schedule and Maintenance

### Testing Cadence

| Test Type | When to Run | Frequency |
|-----------|-------------|-----------|
| Unit Tests | Pre-commit, PR, CI | Every code change |
| Integration Tests | PR, CI | Every PR |
| End-to-End Tests | CI | Daily |
| Performance Tests | Scheduled | Weekly |
| Security Tests | Scheduled | Weekly |
| Load Tests | Manual | Monthly |

### Test Maintenance

1. **Ownership**
   - Service owners responsible for service tests
   - Test maintenance included in feature work
   - Dedicated test improvement sprints quarterly

2. **Test Review**
   - Test review part of code review
   - Minimum coverage enforcement
   - Quarterly test quality audit

3. **Test Refactoring**
   - Identify and reduce flaky tests
   - Optimize slow tests
   - Update tests for changing requirements

## 9. Test Documentation

### Test Documentation Strategy

1. **Self-documenting Tests**
   - Clear test descriptions
   - Arrange-Act-Assert pattern
   - Descriptive variable names

2. **Test Plan Documents**
   - Critical features test coverage
   - Security testing plan
   - Performance test scenarios

3. **Test Reports**
   - Automated test reports
   - Coverage reports
   - Security scan reports

### Example Test Documentation

```typescript
/**
 * Tests for the File Sharing feature.
 * 
 * Key test scenarios:
 * 1. Creating share links with various security options
 * 2. Accessing shared files with and without authentication
 * 3. Expired share link behavior
 * 4. Download limits enforcement
 * 5. Password protection
 */

describe('File Sharing', () => {
  /**
   * Tests share link creation with different security options.
   * 
   * Requirements:
   * - Users can create share links with expiration dates
   * - Users can create share links with download limits
   * - Users can create password-protected share links
   * - Users can create share links with view-only access
   */
  describe('Share Link Creation', () => {
    it('should create a basic share link', async () => {
      // Test implementation...
    });
    
    it('should create a share link with expiration date', async () => {
      // Test implementation...
    });
    
    // More tests...
  });
  
  /**
   * Tests share link access by recipients.
   * 
   * Requirements:
   * - Anonymous users can access public share links
   * - Password protection is enforced
   * - Expired links should not be accessible
   * - Download limits should be enforced
   */
  describe('Share Link Access', () => {
    it('should allow access to valid share links', async () => {
      // Test implementation...
    });
    
    it('should deny access to expired share links', async () => {
      // Test implementation...
    });
    
    // More tests...
  });
  
  // More test groups...
});
```

## 10. Testing Specific Features

### WebSocket Testing

```typescript
// Example WebSocket testing
describe('Room WebSocket Functionality', () => {
  let server: http.Server;
  let clientSocket: SocketIOClient.Socket;
  let anotherClientSocket: SocketIOClient.Socket;
  let testUser: TestUser;
  let anotherTestUser: TestUser;
  let testRoomId: string;
  
  beforeAll(async () => {
    // Setup test server
    server = await setupTestServer();
    
    // Create test users
    testUser = await createTestUser();
    anotherTestUser = await createTestUser();
    
    // Create test room
    testRoomId = await createTestRoom(testUser.id);
    
    // Add second user to room
    await addUserToRoom(testRoomId, anotherTestUser.id, 'viewer');
  });
  
  afterAll(async () => {
    // Cleanup
    await server.close();
    await cleanupTestRoom(testRoomId);
    await cleanupTestUser(testUser);
    await cleanupTestUser(anotherTestUser);
  });
  
  beforeEach(async () => {
    // Connect sockets
    clientSocket = io.connect(`http://localhost:${port}`, {
      query: { token: testUser.token },
      transports: ['websocket']
    });
    
    anotherClientSocket = io.connect(`http://localhost:${port}`, {
      query: { token: anotherTestUser.token },
      transports: ['websocket']
    });
    
    // Wait for connections
    await Promise.all([
      waitForSocketConnection(clientSocket),
      waitForSocketConnection(anotherClientSocket)
    ]);
  });
  
  afterEach(() => {
    // Disconnect sockets
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
    if (anotherClientSocket.connected) {
      anotherClientSocket.disconnect();
    }
  });
  
  it('should notify when a user joins a room', (done) => {
    // Setup listener for second user
    anotherClientSocket.on('user-joined', (data) => {
      try {
        expect(data.roomId).toBe(testRoomId);
        expect(data.userId).toBe(testUser.id);
        done();
      } catch (error) {
        done(error);
      }
    });
    
    // First user joins the room
    clientSocket.emit('join-room', { roomId: testRoomId, userId: testUser.id });
  });
  
  it('should broadcast file upload progress', (done) => {
    // Both users join the room
    clientSocket.emit('join-room', { roomId: testRoomId, userId: testUser.id });
    anotherClientSocket.emit('join-room', { roomId: testRoomId, userId: anotherTestUser.id });
    
    // Setup progress listener for second user
    anotherClientSocket.on('file-upload-progress', (data) => {
      try {
        expect(data.roomId).toBe(testRoomId);
        expect(data.userId).toBe(testUser.id);
        expect(data.fileName).toBe('test-file.txt');
        expect(data.percentage).toBe(50);
        done();
      } catch (error) {
        done(error);
      }
    });
    
    // Wait a bit for room joins to process
    setTimeout(() => {
      // First user reports upload progress
      clientSocket.emit('file-upload-progress', {
        fileId: 'test-file-id',
        uploadId: 'test-upload-id',
        fileName: 'test-file.txt',
        roomId: testRoomId,
        bytesUploaded: 500,
        totalBytes: 1000,
        percentage: 50
      });
    }, 100);
  });
  
  it('should handle room locking by owner', (done) => {
    // Both users join the room
    clientSocket.emit('join-room', { roomId: testRoomId, userId: testUser.id });
    anotherClientSocket.emit('join-room', { roomId: testRoomId, userId: anotherTestUser.id });
    
    // Setup lock notification listener for second user
    anotherClientSocket.on('room-locked', (data) => {
      try {
        expect(data.roomId).toBe(testRoomId);
        expect(data.lockedBy).toBe(testUser.id);
        done();
      } catch (error) {
        done(error);
      }
    });
    
    // Wait a bit for room joins to process
    setTimeout(() => {
      // First user (room owner) locks the room
      clientSocket.emit('lock-room', { roomId: testRoomId, userId: testUser.id });
    }, 100);
  });
});
```

### Large File Upload Testing

```typescript
// Example testing for large file upload
describe('Large File Upload', () => {
  let authToken: string;
  let roomId: string;
  
  beforeAll(async () => {
    // Setup test environment
    const testUser = await createTestUser();
    authToken = testUser.token;
    roomId = await createTestRoom(testUser.id);
  });
  
  it('should handle multipart upload for large files', async () => {
    // Generate test file content
    const fileSize = 15 * 1024 * 1024; // 15MB
    const fileContent = Buffer.alloc(fileSize, 'a');
    const fileName = 'large-test-file.dat';
    
    // Step 1: Initiate upload
    const initiateResponse = await request(app)
      .post('/api/files/upload-url')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fileName,
        roomId,
        size: fileSize
      });
    
    expect(initiateResponse.status).toBe(200);
    expect(initiateResponse.body.success).toBe(true);
    
    const { fileId, uploadId, signedUrls } = initiateResponse.body.data;
    expect(fileId).toBeTruthy();
    expect(uploadId).toBeTruthy();
    expect(signedUrls.length).toBeGreaterThan(0);
    
    // Step 2: Upload each part
    const uploadParts = [];
    for (let i = 0; i < signedUrls.length; i++) {
      const { partNumber, url } = signedUrls[i];
      const startByte = i * (fileSize / signedUrls.length);
      const endByte = (i + 1) * (fileSize / signedUrls.length);
      const partContent = fileContent.slice(startByte, endByte);
      
      // Upload the part
      const uploadResponse = await axios.put(url, partContent, {
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });
      
      expect(uploadResponse.status).toBe(200);
      
      // Collect ETags for completion
      uploadParts.push({
        PartNumber: partNumber,
        ETag: uploadResponse.headers.etag
      });
    }
    
    // Step 3: Complete multipart upload
    const completeResponse = await request(app)
      .post('/api/files/complete-upload')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fileId,
        uploadId,
        parts: uploadParts
      });
    
    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.success).toBe(true);
    
    // Step 4: Verify the file is accessible
    const fileResponse = await request(app)
      .get(`/api/files/${fileId}`)
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(fileResponse.status).toBe(200);
    expect(fileResponse.body.data.name).toBe(fileName);
    expect(fileResponse.body.data.size).toBe(fileSize);
    
    // Step 5: Get download URL and verify file content
    const downloadUrlResponse = await request(app)
      .get(`/api/files/${fileId}/download-url`)
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(downloadUrlResponse.status).toBe(200);
    expect(downloadUrlResponse.body.data.downloadUrl).toBeTruthy();
    
    // Verify download works (optional, may skip in CI)
    const downloadResponse = await axios.get(downloadUrlResponse.body.data.downloadUrl, {
      responseType: 'arraybuffer'
    });
    
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.data.length).toBe(fileSize);
  }, 30000); // Longer timeout for large file test
});
```

### Authentication Flow Testing

```typescript
// Example authentication flow testing
describe('Authentication Flow', () => {
  it('should authenticate with Auth0 and return valid user data', async () => {
    // Mock Auth0 response
    const mockAuth0Token = 'mock-auth0-token';
    const mockAuth0Profile = {
      sub: 'auth0|12345',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/profile.jpg'
    };
    
    // Configure Auth0 mock
    auth0ApiMock.getProfile.mockResolvedValue(mockAuth0Profile);
    
    // Test login endpoint
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        idToken: mockAuth0Token
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // Verify response contains expected user data
    const userData = response.body.data.user;
    expect(userData.email).toBe(mockAuth0Profile.email);
    expect(userData.firstName).toBe(mockAuth0Profile.given_name);
    expect(userData.lastName).toBe(mockAuth0Profile.family_name);
    
    // Verify auth token is issued
    expect(response.body.data.token).toBeTruthy();
    
    // Verify the token works for authenticated endpoints
    const profileResponse = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${response.body.data.token}`);
    
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.data.email).toBe(mockAuth0Profile.email);
  });
  
  it('should handle Auth0 token validation failure', async () => {
    // Configure Auth0 mock to simulate validation failure
    auth0ApiMock.getProfile.mockRejectedValue(new Error('Invalid token'));
    
    // Test login with invalid token
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        idToken: 'invalid-token'
      });
    
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
  
  it('should handle token expiration and refresh', async () => {
    // Set up initial authentication
    const initialAuthResponse = await authenticateTestUser();
    const initialToken = initialAuthResponse.body.data.token;
    
    // Fast-forward time to simulate token expiration
    jest.useFakeTimers();
    jest.advanceTimersByTime(2 * 60 * 60 * 1000); // 2 hours
    
    // Attempt to use expired token
    const expiredResponse = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${initialToken}`);
    
    expect(expiredResponse.status).toBe(401);
    expect(expiredResponse.body.error.code).toBe('TOKEN_EXPIRED');
    
    // Use refresh token to get new access token
    const refreshResponse = await request(app)
      .post('/api/auth/refresh')
      .send({
        refreshToken: initialAuthResponse.body.data.refreshToken
      });
    
    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.data.token).toBeTruthy();
    expect(refreshResponse.body.data.token).not.toBe(initialToken);
    
    // Verify new token works
    const newProfileResponse = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${refreshResponse.body.data.token}`);
    
    expect(newProfileResponse.status).toBe(200);
    
    // Restore timers
    jest.useRealTimers();
  });
});
```

## 11. Test-Driven Development Example

```typescript
// Example TDD workflow for a new feature
describe('File Versioning', () => {
  let fileService: FileService;
  let fileRepositoryMock: MockType<FileRepository>;
  let fileVersionRepositoryMock: MockType<FileVersionRepository>;
  let storageServiceMock: MockType<StorageService>;
  
  beforeEach(() => {
    // Setup mocks
    fileRepositoryMock = createMock<FileRepository>();
    fileVersionRepositoryMock = createMock<FileVersionRepository>();
    storageServiceMock = createMock<StorageService>();
    
    // Create service with mocked dependencies
    fileService = new FileServiceImpl(
      fileRepositoryMock,
      fileVersionRepositoryMock,
      storageServiceMock
    );
  });
  
  describe('getFileVersions', () => {
    it('should return all versions of a file', async () => {
      // Arrange
      const fileId = 'test-file-id';
      const mockFile = {
        id: fileId,
        name: 'test-file.docx',
        size: 1024
      };
      const mockVersions = [
        { id: 'v1', fileId, versionNumber: 1, createdAt: new Date(2023, 0, 1) },
        { id: 'v2', fileId, versionNumber: 2, createdAt: new Date(2023, 0, 2) }
      ];
      
      fileRepositoryMock.findById.mockResolvedValue(mockFile);
      fileVersionRepositoryMock.findByFileId.mockResolvedValue(mockVersions);
      
      // Act
      const versions = await fileService.getFileVersions(fileId);
      
      // Assert
      expect(versions).toHaveLength(2);
      expect(versions[0].versionNumber).toBe(1);
      expect(versions[1].versionNumber).toBe(2);
      expect(fileRepositoryMock.findById).toHaveBeenCalledWith(fileId);
      expect(fileVersionRepositoryMock.findByFileId).toHaveBeenCalledWith(fileId);
    });
    
    it('should throw NotFoundError for non-existent file', async () => {
      // Arrange
      const fileId = 'non-existent-file';
      fileRepositoryMock.findById.mockResolvedValue(null);
      
      // Act & Assert
      await expect(fileService.getFileVersions(fileId))
        .rejects
        .toThrow(NotFoundError);
    });
  });
  
  describe('createFileVersion', () => {
    it('should create a new version of a file', async () => {
      // Arrange
      const fileId = 'test-file-id';
      const userId = 'test-user-id';
      const mockFile = {
        id: fileId,
        name: 'test-file.docx',
        size: 1024,
        storageId: 'test-storage-id',
        storageKey: 'test/key.docx'
      };
      const mockStorageProvider = createStorageProviderMock();
      const fileBuffer = Buffer.from('test file content');
      const newVersionId = 'new-version-id';
      
      fileRepositoryMock.findById.mockResolvedValue(mockFile);
      fileVersionRepositoryMock.count.mockResolvedValue({ count: 2 });
      storageServiceMock.getStorageProvider.mockResolvedValue(mockStorageProvider);
      fileVersionRepositoryMock.create.mockImplementation(async (data) => ({
        ...data,
        id: newVersionId
      }));
      
      // Act
      const result = await fileService.createFileVersion(fileId, fileBuffer, userId);
      
      // Assert
      expect(result.id).toBe(newVersionId);
      expect(result.versionNumber).toBe(3); // 3rd version
      expect(fileRepositoryMock.findById).toHaveBeenCalledWith(fileId);
      expect(storageServiceMock.getStorageProvider).toHaveBeenCalledWith(mockFile.storageId);
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalled();
      expect(fileVersionRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId,
          versionNumber: 3,
          uploadedById: userId
        })
      );
    });
  });
  
  describe('restoreVersion', () => {
    it('should restore file to a previous version', async () => {
      // Arrange
      const fileId = 'test-file-id';
      const versionId = 'test-version-id';
      const userId = 'test-user-id';
      
      const mockFile = {
        id: fileId,
        name: 'test-file.docx',
        size: 1024,
        storageId: 'test-storage-id',
        storageKey: 'current/key.docx'
      };
      
      const mockVersion = {
        id: versionId,
        fileId,
        versionNumber: 2,
        size: 2048,
        storageKey: 'version/key.docx'
      };
      
      const mockStorageProvider = createStorageProviderMock();
      
      fileRepositoryMock.findById.mockResolvedValue(mockFile);
      fileVersionRepositoryMock.findById.mockResolvedValue(mockVersion);
      storageServiceMock.getStorageProvider.mockResolvedValue(mockStorageProvider);
      
      // Act
      const result = await fileService.restoreVersion(fileId, versionId, userId);
      
      // Assert
      expect(result.id).toBe(fileId);
      expect(fileRepositoryMock.update).toHaveBeenCalledWith(
        fileId,
        expect.objectContaining({
          size: mockVersion.size,
          storageKey: mockVersion.storageKey
        })
      );
      expect(fileVersionRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId,
          versionNumber: expect.any(Number),
          size: mockFile.size,
          storageKey: mockFile.storageKey,
          uploadedById: userId
        })
      );
    });
  });
});
```

## Summary

This testing strategy provides a comprehensive approach to ensure the file transfer application is thoroughly tested at all levels. By implementing a mix of unit, integration, and end-to-end tests, we can catch issues early in the development process and maintain a high level of quality. Performance and security testing will ensure the application meets its non-functional requirements, while continuous integration will maintain test coverage as the codebase evolves.

Key benefits of this testing strategy include:

1. **Multiple Testing Levels** to provide comprehensive coverage
2. **Automated Testing** integrated into the development workflow
3. **Clear Test Documentation** to communicate requirements and test coverage
4. **Performance and Security Testing** to ensure non-functional requirements
5. **Continuous Integration** to maintain quality throughout development

This approach will help deliver a robust and reliable file transfer application that meets both functional and non-functional requirements.