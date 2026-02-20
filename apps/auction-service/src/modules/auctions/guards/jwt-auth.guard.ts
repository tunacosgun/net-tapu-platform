import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
}

/**
 * Verifies JWT token and attaches the decoded payload to req.user.
 * Does NOT enforce any specific role — use AdminGuard for admin-only endpoints.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const authHeader: string | undefined = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const secret = this.config.getOrThrow<string>('JWT_SECRET');

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = payload;
    return true;
  }
}
