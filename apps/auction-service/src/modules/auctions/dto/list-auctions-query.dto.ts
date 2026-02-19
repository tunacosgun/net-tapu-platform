import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AuctionStatus } from '@nettapu/shared';

export class ListAuctionsQueryDto {
  @IsEnum(AuctionStatus)
  @IsOptional()
  status?: AuctionStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
