# Project Structure and Code Organization

## Overview

This document defines the project structure, file organization, naming conventions, and coding standards for the file transfer application. Following these guidelines ensures consistency, maintainability, and scalability as the codebase evolves.

## 1. Project Directory Structure

```
file-transfer-server/
├── .github/                    # GitHub Actions workflows
│   └── workflows/
├── .vscode/                    # VS Code configuration
├── docker/                     # Docker configuration
│   ├── api.Dockerfile
│   ├── websocket.Dockerfile
│   ├── worker.Dockerfile
│   └── docker-compose.yml
├── kubernetes/                 # Kubernetes manifests
│   ├── dev/
│   ├── staging/
│   └── production/
├── terraform/                  # Infrastructure as Code
├── src/                        # Application source code
│   ├── api/                    # API layer
│   │   ├── controllers/        # Route handlers
│   │   ├── middleware/         # Express middleware
│   │   ├── routes/             # Route definitions
│   │   ├── validators/         # Request validation
│   │   └── index.ts            # API module entry point
│   ├── config/                 # Configuration
│   │   ├── env.ts              # Environment variables
│   │   ├── auth.ts             # Auth configuration
│   │   ├── storage.ts          # Storage configuration
│   │   └── index.ts            # Configuration entry point
│   ├── db/                     # Database layer
│   │   ├── migrations/         # Database migrations
│   │   ├── schema/             # Drizzle schema definitions
│   │   ├── client.ts           # Database client
│   │   └── index.ts            # Database module entry point
│   ├── services/               # Business logic layer
│   │   ├── auth/               # Authentication services
│   │   ├── storage/            # Storage services
│   │   ├── file/               # File management services
│   │   ├── user/               # User management services
│   │   ├── company/            # Company management services
│   │   ├── room/               # Room management services
│   │   ├── job/                # Background job services
│   │   └── index.ts            # Services entry point
│   ├── repositories/           # Data access layer
│   │   ├── base.repository.ts  # Base repository
│   │   ├── user.repository.ts  # User repository
│   │   └── index.ts            # Repositories entry point
│   ├── socket/                 # WebSocket layer
│   │   ├── handlers/           # Socket event handlers
│   │   ├── middleware/         # Socket middleware
│   │   ├── events.ts           # Event definitions
│   │   └── index.ts            # Socket module entry point
│   ├── utils/                  # Utility functions
│   │   ├── encryption.ts       # Encryption utilities
│   │   ├── logger.ts           # Logging utilities
│   │   ├── redis.ts            # Redis client utilities
│   │   └── errors.ts           # Error handling utilities
│   ├── types/                  # TypeScript type definitions
│   │   ├── models.d.ts         # Model type definitions
│   │   ├── api.d.ts            # API type definitions
│   │   └── index.ts            # Type exports
│   ├── workers/                # Background workers
│   │   ├── file-processor.ts   # File processing worker
│   │   ├── notification.ts     # Notification worker
│   │   └── index.ts            # Worker entry point
│   ├── app.ts                  # Express application setup
│   └── server.ts               # Server entry point
├── tests/                      # Test files
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests 
│   ├── e2e/                    # End-to-end tests
│   ├── fixtures/               # Test fixtures
│   ├── helpers/                # Test helpers
│   └── setup.ts                # Test setup
├── scripts/                    # Build and utility scripts
├── logs/                       # Application logs (gitignored)
├── dist/                       # Compiled JavaScript (gitignored)
├── node_modules/               # Dependencies (gitignored)
├── .env                        # Environment variables (gitignored)
├── .env.example                # Example environment variables
├── .gitignore                  # Git ignore rules
├── .eslintrc.js                # ESLint configuration
├── .prettierrc                 # Prettier configuration
├── jest.config.js              # Jest configuration
├── tsconfig.json               # TypeScript configuration
├── package.json                # Project metadata and dependencies
└── README.md                   # Project documentation
```

## 2. Component Organization

### API Layer

The API layer handles HTTP requests and responses.

```
api/
├── controllers/                # Request handlers
│   ├── auth.controller.ts
│   ├── file.controller.ts
│   ├── storage.controller.ts
│   ├── user.controller.ts
│   └── index.ts
├── middleware/                 # Express middleware
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   ├── validation.middleware.ts
│   └── index.ts
├── routes/                     # Route definitions
│   ├── auth.routes.ts
│   ├── file.routes.ts
│   ├── storage.routes.ts
│   ├── user.routes.ts
│   └── index.ts
├── validators/                 # Request validation schemas
│   ├── auth.validator.ts
│   ├── file.validator.ts
│   └── index.ts
└── index.ts                    # API module entry point
```

### Service Layer

The service layer contains business logic.

```
services/
├── auth/                       # Authentication services
│   ├── auth.service.ts
│   ├── auth0.service.ts
│   └── index.ts
├── storage/                    # Storage services
│   ├── storage.service.ts
│   ├── providers/              # Storage provider implementations
│   │   ├── base.provider.ts
│   │   ├── wasabi.provider.ts
│   │   ├── s3.provider.ts
│   │   ├── dropbox.provider.ts
│   │   └── gdrive.provider.ts
│   └── index.ts
├── file/                       # File management services
│   ├── file.service.ts
│   ├── version.service.ts
│   ├── share.service.ts
│   └── index.ts
└── index.ts                    # Services entry point
```

### Database Layer

The database layer handles data persistence.

```
db/
├── migrations/                 # Database migrations
│   ├── 0000_initial.ts
│   ├── 0001_add_file_versions.ts
│   └── migration.ts
├── schema/                     # Drizzle schema definitions
│   ├── users.ts
│   ├── files.ts
│   ├── storage.ts
│   ├── rooms.ts
│   ├── companies.ts
│   ├── access.ts
│   └── index.ts
├── client.ts                   # Database client
└── index.ts                    # Database module entry point
```

### WebSocket Layer

The WebSocket layer handles real-time communication.

```
socket/
├── handlers/                   # Socket event handlers
│   ├── room.handler.ts
│   ├── file.handler.ts
│   └── index.ts
├── middleware/                 # Socket middleware
│   ├── auth.middleware.ts
│   └── index.ts
├── events.ts                   # Event definitions
└── index.ts                    # Socket module entry point
```

## 3. File Naming Conventions

### General Conventions

- Use **kebab-case** for directory names
- Use **camelCase** for file names
- Use **PascalCase** for class names and interfaces
- Use **camelCase** for variables and functions
- Use **UPPER_SNAKE_CASE** for constants

### Specific File Patterns

- **Controllers**: `{resource}.controller.ts`
- **Services**: `{resource}.service.ts`
- **Repositories**: `{resource}.repository.ts`
- **Routes**: `{resource}.routes.ts`
- **Middleware**: `{name}.middleware.ts`
- **Model schemas**: `{model}.ts`
- **Types/Interfaces**: `{name}.d.ts` or `{name}.types.ts`
- **Utils**: `{name}.ts`
- **Tests**: `{fileBeingTested}.test.ts` or `{fileBeingTested}.spec.ts`

## 4. Module Patterns

### Import/Export Patterns

**Preferred Import Style:**

```typescript
// Named imports
import { UserService } from '../services/user/user.service';

// Default imports
import config from '../config';

// Type imports
import type { User } from '../types';

// Side effect imports (use sparingly)
import '../utils/extensions';
```

**Preferred Export Style:**

```typescript
// Named exports for multiple items
export const validateEmail = (email: string): boolean => {
  // ...
};

export function hashPassword(password: string): string {
  // ...
}

// Default exports for main module functionality
export default class UserService {
  // ...
}

// Barrel pattern in index.ts files
export * from './user.service';
export * from './auth.service';
export * from './file.service';
```

### Module Organization

Each module should:

1. Export a clear public API
2. Minimize side effects
3. Maintain clear dependency boundaries
4. Follow the dependency injection pattern where appropriate

**Example Service Module:**

```typescript
// fileService.ts

import { inject, injectable } from 'inversify';
import { FileRepository } from '../repositories/file.repository';
import { StorageService } from './storage/storage.service';
import { Logger } from '../utils/logger';
import type { File, CreateFileDTO, UpdateFileDTO } from '../types';

@injectable()
export class FileService {
  constructor(
    @inject(FileRepository) private fileRepository: FileRepository,
    @inject(StorageService) private storageService: StorageService,
    @inject(Logger) private logger: Logger
  ) {}

  async getFile(id: string): Promise<File> {
    this.logger.debug('Getting file', { id });
    return this.fileRepository.findById(id);
  }

  // More methods...
}
```

## 5. Dependency Injection

We use the Inversify.js library for dependency injection. This allows for:

- Better testability
- Clearer dependency management
- Easier service mocking

**Container Setup:**

```typescript
// src/config/container.ts
import { Container } from 'inversify';
import { UserService } from '../services/user/user.service';
import { UserRepository } from '../repositories/user.repository';
import { StorageService } from '../services/storage/storage.service';
// ... more imports

const container = new Container();

// Repositories
container.bind(UserRepository).toSelf();
container.bind(FileRepository).toSelf();

// Services
container.bind(UserService).toSelf();
container.bind(StorageService).toSelf();
container.bind(FileService).toSelf();

// Utilities
container.bind(Logger).toSelf();

export { container };
```

**Usage in API Controllers:**

```typescript
// src/api/controllers/file.controller.ts
import { inject } from 'inversify';
import { controller, httpGet, httpPost } from 'inversify-express-utils';
import { FileService } from '../../services/file/file.service';
import { AuthMiddleware } from '../middleware/auth.middleware';

@controller('/files', AuthMiddleware)
export class FileController {
  constructor(
    @inject(FileService) private fileService: FileService
  ) {}

  @httpGet('/:id')
  async getFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = await this.fileService.getFile(req.params.id);
      res.json({ success: true, data: file });
    } catch (error) {
      next(error);
    }
  }

  // More endpoints...
}
```

## 6. Code Style Guide

### TypeScript Guidelines

- Prefer interfaces over type aliases for object types
- Use explicit typing and avoid `any`
- Enable strict mode in TypeScript configuration
- Use readonly properties where applicable
- Use enums for values with predefined options
- Use generics for reusable components

```typescript
// Good
interface User {
  readonly id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: Date;
}

enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

// Bad
type User = {
  id: any;
  email: any;
  firstName: any;
  lastName: any;
  role: string;
  createdAt: any;
};
```

### Asynchronous Code

- Use `async/await` over promises with `.then()`
- Properly handle async errors with try/catch
- Use Promise.all for parallel operations

```typescript
// Good
async function getFileWithMetadata(id: string): Promise<FileWithMetadata> {
  try {
    const [file, metadata] = await Promise.all([
      fileRepository.findById(id),
      metadataService.getMetadata(id)
    ]);
    
    return { ...file, metadata };
  } catch (error) {
    logger.error('Failed to get file with metadata', { id, error });
    throw new AppError('Failed to get file data', 500);
  }
}

// Bad
function getFileWithMetadata(id: string): Promise<FileWithMetadata> {
  return fileRepository.findById(id)
    .then(file => {
      return metadataService.getMetadata(id)
        .then(metadata => {
          return { ...file, metadata };
        });
    }).catch(error => {
      logger.error('Failed to get file with metadata', { id, error });
      throw new AppError('Failed to get file data', 500);
    });
}
```

### Error Handling

- Use custom error classes
- Include meaningful error messages
- Add proper error codes
- Log errors with context

```typescript
// Custom error classes
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found with id: ${id}`, 404, 'NOT_FOUND');
  }
}

// Usage
try {
  const file = await fileRepository.findById(id);
  if (!file) {
    throw new NotFoundError('File', id);
  }
  return file;
} catch (error) {
  logger.error('Error retrieving file', { id, error });
  
  if (error instanceof AppError) {
    throw error; // Rethrow application errors
  }
  
  // Convert other errors to application errors
  throw new AppError('An error occurred', 500);
}
```

### Comments and Documentation

- Use JSDoc for public APIs
- Document complex logic
- Avoid obvious comments

```typescript
/**
 * Generates a signed URL for file upload
 * 
 * @param fileId - The unique identifier for the file
 * @param options - Upload options
 * @param options.contentType - The MIME type of the file
 * @param options.expiresIn - Time in seconds until URL expires (default: 900)
 * @returns The signed URL and expiration time
 * @throws {NotFoundError} If the file does not exist
 * @throws {AuthorizationError} If the user is not authorized
 */
async function getUploadUrl(
  fileId: string, 
  options: UploadUrlOptions
): Promise<SignedUrlResult> {
  // Implementation...
}
```

### Function Design

- Use small, focused functions
- Follow Single Responsibility Principle
- Limit function arguments (prefer objects for multiple parameters)
- Use descriptive function names

```typescript
// Good
async function getUserWithCompanies(userId: string): Promise<UserWithCompanies> {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User', userId);
  }
  
  const companies = await companyRepository.findByUserId(userId);
  return { ...user, companies };
}

// Bad
async function getUser(id: string, includeCompanies: boolean, includeRoles: boolean): Promise<any> {
  // Implementation with many conditionals...
}
```

## 7. API Design Patterns

### RESTful Endpoints

Follow these RESTful patterns:

| HTTP Method | Path | Description |
|-------------|------|-------------|
| GET | /resources | List resources |
| GET | /resources/:id | Get a specific resource |
| POST | /resources | Create a new resource |
| PATCH | /resources/:id | Update a resource |
| DELETE | /resources/:id | Delete a resource |

### Controller Structure

Each controller should:

1. Handle input validation
2. Delegate business logic to services
3. Format responses
4. Handle errors

```typescript
// src/api/controllers/file.controller.ts
export class FileController {
  constructor(
    private fileService: FileService,
    private validationService: ValidationService,
    private logger: Logger
  ) {}

  async uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 1. Validate input
      const validationResult = this.validationService.validate(
        req.body,
        fileUploadSchema
      );
      
      if (!validationResult.valid) {
        throw new ValidationError('Invalid request data', validationResult.errors);
      }
      
      // 2. Delegate to service
      const result = await this.fileService.initiateUpload({
        fileName: req.body.fileName,
        size: req.body.size,
        roomId: req.body.roomId,
        userId: req.user.id,
      });
      
      // 3. Format response
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      // 4. Handle errors
      this.logger.error('Upload file error', {
        userId: req.user?.id,
        error: error.message
      });
      
      next(error);
    }
  }
}
```

### Response Format

Use consistent response formats:

```typescript
// Success response
{
  "success": true,
  "data": {
    // Resource data
  },
  "meta": {
    // Metadata (pagination, etc.)
  }
}

// Error response
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Additional error details
    }
  }
}
```

## 8. Repository Pattern Implementation

Repositories abstract the data access layer:

```typescript
// src/repositories/base.repository.ts
export abstract class BaseRepository<T, ID> {
  abstract findById(id: ID): Promise<T | null>;
  abstract findAll(filter?: any): Promise<T[]>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: ID, data: Partial<T>): Promise<T>;
  abstract delete(id: ID): Promise<boolean>;
  abstract exists(id: ID): Promise<boolean>;
}

// src/repositories/user.repository.ts
@injectable()
export class UserRepository extends BaseRepository<User, string> {
  constructor(
    @inject('Database') private db: DatabaseConnection
  ) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    return this.db.query.users.findFirst({
      where: eq(users.id, id)
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.db.query.users.findFirst({
      where: eq(users.email, email)
    });
  }

  async create(data: Partial<User>): Promise<User> {
    const id = data.id || uuidv4();
    const now = new Date();
    
    const newUser = {
      id,
      email: data.email!,
      firstName: data.firstName!,
      lastName: data.lastName!,
      profilePicture: data.profilePicture,
      auth0Id: data.auth0Id,
      userType: data.userType || 'b2c',
      isActive: data.isActive ?? true,
      isVerified: data.isVerified ?? false,
      createdAt: now,
      updatedAt: now
    };
    
    await this.db.insert(users).values(newUser);
    return newUser;
  }

  // Other methods...
}
```

## 9. Testing Structure

Maintain consistent test file organization:

```
tests/
├── unit/                       # Unit tests
│   ├── services/               # Mirror src structure
│   │   ├── file.service.test.ts
│   │   └── user.service.test.ts
│   ├── repositories/
│   └── utils/
├── integration/                # Integration tests
│   ├── api/
│   ├── db/
│   └── socket/
├── e2e/                        # End-to-end tests
│   ├── file-upload.spec.ts
│   └── user-management.spec.ts
├── fixtures/                   # Test fixtures
│   ├── users.fixture.ts
│   └── files.fixture.ts
├── helpers/                    # Test helpers
│   ├── testDb.ts
│   ├── testServer.ts
│   └── authHelper.ts
└── setup.ts                    # Test setup
```

Test file structure should follow:

```typescript
// services/file.service.test.ts

import { FileService } from '../../src/services/file/file.service';
import { createMock } from '@golevelup/ts-jest';
import { FileRepository } from '../../src/repositories/file.repository';
import { StorageService } from '../../src/services/storage/storage.service';
import { NotFoundError } from '../../src/utils/errors';

describe('FileService', () => {
  let fileService: FileService;
  let fileRepositoryMock: jest.Mocked<FileRepository>;
  let storageServiceMock: jest.Mocked<StorageService>;
  
  beforeEach(() => {
    // Setup mocks
    fileRepositoryMock = createMock<FileRepository>();
    storageServiceMock = createMock<StorageService>();
    
    // Create service with mocked dependencies
    fileService = new FileService(
      fileRepositoryMock,
      storageServiceMock
    );
  });
  
  describe('getFile', () => {
    it('should return file when it exists', async () => {
      // Arrange
      const mockFile = { 
        id: 'test-id', 
        name: 'test-file.txt'
      };
      fileRepositoryMock.findById.mockResolvedValue(mockFile);
      
      // Act
      const result = await fileService.getFile('test-id');
      
      // Assert
      expect(result).toEqual(mockFile);
      expect(fileRepositoryMock.findById).toHaveBeenCalledWith('test-id');
    });
    
    it('should throw NotFoundError when file does not exist', async () => {
      // Arrange
      fileRepositoryMock.findById.mockResolvedValue(null);
      
      // Act & Assert
      await expect(fileService.getFile('non-existent'))
        .rejects
        .toThrow(NotFoundError);
    });
  });
  
  // More tests...
});
```

## 10. Environment Configuration

Maintain clear environment configuration:

**.env.example**
```
# Server
NODE_ENV=development
PORT=3000
HOST=localhost

# Database
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=dbuser
MYSQL_PASSWORD=
MYSQL_DATABASE=filetransfer

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_PREFIX=filetransfer:

# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://your-api-identifier
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=

# Storage
DEFAULT_STORAGE_TYPE=wasabi
WASABI_ENDPOINT=s3.wasabisys.com
WASABI_REGION=us-east-1
WASABI_ACCESS_KEY=
WASABI_SECRET_KEY=
WASABI_BUCKET=
```

**src/config/env.ts**
```typescript
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Define environment interface
interface EnvironmentVariables {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  HOST: string;
  
  // Database
  MYSQL_HOST: string;
  MYSQL_PORT: number;
  MYSQL_USER: string;
  MYSQL_PASSWORD: string;
  MYSQL_DATABASE: string;
  
  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_PREFIX: string;
  
  // Auth0
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_CLIENT_SECRET?: string;
  
  // Storage
  DEFAULT_STORAGE_TYPE: 'wasabi' | 's3' | 'dropbox' | 'gdrive';
  WASABI_ENDPOINT?: string;
  WASABI_REGION?: string;
  WASABI_ACCESS_KEY?: string;
  WASABI_SECRET_KEY?: string;
  WASABI_BUCKET?: string;
}

// Parse environment variables with validation and defaults
export const env: EnvironmentVariables = {
  NODE_ENV: (process.env.NODE_ENV as EnvironmentVariables['NODE_ENV']) || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || 'localhost',
  
  // Database
  MYSQL_HOST: process.env.MYSQL_HOST || 'localhost',
  MYSQL_PORT: parseInt(process.env.MYSQL_PORT || '3306', 10),
  MYSQL_USER: process.env.MYSQL_USER || 'root',
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || '',
  MYSQL_DATABASE: process.env.MYSQL_DATABASE || 'filetransfer',
  
  // Redis
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_PREFIX: process.env.REDIS_PREFIX || 'filetransfer:',
  
  // Auth0
  AUTH0_DOMAIN: process.env.AUTH0_DOMAIN || '',
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || '',
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,
  
  // Storage
  DEFAULT_STORAGE_TYPE: (process.env.DEFAULT_STORAGE_TYPE as EnvironmentVariables['DEFAULT_STORAGE_TYPE']) || 'wasabi',
  WASABI_ENDPOINT: process.env.WASABI_ENDPOINT,
  WASABI_REGION: process.env.WASABI_REGION,
  WASABI_ACCESS_KEY: process.env.WASABI_ACCESS_KEY,
  WASABI_SECRET_KEY: process.env.WASABI_SECRET_KEY,
  WASABI_BUCKET: process.env.WASABI_BUCKET,
};

// Validate required environment variables
const requiredEnvVars: Array<keyof EnvironmentVariables> = [
  'MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE',
  'REDIS_HOST', 'AUTH0_DOMAIN', 'AUTH0_AUDIENCE'
];

requiredEnvVars.forEach(varName => {
  if (!env[varName]) {
    console.warn(`Missing required environment variable: ${varName}`);
  }
});
```

## 11. Documentation Standards

### Code Documentation

- Use JSDoc for public APIs
- Document function parameters and return values
- Document exceptions that may be thrown
- Include examples for complex functions

### API Documentation

- Use OpenAPI/Swagger for API documentation
- Include example requests and responses
- Document authentication requirements
- Document error responses

### README Files

Each significant directory should have a README.md explaining:

- The purpose of the module
- How to use the module
- Dependencies and relationships
- Examples

**Example README.md for services/storage:**

```markdown
# Storage Services

This module provides an abstraction layer for different storage providers like S3, Wasabi, Google Drive, and Dropbox.

## Architecture

- `storage.service.ts`: Main service for storage operations
- `providers/`: Individual provider implementations
  - `base.provider.ts`: Abstract base class for all providers
  - `s3.provider.ts`: AWS S3 provider implementation
  - `wasabi.provider.ts`: Wasabi provider implementation
  - `gdrive.provider.ts`: Google Drive provider implementation
  - `dropbox.provider.ts`: Dropbox provider implementation

## Usage

```typescript
// Get an instance of the storage service
const storageService = container.get(StorageService);

// Get a provider for a specific storage account
const provider = await storageService.getStorageProvider('storage-account-id');

// Generate a signed upload URL
const { url } = await provider.getSignedUrl('path/to/file.pdf', {
  operation: 'write',
  expiresIn: 900,
  contentType: 'application/pdf'
});
```

## Provider Capabilities

Each provider has different capabilities:

| Provider | Multipart Upload | Server-side Encryption | Versioning |
|----------|------------------|------------------------|------------|
| S3       | ✅               | ✅                    | ✅         |
| Wasabi   | ✅               | ✅                    | ✅         |
| GDrive   | ❌               | ❌                    | ✅         |
| Dropbox  | ❌               | ❌                    | ✅         |

## Adding a New Provider

To add a new storage provider:

1. Create a new provider class that extends BaseStorageProvider
2. Implement all required methods
3. Register the provider in the StorageProviderFactory
```

## 12. Package Dependencies Management

### Dependency Categories

Organize dependencies in package.json:

- **Main dependencies**: Core libraries needed for the application to run
- **Development dependencies**: Tools needed for development and building
- **Peer dependencies**: Libraries that should be provided by the consumer

### Version Pinning

- Pin exact versions for production dependencies (`"express": "4.18.2"`)
- Use tilde ranges for dev dependencies (`"eslint": "~8.42.0"`)

### Example package.json

```json
{
  "name": "file-transfer-server",
  "version": "1.0.0",
  "description": "Secure file transfer service",
  "main": "dist/server.js",
  "scripts": {
    "start": "node dist/server.js",
    "dev": "nodemon --exec ts-node src/server.ts",
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write \"src/**/*.ts\"",
    "db:generate": "drizzle-kit generate:mysql",
    "db:migrate": "ts-node src/db/migrations/migration.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "3.382.0",
    "@aws-sdk/s3-request-presigner": "3.382.0",
    "cors": "2.8.5",
    "dotenv": "16.3.1",
    "drizzle-orm": "0.27.2",
    "express": "4.18.2",
    "express-validator": "7.0.1",
    "helmet": "7.0.0",
    "inversify": "6.0.1",
    "inversify-express-utils": "6.4.3",
    "jsonwebtoken": "9.0.1",
    "mysql2": "3.5.1",
    "redis": "4.6.7",
    "reflect-metadata": "0.1.13",
    "socket.io": "4.7.1",
    "uuid": "9.0.0",
    "winston": "3.10.0"
  },
  "devDependencies": {
    "@golevelup/ts-jest": "~0.3.7",
    "@types/cors": "~2.8.13",
    "@types/express": "~4.17.17",
    "@types/jest": "~29.5.2",
    "@types/node": "~20.4.0",
    "@types/uuid": "~9.0.2",
    "@typescript-eslint/eslint-plugin": "~5.61.0",
    "@typescript-eslint/parser": "~5.61.0",
    "drizzle-kit": "~0.19.12",
    "eslint": "~8.44.0",
    "eslint-config-prettier": "~8.8.0",
    "eslint-plugin-prettier": "~5.0.0",
    "jest": "~29.6.0",
    "nodemon": "~3.0.1",
    "prettier": "~3.0.0",
    "ts-jest": "~29.1.1",
    "ts-node": "~10.9.1",
    "typescript": "~5.1.6"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

## 13. Git Workflow and Commit Standards

### Branching Strategy

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/name`: Feature branches
- `bugfix/name`: Bug fix branches
- `release/version`: Release preparation branches

### Commit Message Format

Follow conventional commits:

```
type(scope): subject

body

footer
```

**Types:**
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `test`: Adding or modifying tests
- `chore`: Changes to the build process, tools, etc.

**Example:**
```
feat(storage): add Google Drive provider implementation

- Add OAuth2 authentication flow
- Implement file upload/download methods
- Add configuration for Google Drive API

Closes #123
```

### Pull Request Template

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Description

[Describe the changes made in this PR]

## Related Issues

[Link to related issues, e.g., "Fixes #123"]

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Code refactoring
- [ ] Performance improvement
- [ ] Tests

## Checklist

- [ ] My code follows the project's code style
- [ ] I have updated the documentation
- [ ] I have added tests to cover my changes
- [ ] All tests pass locally
- [ ] I have updated the changelog (if applicable)

## Screenshots (if applicable)

[Add screenshots here]
```

## Summary

This project structure and code organization guide provides a comprehensive framework for developing a maintainable, scalable, and testable file transfer application using Express and TypeScript. Following these guidelines ensures consistency across the codebase and simplifies onboarding for new developers.

Key benefits include:

1. **Clear Separation of Concerns**: Each layer has a well-defined responsibility
2. **Consistent Naming Conventions**: Makes the codebase more navigable
3. **Dependency Injection**: Improves testability and maintainability
4. **Repository Pattern**: Abstracts the data access layer
5. **Comprehensive Documentation**: Makes the codebase more approachable
6. **Standardized Testing**: Ensures code quality
7. **Modern TypeScript Practices**: Leverages type safety and modern features

By following these guidelines, the development team can focus on implementing business logic rather than making structural decisions, leading to faster development and fewer bugs.