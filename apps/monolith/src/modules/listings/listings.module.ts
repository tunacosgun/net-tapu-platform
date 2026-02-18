import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Parcel } from './entities/parcel.entity';
import { ParcelImage } from './entities/parcel-image.entity';
import { ParcelDocument } from './entities/parcel-document.entity';
import { ParcelStatusHistory } from './entities/parcel-status-history.entity';
import { ParcelMapData } from './entities/parcel-map-data.entity';
import { Favorite } from './entities/favorite.entity';
import { SavedSearch } from './entities/saved-search.entity';

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
    ]),
  ],
  exports: [TypeOrmModule],
})
export class ListingsModule {}
