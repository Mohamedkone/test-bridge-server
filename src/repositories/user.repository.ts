// src/repositories/user.repository.ts
import { User } from '../types/models';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByAuth0Id(auth0Id: string): Promise<User | null>;
  create(data: Partial<User>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
}