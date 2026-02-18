import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Page } from './entities/page.entity';
import { Faq } from './entities/faq.entity';
import { Reference } from './entities/reference.entity';
import { Media } from './entities/media.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { AuditLog } from './entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Page,
      Faq,
      Reference,
      Media,
      SystemSetting,
      AuditLog,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class AdminModule {}
