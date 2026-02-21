import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  jti?: string;
}

/**
 * Optional hook for jti (JWT ID) replay detection.
 * Implement and provide via DI when Redis-backed storage is ready.
 */
export interface JtiValidationHook {
  isRevoked(jti: string): Promise<boolean>;
}

export const JTI_VALIDATION_HOOK = Symbol('JTI_VALIDATION_HOOK');

/**
 * Verifies JWT token and attaches the decoded payload to req.user.
 * Enforces HS256 algorithm, issuer, and audience validation.
 * Does NOT enforce any specific role — use AdminGuard for admin-only endpoints.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly verifyOptions: jwt.VerifyOptions;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(JTI_VALIDATION_HOOK)
    private readonly jtiHook?: JtiValidationHook,
  ) {
    this.verifyOptions = {
      algorithms: ['HS256'],
      issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
      audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const authHeader: string | undefined = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const secret = this.config.getOrThrow<string>('JWT_SECRET');

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret, this.verifyOptions) as JwtPayload;
    } catch (err) {
      this.logger.warn(`JWT verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.jti && this.jtiHook) {
      const revoked = await this.jtiHook.isRevoked(payload.jti);
      if (revoked) {
        this.logger.warn(`Revoked jti detected: ${payload.jti}`);
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    req.user = payload;
    return true;
  }
}
