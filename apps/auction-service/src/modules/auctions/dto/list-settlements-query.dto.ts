import { IsEnum, IsOptional, IsInt, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { SettlementManifestStatus } from '@nettapu/shared';

export class ListSettlementsQueryDto {
  @IsEnum(SettlementManifestStatus)
  @IsOptional()
  status?: SettlementManifestStatus;

  @IsUUID()
  @IsOptional()
  auction_id?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}
