import jwt, { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { env } from '../../config/env';

export interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  companyId?: string;
  iat?: number;
  exp?: number;
}

export class JwtService {
  private readonly secret: string;
  private readonly audience: string;
  private readonly issuer: string;
  private readonly expiresIn: StringValue | number;

  constructor() {
    this.secret = env.JWT_SECRET;
    this.audience = env.JWT_AUDIENCE;
    this.issuer = env.JWT_ISSUER;
    this.expiresIn = env.JWT_EXPIRES_IN as StringValue;
  }

  generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    const options: SignOptions = {
      audience: this.audience,
      issuer: this.issuer,
      expiresIn: this.expiresIn,
    };

    return jwt.sign(payload, this.secret, options);
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.secret, {
        audience: this.audience,
        issuer: this.issuer,
      }) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      }
      throw new Error('Invalid token');
    }
  }

  decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch {
      return null;
    }
  }
} 