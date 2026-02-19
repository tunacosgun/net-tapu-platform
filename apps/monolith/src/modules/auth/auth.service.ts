import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { UserRole } from './entities/user-role.entity';
import { Role } from './entities/role.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
}

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTokenTtlDays: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.refreshTokenTtlDays = this.config.get<number>(
      'JWT_REFRESH_EXPIRATION_DAYS',
      7,
    );
  }

  async register(dto: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
    });
    await this.userRepo.save(user);

    // Assign default 'user' role
    const userRole = await this.roleRepo.findOne({ where: { name: 'user' } });
    if (userRole) {
      await this.userRoleRepo.save(
        this.userRoleRepo.create({ userId: user.id, roleId: userRole.id }),
      );
    }

    return { id: user.id, email: user.email };
  }

  async login(
    email: string,
    password: string,
    deviceInfo?: string,
    ipAddress?: string,
  ) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const roles = await this.getUserRoles(user.id);
    const tokens = await this.issueTokens(
      user,
      roles,
      deviceInfo,
      ipAddress,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  async refresh(
    oldRawToken: string,
    deviceInfo?: string,
    ipAddress?: string,
  ) {
    const oldHash = this.hashToken(oldRawToken);

    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash: oldHash },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Detect reuse: if token already revoked, someone replayed it
    if (stored.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}. Revoking all sessions.`,
      );
      // Revoke ALL tokens for this user — possible compromise
      await this.revokeAllUserTokens(stored.userId);
      throw new UnauthorizedException(
        'Token reuse detected. All sessions revoked.',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotate: revoke old
    await this.refreshTokenRepo.update(stored.id, { revokedAt: new Date() });

    const user = await this.userRepo.findOne({
      where: { id: stored.userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account not found or deactivated');
    }

    const roles = await this.getUserRoles(user.id);
    return this.issueTokens(user, roles, deviceInfo, ipAddress);
  }

  async logout(rawRefreshToken: string) {
    const hash = this.hashToken(rawRefreshToken);
    await this.refreshTokenRepo.update(
      { tokenHash: hash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async logoutAll(userId: string) {
    await this.revokeAllUserTokens(userId);
  }

  // ── private helpers ──────────────────────────────────────────────

  private async issueTokens(
    user: User,
    roles: string[],
    deviceInfo?: string,
    ipAddress?: string,
  ) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
    };

    const accessToken = this.jwtService.sign(payload);

    // Generate opaque refresh token
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenTtlDays);

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: user.id,
        tokenHash,
        deviceInfo: deviceInfo ?? null,
        ipAddress: ipAddress ?? null,
        expiresAt,
      }),
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRATION', '15m'),
    };
  }

  private async getUserRoles(userId: string): Promise<string[]> {
    const userRoles = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });
    return userRoles.map((ur) => ur.role.name);
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private async revokeAllUserTokens(userId: string) {
    await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
