import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
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
import { LoginAttempt } from './entities/login-attempt.entity';

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
    @InjectRepository(LoginAttempt)
    private readonly loginAttemptRepo: Repository<LoginAttempt>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.refreshTokenTtlDays = this.config.get<number>(
      'JWT_REFRESH_EXPIRATION_DAYS',
      7,
    );
  }

  async register(dto: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    referralCode?: string;
  }) {
    const existingEmail = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('Bu e-posta adresi zaten kayıtlı');
    }

    const normalizedUsername = dto.username.toLowerCase().trim();
    const existingUsername = await this.userRepo.findOne({
      where: { username: normalizedUsername },
    });
    if (existingUsername) {
      throw new ConflictException('Bu kullanıcı adı zaten alınmış');
    }

    // Look up the inviter BEFORE creating the new user (no self-ref possible)
    let inviterId: string | null = null;
    if (dto.referralCode) {
      const code = dto.referralCode.trim().toUpperCase();
      const inviter = await this.userRepo.findOne({
        where: { referralCode: code },
      });
      if (inviter) inviterId = inviter.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.userRepo.create({
      username: normalizedUsername,
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
      referredBy: inviterId,
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
      await this.recordLoginAttempt(email, false, ipAddress, deviceInfo);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      await this.recordLoginAttempt(email, false, ipAddress, deviceInfo);
      throw new UnauthorizedException('Account is deactivated');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.recordLoginAttempt(email, false, ipAddress, deviceInfo);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Record successful attempt
    await this.recordLoginAttempt(email, true, ipAddress, deviceInfo);

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

  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const roles = await this.getUserRoles(userId);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      tcKimlikNo: user.tcKimlikNo,
      isVerified: user.isVerified,
      avatarUrl: user.avatarUrl,
      showAvatarInAuction: user.showAvatarInAuction ?? true,
      roles,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(
    userId: string,
    dto: {
      username?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      tcKimlikNo?: string;
      showAvatarInAuction?: boolean;
    },
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const updateData: Partial<User> = {};
    if (dto.username !== undefined) {
      const normalized = dto.username.toLowerCase().trim();
      if (normalized !== user.username) {
        const existing = await this.userRepo.findOne({ where: { username: normalized } });
        if (existing) {
          throw new BadRequestException('Bu kullanıcı adı zaten kullanılıyor');
        }
        updateData.username = normalized;
      }
    }
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.tcKimlikNo !== undefined) updateData.tcKimlikNo = dto.tcKimlikNo;
    if (dto.showAvatarInAuction !== undefined) updateData.showAvatarInAuction = dto.showAvatarInAuction;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('En az bir alan güncellenmelidir');
    }

    await this.userRepo.update(userId, updateData);

    return this.getProfile(userId);
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    await this.userRepo.update(userId, { avatarUrl });
  }

  async getNotificationPreferences(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
    return user.notificationPreferences ?? {};
  }

  async updateNotificationPreferences(
    userId: string,
    prefs: Record<string, { email: boolean; sms: boolean; push: boolean }>,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
    await this.userRepo.update(userId, { notificationPreferences: prefs } as any);
    return prefs;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Mevcut şifre yanlış');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.userRepo.update(userId, { passwordHash });

    // Revoke all refresh tokens for security
    await this.revokeAllUserTokens(userId);

    this.logger.log(`Password changed for user ${userId}`);
  }

  // ── OAuth helpers (used by social login services) ───────────────

  async getUserRolesPublic(userId: string): Promise<string[]> {
    return this.getUserRoles(userId);
  }

  async issueTokensForOAuth(
    user: User,
    roles: string[],
    deviceInfo?: string,
    ipAddress?: string,
  ) {
    const tokens = await this.issueTokens(user, roles, deviceInfo, ipAddress);
    return { ...tokens, user: { id: user.id, email: user.email, roles } };
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

  private async recordLoginAttempt(
    email: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await this.loginAttemptRepo.save(
        this.loginAttemptRepo.create({
          email,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
          success,
        }),
      );
    } catch (err) {
      // Never block login flow due to audit failure
      this.logger.warn(`Failed to record login attempt: ${err}`);
    }
  }

  private async revokeAllUserTokens(userId: string) {
    await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
