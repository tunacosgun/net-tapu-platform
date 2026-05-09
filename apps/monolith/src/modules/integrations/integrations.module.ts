import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TkgmCache } from './entities/tkgm-cache.entity';
import { SyncState } from './entities/sync-state.entity';
import { ExternalApiLog } from './entities/external-api-log.entity';
import { EkentProvider } from './entities/ekent-provider.entity';
import { EkentCache } from './entities/ekent-cache.entity';
import { ParcelMapData } from '../listings/entities/parcel-map-data.entity';

import { TkgmService } from './services/tkgm.service';
import { SyncStateService } from './services/sync-state.service';
import { ExternalApiLogService } from './services/external-api-log.service';
import { EkentService } from './services/ekent.service';

import { TkgmController } from './controllers/tkgm.controller';
import { SyncStateController } from './controllers/sync-state.controller';
import { EkentController, AdminEkentController } from './controllers/ekent.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TkgmCache,
      SyncState,
      ExternalApiLog,
      EkentProvider,
      EkentCache,
      ParcelMapData,
    ]),
  ],
  controllers: [TkgmController, SyncStateController, EkentController, AdminEkentController],
  providers: [TkgmService, SyncStateService, ExternalApiLogService, EkentService],
  exports: [TypeOrmModule, TkgmService, ExternalApiLogService, EkentService],
})
export class IntegrationsModule {}
