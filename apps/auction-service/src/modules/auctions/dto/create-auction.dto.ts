import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsUUID,
  MaxLength,
  Length,
} from 'class-validator';

export class CreateAuctionDto {
  @IsUUID()
  parcelId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsDateString()
  depositDeadline!: string;

  @IsString()
  @IsNotEmpty()
  startingPrice!: string;

  @IsString()
  @IsNotEmpty()
  minimumIncrement!: string;

  @IsString()
  @IsNotEmpty()
  requiredDeposit!: string;

  @IsString()
  @Length(3, 3)
  @IsOptional()
  currency?: string;
}
