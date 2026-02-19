import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auction } from './entities/auction.entity';
import { AuctionParticipant } from './entities/auction-participant.entity';
import { Bid } from './entities/bid.entity';
import { BidRejection } from './entities/bid-rejection.entity';
import { BidCorrection } from './entities/bid-correction.entity';
import { AuctionConsent } from './entities/auction-consent.entity';
import { SettlementManifest } from './entities/settlement-manifest.entity';
import { BidService } from './services/bid.service';
import { AuctionService } from './services/auction.service';
import { RedisLockService } from './services/redis-lock.service';
import { BidController } from './controllers/bid.controller';
import { AuctionController } from './controllers/auction.controller';
import { AuctionGateway } from './gateways/auction.gateway';
import { AuctionEndingWorker } from './workers/auction-ending.worker';

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
  controllers: [AuctionController, BidController],
  providers: [AuctionService, BidService, RedisLockService, AuctionGateway, AuctionEndingWorker],
  exports: [TypeOrmModule, AuctionService, BidService],
})
export class AuctionsModule {}
