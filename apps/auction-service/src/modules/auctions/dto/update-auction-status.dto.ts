import { IsEnum, IsInt } from 'class-validator';
import { AuctionStatus } from '@nettapu/shared';

export class UpdateAuctionStatusDto {
  @IsEnum(AuctionStatus)
  status!: AuctionStatus;

  @IsInt()
  version!: number;
}
