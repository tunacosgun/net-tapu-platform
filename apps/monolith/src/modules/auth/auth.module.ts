import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Consent } from './entities/consent.entity';
import { DealerQuota } from './entities/dealer-quota.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      UserRole,
      RefreshToken,
      Consent,
      DealerQuota,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class AuthModule {}
