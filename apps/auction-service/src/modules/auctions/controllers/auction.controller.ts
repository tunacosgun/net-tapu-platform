import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuctionService } from '../services/auction.service';
import { CreateAuctionDto } from '../dto/create-auction.dto';
import { UpdateAuctionStatusDto } from '../dto/update-auction-status.dto';
import { ListAuctionsQueryDto } from '../dto/list-auctions-query.dto';
import { AdminGuard } from '../guards/admin.guard';

@Controller()
export class AuctionController {
  constructor(private readonly auctionService: AuctionService) {}

  @Post()
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateAuctionDto,
    @Req() req: Record<string, any>,
  ) {
    const userId = req.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user ID is required');
    }

    return this.auctionService.create(dto, userId);
  }

  @Get()
  async list(@Query() query: ListAuctionsQueryDto) {
    return this.auctionService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.auctionService.findById(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAuctionStatusDto,
  ) {
    return this.auctionService.updateStatus(id, dto);
  }
}
