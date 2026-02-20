import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { BidService, BidAcceptedResponse } from '../services/bid.service';
import { PlaceBidDto } from '../dto/place-bid.dto';
import { AuctionGateway } from '../gateways/auction.gateway';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('bids')
@UseGuards(JwtAuthGuard)
export class BidController {
  constructor(
    private readonly bidService: BidService,
    private readonly auctionGateway: AuctionGateway,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async placeBid(
    @Body() dto: PlaceBidDto,
    @Req() req: Record<string, any>,
  ): Promise<BidAcceptedResponse> {
    const userId = req.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user ID is required');
    }

    const ipAddress =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip;

    const result = await this.bidService.placeBid(dto, userId, ipAddress);

    // Broadcast to all WebSocket clients in the auction room
    this.auctionGateway.broadcastBidAccepted(dto.auctionId, {
      type: 'BID_ACCEPTED',
      bid_id: result.bid_id,
      user_id_masked: userId.slice(0, 8) + '***',
      amount: result.amount,
      server_timestamp: result.server_timestamp,
      new_bid_count: result.new_bid_count,
    });

    return result;
  }
}
