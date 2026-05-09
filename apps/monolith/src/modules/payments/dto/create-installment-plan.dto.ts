import {
  IsUUID,
  IsNumberString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateInstallmentPlanDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  parcelId!: string;

  @IsUUID()
  @IsOptional()
  auctionId?: string;

  /** Total amount as decimal string (e.g. "120000.00") */
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Invalid amount format' })
  totalAmount!: string;

  @IsInt()
  @Min(2)
  @Max(60)
  installmentCount!: number;

  /** First due date in YYYY-MM-DD; subsequent due dates are computed monthly */
  @IsDateString()
  firstDueDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  /** If false, user must manually pay each installment via /installments/:id/pay */
  @IsOptional()
  @IsBoolean()
  autoCharge?: boolean;

  /** Tokenized card data for recurring auto-charges */
  @IsOptional()
  @IsString()
  cardToken?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
