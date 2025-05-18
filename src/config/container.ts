// src/config/container.ts
import { Container } from 'inversify';
import { Logger } from '../utils/logger';
import { redisClient, createRedisClient } from '../utils/redis';
import { UserRepository } from '../repositories/user.repository';
import { UserRepositoryImpl } from '../repositories/user.repository.impl';
import { AuthService } from '../services/auth/auth.service';
import { AuthServiceImpl } from '../services/auth/auth.service.impl';
import { Auth0Service } from '../services/auth/auth0.service';
import { AuthController } from '../api/controllers/auth.controller';
import { AuthMiddleware } from '../api/middleware/auth.middleware';
import { StorageController } from '../api/controllers/storage.controller';
import { StorageAccountRepository } from '../repositories/storage-account.repository';
import { StorageAccountRepositoryImpl } from '../repositories/storage-account.repository.impl';
import { FileRepository } from '../repositories/file.repository';
import { FileRepositoryImpl } from '../repositories/file.repository.impl';
import { FileService } from '../services/file/file.service';
import { UploadService } from '../services/file/upload.service';
import { FileController } from '../api/controllers/file.controller';

// Import storage setup function
import { setupStorageModule } from '../services/storage/setup';
import { StorageProviderFactory, StorjStorageProvider, WasabiStorageProvider } from '../services/storage';

const container = new Container();
const factory = container.get<StorageProviderFactory>('StorageProviderFactory');


factory.registerProvider('vault', WasabiStorageProvider as any); // For Wasabi
factory.registerProvider('vault', StorjStorageProvider as any);  // For Storj

// Utils
container.bind<Logger>('Logger').to(Logger).inSingletonScope();
// container.bind<RedisClient>('RedisClient').toConstantValue(createRedisClient());

// Repositories
container.bind<UserRepository>('UserRepository').to(UserRepositoryImpl).inSingletonScope();
container.bind<StorageAccountRepository>('StorageAccountRepository').to(StorageAccountRepositoryImpl).inSingletonScope();
container.bind<FileRepository>('FileRepository').to(FileRepositoryImpl).inSingletonScope();
container.bind<FileService>('FileService').to(FileService).inSingletonScope();
container.bind<UploadService>('UploadService').to(UploadService).inSingletonScope();
container.bind<FileController>(FileController).toSelf().inSingletonScope();

// Services
container.bind<Auth0Service>('Auth0Service').to(Auth0Service).inSingletonScope();
container.bind<AuthService>('AuthService').to(AuthServiceImpl).inSingletonScope();

// Controllers
container.bind<AuthController>(AuthController).toSelf().inSingletonScope();
container.bind<StorageController>(StorageController).toSelf().inSingletonScope();

// Middleware
container.bind<AuthMiddleware>(AuthMiddleware).toSelf().inSingletonScope();

// Set up storage module
setupStorageModule(container);

export { container };