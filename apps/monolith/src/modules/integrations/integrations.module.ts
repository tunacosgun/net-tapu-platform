import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TkgmCache } from './entities/tkgm-cache.entity';
import { SyncState } from './entities/sync-state.entity';
import { ExternalApiLog } from './entities/external-api-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TkgmCache,
      SyncState,
      ExternalApiLog,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class IntegrationsModule {}
