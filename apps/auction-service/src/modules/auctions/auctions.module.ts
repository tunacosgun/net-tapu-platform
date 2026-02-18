import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auction } from './entities/auction.entity';
import { AuctionParticipant } from './entities/auction-participant.entity';
import { Bid } from './entities/bid.entity';
import { BidRejection } from './entities/bid-rejection.entity';
import { BidCorrection } from './entities/bid-correction.entity';
import { AuctionConsent } from './entities/auction-consent.entity';
import { SettlementManifest } from './entities/settlement-manifest.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Auction,
      AuctionParticipant,
      Bid,
      BidRejection,
      BidCorrection,
      AuctionConsent,
      SettlementManifest,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class AuctionsModule {}
