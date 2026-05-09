import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Parcel } from './entities/parcel.entity';
import { ParcelImage } from './entities/parcel-image.entity';
import { ParcelDocument } from './entities/parcel-document.entity';
import { ParcelStatusHistory } from './entities/parcel-status-history.entity';
import { ParcelMapData } from './entities/parcel-map-data.entity';
import { Favorite } from './entities/favorite.entity';
import { SavedSearch } from './entities/saved-search.entity';
import { PriceChangeLog } from './entities/price-change-log.entity';
import { PriceAlert } from './entities/price-alert.entity';
import { ParcelReservation } from './entities/parcel-reservation.entity';

import { ParcelService } from './services/parcel.service';
import { ParcelMediaService } from './services/parcel-media.service';
import { ParcelImportService } from './services/parcel-import.service';
import { ParcelPdfService } from './services/parcel-pdf.service';
import { FavoriteService } from './services/favorite.service';
import { SavedSearchService } from './services/saved-search.service';
import { GeoSearchService } from './services/geo-search.service';
import { PricingService } from './services/pricing.service';
import { ViewerCountService } from './services/viewer-count.service';
import { ImageProcessingService } from './services/image-processing.service';
import { PriceAlertService } from './services/price-alert.service';
import { ReservationService } from './services/reservation.service';

import { ParcelController } from './controllers/parcel.controller';
import { ParcelMediaController } from './controllers/parcel-media.controller';
import { AdminParcelController } from './controllers/admin-parcel.controller';
import { FavoriteController } from './controllers/favorite.controller';
import { SavedSearchController } from './controllers/saved-search.controller';
import { GeoSearchController } from './controllers/geo-search.controller';
import { ViewerCountController } from './controllers/viewer-count.controller';
import { PriceAlertController, UserPriceAlertController } from './controllers/price-alert.controller';
import { ReservationController, UserReservationController } from './controllers/reservation.controller';

import { PRICING_STRATEGY } from './pricing/pricing-strategy.interface';
import { BasePricingStrategy } from './pricing/base-pricing.strategy';

import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Parcel,
      ParcelImage,
      ParcelDocument,
      ParcelStatusHistory,
      ParcelMapData,
      Favorite,
      SavedSearch,
      PriceChangeLog,
      PriceAlert,
      ParcelReservation,
    ]),
    AdminModule,
  ],
  controllers: [
    ParcelController,
    ParcelMediaController,
    AdminParcelController,
    FavoriteController,
    SavedSearchController,
    GeoSearchController,
    ViewerCountController,
    PriceAlertController,
    UserPriceAlertController,
    ReservationController,
    UserReservationController,
  ],
  providers: [
    ParcelService,
    ParcelMediaService,
    ParcelImportService,
    ParcelPdfService,
    FavoriteService,
    SavedSearchService,
    GeoSearchService,
    PricingService,
    ViewerCountService,
    ImageProcessingService,
    PriceAlertService,
    ReservationService,
    {
      provide: PRICING_STRATEGY,
      useClass: BasePricingStrategy,
    },
  ],
  exports: [TypeOrmModule, ParcelService, GeoSearchService, PricingService, ViewerCountService],
})
export class ListingsModule {}
