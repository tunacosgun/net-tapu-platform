import {
  IsString,
  IsUUID,
  IsOptional,
  IsNotEmpty,
  Matches,
  MaxLength,
  IsEmail,
} from 'class-validator';

export class InitiateMailOrderDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  @IsOptional()
  parcelId?: string;

  @IsUUID()
  @IsOptional()
  auctionId?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{1,13}(\.\d{1,2})?$/, {
    message: 'amount must be a positive decimal',
  })
  amount!: string;

  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  idempotencyKey!: string;

  /** Cardholder name as printed on the card */
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  cardHolder!: string;

  /** PAN — digits only, 13–19 chars */
  @IsString()
  @Matches(/^\d{13,19}$/, { message: 'cardNumber must be 13–19 digits' })
  cardNumber!: string;

  /** MM */
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])$/, { message: 'expMonth must be MM (01–12)' })
  expMonth!: string;

  /** YYYY */
  @IsString()
  @Matches(/^\d{4}$/, { message: 'expYear must be YYYY' })
  expYear!: string;

  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'cvc must be 3 or 4 digits' })
  cvc!: string;

  @IsEmail()
  @IsOptional()
  buyerEmail?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  buyerPhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  /** Operator notes recorded in ledger metadata */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  operatorNotes?: string;
}
