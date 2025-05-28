// src/config/container.ts
import 'reflect-metadata';
import { Container } from 'inversify';
import { Logger } from '../utils/logger';
import { redisClient, createRedisClient } from '../utils/redis';
import { UserRepository } from '../repositories/user.repository';
import { MySQLUserRepository } from '../repositories/implementations/user.repository';
import { AuthService } from '../services/auth/auth.service';
import { AuthServiceImpl } from '../services/auth/auth.service.impl';
import { Auth0Service } from '../services/auth/auth0.service';
import { JwtService } from '../services/auth/jwt.service';
import { OAuthService } from '../services/auth/oauth.service';
import { AuthController } from '../api/controllers/auth.controller';
import { AuthMiddleware } from '../api/middleware/auth.middleware';
import { AdminMiddleware } from '../api/middleware/admin.middleware';
import { StorageController } from '../api/controllers/storage.controller';
import { StorageAccountRepository } from '../repositories/storage-account.repository';
import { StorageAccountRepositoryImpl } from '../repositories/storage-account.repository.impl';
import { FileRepository } from '../repositories/file.repository';
import { FileService } from '../services/file/file.service';
import { UploadService } from '../services/file/upload.service';
import { FileController } from '../api/controllers/file.controller';
import { createConnection } from '../db/connection';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { setupStorageModule } from '../services/storage/setup';
import { EventEmitter } from 'events';
import { DrizzleClient } from '../db/drizzle.client';
import { RoomService } from '../services/room/room.service';
import { SharingService } from '../services/sharing/sharing.service';
import { ActivityService } from '../services/activity/activity.service';
import { RoomController } from '../api/controllers/room.controller';
import { SharingController } from '../api/controllers/sharing.controller';
import { ActivityController } from '../api/controllers/activity.controller';

// Import storage setup function
import { StorageProviderFactory } from '../services/storage/types';
import { WasabiStorageProvider } from '../services/storage/providers/wasabi-provider';
import { StorjStorageProvider } from '../services/storage/providers/storj-provider';
import { AwsS3StorageProvider } from '../services/storage/providers/aws-s3-provider';
import { GoogleDriveStorageProvider } from '../services/storage/providers/google-drive-provider';
import { DropboxStorageProvider } from '../services/storage/providers/dropbox-provider';
import { AzureBlobStorageProvider } from '../services/storage/providers/azure-blob-provider';
import { GcpStorageProvider } from '../services/storage/providers/gcp-storage-provider';
import { WebSocketService } from '../services/websocket/websocket.service';
import { UserController } from '../api/controllers/user.controller';
import { UserService } from '../services/user/user.service';

// Company bindings
import { CompanyController } from '../api/controllers/company.controller';
import { CompanyService } from '../services/company/company.service';
import { CompanyRepository } from '../repositories/company.repository';

// Routes
import { Routes } from '../api/routes';
import { AuthRoutes } from '../api/routes/auth.routes';
import { UserRoutes } from '../api/routes/user.routes';
import { FileRoutes } from '../api/routes/file.routes';
import { CompanyRoutes } from '../api/routes/company.routes';
import { StorageRoutes } from '../api/routes/storage.routes';
import { RoomRoutes } from '../api/routes/room.routes';
import { SharingRoutes } from '../api/routes/sharing.routes';
import { ActivityRoutes } from '../api/routes/activity.routes';
import { OAuthController } from '../api/controllers/oauth.controller';
import { OAuthRoutes } from '../api/routes/oauth.routes';

// Add binding for RoomRepository
import { RoomRepository } from '../repositories/room.repository';

// Create container
const container = new Container({
  defaultScope: 'Singleton'
});

// Increase max listeners for the process
process.setMaxListeners(20);

// Utils (must be registered first as other services depend on them)
container.bind<Logger>('Logger').to(Logger).inSingletonScope();

// Create and initialize DrizzleClient
const drizzleClient = new DrizzleClient(container.get<Logger>('Logger'));

// Database - register both DrizzleClient and MySql2Database
container.bind<DrizzleClient>('DrizzleClient').toConstantValue(drizzleClient);

// Repositories
container.bind<UserRepository>('UserRepository').to(UserRepository).inSingletonScope();
container.bind<StorageAccountRepository>('StorageAccountRepository').to(StorageAccountRepositoryImpl).inSingletonScope();

// Create FileRepository instance and bind it as a constant value
const fileRepository = new FileRepository(container.get<Logger>('Logger'), {
  getInstance: async () => drizzleClient
});
container.bind<FileRepository>('FileRepository').toConstantValue(fileRepository);

// Add binding for RoomRepository
container.bind<RoomRepository>('RoomRepository').to(RoomRepository).inSingletonScope();

// Services
container.bind<JwtService>('JwtService').to(JwtService).inSingletonScope();
container.bind<Auth0Service>('Auth0Service').to(Auth0Service).inSingletonScope();
container.bind<AuthService>('AuthService').to(AuthServiceImpl).inSingletonScope();
container.bind<OAuthService>('OAuthService').to(OAuthService).inSingletonScope();
container.bind<FileService>('FileService').to(FileService).inSingletonScope();
container.bind<UploadService>('UploadService').to(UploadService).inSingletonScope();
container.bind<WebSocketService>('WebSocketService').to(WebSocketService).inSingletonScope();
container.bind<UserService>('UserService').to(UserService).inSingletonScope();

// Setup storage module
setupStorageModule(container);

// Controllers - use string identifiers consistently
container.bind<AuthController>('AuthController').to(AuthController).inSingletonScope();
container.bind<StorageController>('StorageController').to(StorageController).inSingletonScope();
container.bind<FileController>('FileController').to(FileController).inSingletonScope();
container.bind<UserController>('UserController').to(UserController).inSingletonScope();
container.bind<OAuthController>('OAuthController').to(OAuthController).inSingletonScope();

// Middleware
container.bind<AuthMiddleware>('AuthMiddleware').to(AuthMiddleware).inSingletonScope();
container.bind<AdminMiddleware>('AdminMiddleware').to(AdminMiddleware).inSingletonScope();

// Company bindings
container.bind<CompanyController>('CompanyController').to(CompanyController).inSingletonScope();
container.bind<CompanyService>('CompanyService').to(CompanyService).inSingletonScope();
container.bind<CompanyRepository>('CompanyRepository').to(CompanyRepository).inSingletonScope();

// Routes
container.bind<AuthRoutes>('AuthRoutes').to(AuthRoutes).inSingletonScope();
container.bind<UserRoutes>('UserRoutes').to(UserRoutes).inSingletonScope();
container.bind<FileRoutes>('FileRoutes').to(FileRoutes).inSingletonScope();
container.bind<CompanyRoutes>('CompanyRoutes').to(CompanyRoutes).inSingletonScope();
container.bind<StorageRoutes>('StorageRoutes').to(StorageRoutes).inSingletonScope();
container.bind<RoomRoutes>('RoomRoutes').to(RoomRoutes).inSingletonScope();
container.bind<SharingRoutes>('SharingRoutes').to(SharingRoutes).inSingletonScope();
container.bind<ActivityRoutes>('ActivityRoutes').to(ActivityRoutes).inSingletonScope();
container.bind<OAuthRoutes>('OAuthRoutes').to(OAuthRoutes).inSingletonScope();
container.bind<Routes>('Routes').to(Routes).inSingletonScope();

// Register services
container.bind<RoomService>('RoomService').to(RoomService).inSingletonScope();
container.bind<SharingService>('SharingService').to(SharingService).inSingletonScope();
container.bind<ActivityService>('ActivityService').to(ActivityService).inSingletonScope();

// Register controllers
container.bind<RoomController>('RoomController').to(RoomController);
container.bind<SharingController>('SharingController').to(SharingController);
container.bind<ActivityController>('ActivityController').to(ActivityController);

// Services
import { AccessPolicyService } from '../services/room/access-policy.service';

// Register AccessPolicyService
container.bind<AccessPolicyService>('AccessPolicyService').to(AccessPolicyService).inSingletonScope();

// Function to initialize the container with async dependencies
export async function initializeContainer(): Promise<void> {
  try {
    // Initialize DrizzleClient
    await drizzleClient.initialize();
    
    // Test database connection
    const connection = await createConnection();
    if (!connection) {
      throw new Error('Failed to establish database connection');
    }
  } catch (error) {
    console.error('Failed to initialize database connection:', error);
    throw error;
  }
}

export { container };