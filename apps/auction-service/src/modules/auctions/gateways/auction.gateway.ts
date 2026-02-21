import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, HttpException, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Auction } from '../entities/auction.entity';
import { AuctionParticipant } from '../entities/auction-participant.entity';
import { BidService } from '../services/bid.service';
import { RedisLockService } from '../services/redis-lock.service';
import { PlaceBidDto } from '../dto/place-bid.dto';
import {
  AuctionStateMessage,
  BidAcceptedMessage,
  BidRejectedMessage,
  AuctionExtendedMessage,
  AuctionEndingMessage,
  AuctionEndedMessage,
  AuctionSettlementPendingMessage,
  AuctionSettlementProgressMessage,
  AuctionSettledMessage,
  AuctionSettlementFailedMessage,
  WsContextInterceptor,
} from '@nettapu/shared';
import { MetricsService } from '../../../metrics/metrics.service';

interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
}

// Matches digits with optional decimal, no leading minus, no letters
const VALID_AMOUNT_RE = /^\d+(\.\d+)?$/;

@UseInterceptors(WsContextInterceptor)
@WebSocketGateway({
  path: '/ws/auction',
  cors: { origin: '*' },
})
export class AuctionGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AuctionGateway.name);

  constructor(
    @InjectRepository(Auction)
    private readonly auctionRepo: Repository<Auction>,
    @InjectRepository(AuctionParticipant)
    private readonly participantRepo: Repository<AuctionParticipant>,
    private readonly bidService: BidService,
    private readonly redisLock: RedisLockService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  // ── JWT Authentication Middleware ──────────────────────────────

  afterInit(server: Server) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const verifyOptions: jwt.VerifyOptions = {
      algorithms: ['HS256'],
      issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
      audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
    };

    server.use((socket: Socket, next: (err?: Error) => void) => {
      const token =
        socket.handshake.auth?.token ??
        (socket.handshake.headers?.authorization as string)?.replace(
          'Bearer ',
          '',
        );

      if (!token) {
        this.logger.warn(
          `Connection rejected: no token provided (${socket.id})`,
        );
        return next(new Error('Authentication required'));
      }

      try {
        const payload = jwt.verify(token, secret, verifyOptions) as JwtPayload;
        socket.data.userId = payload.sub;
        socket.data.email = payload.email;
        socket.data.roles = payload.roles;
        socket.data.requestId = randomUUID();
        next();
      } catch (err) {
        this.logger.warn(
          `Connection rejected: invalid token (${socket.id}) – ${(err as Error).message}`,
        );
        return next(new Error('Invalid or expired token'));
      }
    });

    this.logger.log('JWT authentication middleware registered (HS256-only, iss/aud enforced)');
  }

  handleConnection(client: Socket) {
    this.metrics.wsConnectionsTotal.inc({ status: 'connected' });
    this.metrics.wsActiveConnections.inc();
    this.logger.log(
      `Client connected: ${client.id} (user=${client.data.userId})`,
    );
  }

  // ── Memory leak protection: leave all rooms on disconnect ──────

  handleDisconnect(client: Socket) {
    this.metrics.wsConnectionsTotal.inc({ status: 'disconnected' });
    this.metrics.wsActiveConnections.dec();

    // Socket.IO auto-removes the socket from all rooms on disconnect,
    // but we explicitly verify and log for audit trail.
    const auctionRooms = [...client.rooms].filter((r) =>
      r.startsWith('auction:'),
    );
    for (const room of auctionRooms) {
      client.leave(room);
      this.logger.log(
        `Cleanup: ${client.id} force-left room ${room} on disconnect`,
      );
    }
    this.logger.log(
      `Client disconnected: ${client.id} (user=${client.data.userId}, rooms_cleaned=${auctionRooms.length})`,
    );
  }

  // ── join_auction (anti-enumeration + participant-only) ─────────

  @SubscribeMessage('join_auction')
  async handleJoinAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { auctionId: string },
  ) {
    const userId = client.data.userId as string;

    // Anti-enumeration: validate UUID format before any DB lookup
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!data.auctionId || !uuidRe.test(data.auctionId)) {
      this.logger.warn(
        `Join denied: user ${userId} sent invalid auctionId format`,
      );
      client.emit('error', { message: 'Unable to join auction' });
      return;
    }

    // Single query: participant + auction existence in one check.
    // If auction doesn't exist OR user is not participant, same generic error.
    const participant = await this.participantRepo.findOne({
      where: {
        auctionId: data.auctionId,
        userId,
        eligible: true,
      },
    });

    if (!participant) {
      // Generic error — do NOT reveal whether auction exists
      this.logger.warn(
        `Join denied: user ${userId} for auction ${data.auctionId} (not participant or not found)`,
      );
      client.emit('error', { message: 'Unable to join auction' });
      return;
    }

    // Auction exists and user is participant — now load auction state
    const auction = await this.auctionRepo.findOne({
      where: { id: data.auctionId },
    });

    if (!auction) {
      // Should not happen if participant FK is intact, but defend anyway
      client.emit('error', { message: 'Unable to join auction' });
      return;
    }

    const room = `auction:${data.auctionId}`;
    await client.join(room);

    const effectiveEnd = auction.extendedUntil ?? auction.scheduledEnd;
    const snapshot: AuctionStateMessage = {
      type: 'AUCTION_STATE',
      auction_id: auction.id,
      status: auction.status,
      current_price: auction.currentPrice ?? auction.startingPrice,
      bid_count: auction.bidCount,
      participant_count: auction.participantCount,
      watcher_count: auction.watcherCount,
      time_remaining_ms: effectiveEnd
        ? Math.max(
            0,
            new Date(effectiveEnd).getTime() - Date.now(),
          )
        : null,
      extended_until: auction.extendedUntil?.toISOString() ?? null,
    };

    client.emit('auction_state', snapshot);
    this.logger.log(
      `Client ${client.id} (user=${userId}) joined room ${room}`,
    );
  }

  // ── leave_auction ──────────────────────────────────────────────

  @SubscribeMessage('leave_auction')
  async handleLeaveAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { auctionId: string },
  ) {
    const room = `auction:${data.auctionId}`;
    await client.leave(room);
    this.logger.log(
      `Client ${client.id} (user=${client.data.userId}) left room ${room}`,
    );
  }

  // ── place_bid (hardened) ───────────────────────────────────────

  @SubscribeMessage('place_bid')
  async handlePlaceBid(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { auctionId: string; amount: string; idempotencyKey: string },
  ) {
    const userId = client.data.userId as string;
    this.metrics.wsBidsTotal.inc();

    // ── Bid floor enforcement: reject obviously invalid amounts ──
    if (
      !data.amount ||
      !VALID_AMOUNT_RE.test(data.amount) ||
      parseFloat(data.amount) <= 0
    ) {
      this.logger.warn(
        `Bid floor reject: user ${userId} sent invalid amount "${data.amount}"`,
      );
      this.metrics.wsBidRejectionsTotal.inc({ reason_code: 'invalid_amount' });
      client.emit('bid_rejected', {
        type: 'BID_REJECTED',
        reason_code: 'invalid_amount',
        current_price: '',
        message: 'Invalid bid amount',
      } as BidRejectedMessage);
      return;
    }

    // ── Redis failover protection ────────────────────────────────
    if (!this.redisLock.isHealthy()) {
      this.logger.error(
        `CRITICAL: Redis unavailable — blocking bid from user ${userId}`,
      );
      this.metrics.wsBidRejectionsTotal.inc({ reason_code: 'service_unavailable' });
      client.emit('bid_rejected', {
        type: 'BID_REJECTED',
        reason_code: 'service_unavailable',
        current_price: '',
        message: 'Service temporarily unavailable. Please retry.',
      } as BidRejectedMessage);
      return;
    }

    // ── Per-user rate limit: 5 bids per 3 seconds ────────────────
    let userRate: { allowed: boolean; current: number };
    try {
      userRate = await this.redisLock.checkBidRateLimit(userId, 5, 3);
    } catch (err) {
      this.logger.error(
        `CRITICAL: Redis rate limit failed — blocking bid from user ${userId}: ${(err as Error).message}`,
      );
      this.metrics.wsBidRejectionsTotal.inc({ reason_code: 'service_unavailable' });
      client.emit('bid_rejected', {
        type: 'BID_REJECTED',
        reason_code: 'service_unavailable',
        current_price: '',
        message: 'Service temporarily unavailable. Please retry.',
      } as BidRejectedMessage);
      return;
    }

    if (!userRate.allowed) {
      this.logger.warn(
        `User rate limit hit: user ${userId} sent ${userRate.current} bids in 3s window`,
      );
      this.metrics.userRateLimitHitsTotal.inc();
      this.metrics.wsBidRejectionsTotal.inc({ reason_code: 'rate_limited' });
      client.emit('bid_rejected', {
        type: 'BID_REJECTED',
        reason_code: 'rate_limited',
        current_price: '',
        message: `Rate limit exceeded. Slow down.`,
      } as BidRejectedMessage);
      return;
    }

    // ── Per-auction rate limit: 50 bids per 3 seconds ────────────
    let auctionRate: { allowed: boolean; current: number };
    try {
      auctionRate = await this.redisLock.checkAuctionRateLimit(
        data.auctionId,
        50,
        3,
      );
    } catch (err) {
      this.logger.error(
        `CRITICAL: Redis auction rate limit failed: ${(err as Error).message}`,
      );
      this.metrics.wsBidRejectionsTotal.inc({ reason_code: 'service_unavailable' });
      client.emit('bid_rejected', {
        type: 'BID_REJECTED',
        reason_code: 'service_unavailable',
        current_price: '',
        message: 'Service temporarily unavailable. Please retry.',
      } as BidRejectedMessage);
      return;
    }

    if (!auctionRate.allowed) {
      this.logger.warn(
        `Auction rate limit hit: auction ${data.auctionId} received ${auctionRate.current} bids in 3s window`,
      );
      this.metrics.auctionRateLimitHitsTotal.inc();
      this.metrics.wsBidRejectionsTotal.inc({ reason_code: 'auction_rate_limited' });
      client.emit('bid_rejected', {
        type: 'BID_REJECTED',
        reason_code: 'auction_rate_limited',
        current_price: '',
        message: 'Auction is receiving too many bids. Please retry.',
      } as BidRejectedMessage);
      return;
    }

    const ipAddress =
      (client.handshake.headers?.['x-forwarded-for'] as string)
        ?.split(',')[0]
        ?.trim() ?? client.handshake.address;

    try {
      const auction = await this.auctionRepo.findOne({
        where: { id: data.auctionId },
      });
      const referencePrice =
        auction?.currentPrice ?? auction?.startingPrice ?? '0';

      const dto: PlaceBidDto = {
        auctionId: data.auctionId,
        amount: data.amount,
        referencePrice,
        idempotencyKey: data.idempotencyKey,
      };

      const result = await this.bidService.placeBid(dto, userId, ipAddress);

      // Broadcast accepted bid to entire auction room
      this.broadcastBidAccepted(data.auctionId, {
        type: 'BID_ACCEPTED',
        bid_id: result.bid_id,
        user_id_masked: userId.slice(0, 8) + '***',
        amount: result.amount,
        server_timestamp: result.server_timestamp,
        new_bid_count: result.new_bid_count,
      });

      // Broadcast sniper extension if triggered
      if (result.sniper_extended && result.extended_until) {
        this.broadcastAuctionExtended(data.auctionId, {
          type: 'AUCTION_EXTENDED',
          auction_id: data.auctionId,
          new_end_time: result.extended_until,
          triggered_by_bid_id: result.bid_id,
        });
      }
    } catch (err: unknown) {
      let reasonCode = 'unknown';
      let currentPrice = '';
      let message = 'Bid rejected';

      if (err instanceof HttpException) {
        const body = err.getResponse();
        if (typeof body === 'object') {
          const b = body as Record<string, any>;
          reasonCode = b.reason_code ?? reasonCode;
          currentPrice = b.current_price ?? currentPrice;
          message = b.message ?? message;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }

      this.metrics.wsBidRejectionsTotal.inc({ reason_code: reasonCode });
      client.emit('bid_rejected', {
        type: 'BID_REJECTED',
        reason_code: reasonCode,
        current_price: currentPrice,
        message,
      } as BidRejectedMessage);
    }
  }

  // ── Public broadcast methods ───────────────────────────────────

  broadcastBidAccepted(auctionId: string, data: BidAcceptedMessage): void {
    this.server.to(`auction:${auctionId}`).emit('bid_accepted', data);
  }

  broadcastAuctionExtended(auctionId: string, data: AuctionExtendedMessage): void {
    this.server.to(`auction:${auctionId}`).emit('auction_extended', data);
  }

  broadcastAuctionEnding(auctionId: string, data: AuctionEndingMessage): void {
    this.server.to(`auction:${auctionId}`).emit('auction_ending', data);
  }

  broadcastAuctionEnded(auctionId: string, data: AuctionEndedMessage): void {
    this.server.to(`auction:${auctionId}`).emit('auction_ended', data);
  }

  broadcastSettlementPending(auctionId: string, data: AuctionSettlementPendingMessage): void {
    this.server.to(`auction:${auctionId}`).emit('auction_settlement_pending', data);
  }

  broadcastSettlementProgress(auctionId: string, data: AuctionSettlementProgressMessage): void {
    this.server.to(`auction:${auctionId}`).emit('auction_settlement_progress', data);
  }

  broadcastSettlementCompleted(auctionId: string, data: AuctionSettledMessage): void {
    this.server.to(`auction:${auctionId}`).emit('auction_settled', data);
  }

  broadcastSettlementFailed(auctionId: string, data: AuctionSettlementFailedMessage): void {
    this.server.to(`auction:${auctionId}`).emit('auction_settlement_failed', data);
  }
}
