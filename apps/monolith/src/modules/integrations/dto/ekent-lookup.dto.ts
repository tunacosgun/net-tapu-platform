import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class EkentLookupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  district!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  ada!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  parsel!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  neighborhood?: string;

  /** Optional manual override URL — stored verbatim, source='manual' */
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  manualUrl?: string;
}

export class CreateEkentProviderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  district?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  urlPattern!: string;

  @IsString()
  @IsOptional()
  imarEndpoint?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
