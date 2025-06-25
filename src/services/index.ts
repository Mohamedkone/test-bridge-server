import { Container } from 'inversify';
import { Auth0Service } from './auth/auth0.service';
import { AuthService } from './auth/auth.service';
import { AuthServiceImpl } from './auth/auth.service.impl';
import { StorageProviderFactoryImpl } from './storage/factory';
import { StorageService } from './storage/storage.service';

export function registerServices(container: Container): void {
  // Register Auth services
  container.bind<Auth0Service>('Auth0Service').to(Auth0Service).inSingletonScope();
  container.bind<AuthService>('AuthService').to(AuthServiceImpl).inSingletonScope();
  
  // Register Storage services
  container.bind<StorageProviderFactoryImpl>('StorageProviderFactory').to(StorageProviderFactoryImpl).inSingletonScope();
  container.bind<StorageService>('StorageService').to(StorageService).inSingletonScope();
}

export * from './auth/auth.service';
export * from './auth/auth0.service';
export * from './storage/storage.service';
export * from './storage/types'; 