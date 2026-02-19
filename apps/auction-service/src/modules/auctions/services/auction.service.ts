import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Auction } from '../entities/auction.entity';
import { AuctionStatus } from '@nettapu/shared';
import { CreateAuctionDto } from '../dto/create-auction.dto';
import { UpdateAuctionStatusDto } from '../dto/update-auction-status.dto';
import { ListAuctionsQueryDto } from '../dto/list-auctions-query.dto';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  [AuctionStatus.DRAFT]: [AuctionStatus.SCHEDULED],
  [AuctionStatus.SCHEDULED]: [AuctionStatus.LIVE],
  [AuctionStatus.LIVE]: [AuctionStatus.ENDED, AuctionStatus.CANCELLED],
};

@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);

  constructor(
    @InjectRepository(Auction)
    private readonly auctionRepo: Repository<Auction>,
  ) {}

  async create(dto: CreateAuctionDto, userId: string): Promise<Auction> {
    const auction = this.auctionRepo.create({
      parcelId: dto.parcelId,
      title: dto.title,
      description: dto.description ?? null,
      status: AuctionStatus.DRAFT,
      startingPrice: dto.startingPrice,
      minimumIncrement: dto.minimumIncrement,
      requiredDeposit: dto.requiredDeposit,
      currency: dto.currency ?? 'TRY',
      scheduledStart: new Date(dto.startTime),
      scheduledEnd: new Date(dto.endTime),
      depositDeadline: new Date(dto.depositDeadline),
      createdBy: userId,
    });

    const saved = await this.auctionRepo.save(auction);
    this.logger.log(`Auction created: ${saved.id} by user ${userId}`);
    return saved;
  }

  async findAll(
    query: ListAuctionsQueryDto,
  ): Promise<{ data: Auction[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.auctionRepo.createQueryBuilder('auction');

    if (query.status) {
      qb.where('auction.status = :status', { status: query.status });
    }

    qb.orderBy('auction.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<Auction> {
    const auction = await this.auctionRepo.findOne({ where: { id } });
    if (!auction) {
      throw new NotFoundException(`Auction ${id} not found`);
    }
    return auction;
  }

  async updateStatus(id: string, dto: UpdateAuctionStatusDto): Promise<Auction> {
    const auction = await this.auctionRepo.findOne({ where: { id } });
    if (!auction) {
      throw new NotFoundException(`Auction ${id} not found`);
    }

    if (auction.version !== dto.version) {
      throw new ConflictException(
        `Version conflict: expected ${dto.version}, current ${auction.version}`,
      );
    }

    const allowed = ALLOWED_TRANSITIONS[auction.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition: ${auction.status} -> ${dto.status}. Allowed: [${allowed.join(', ')}]`,
      );
    }

    const oldStatus = auction.status;
    auction.status = dto.status;

    if (dto.status === AuctionStatus.LIVE) {
      auction.actualStart = new Date();
    }

    if (dto.status === AuctionStatus.ENDED || dto.status === AuctionStatus.CANCELLED) {
      auction.endedAt = new Date();
    }

    try {
      const saved = await this.auctionRepo.save(auction);
      this.logger.log(`Auction ${id} status: ${oldStatus} -> ${dto.status}`);
      return saved;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.name === 'OptimisticLockVersionMismatchError'
      ) {
        throw new ConflictException(
          'Concurrent modification detected. Please retry with current version.',
        );
      }
      throw err;
    }
  }
}
