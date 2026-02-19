export class PlaceBidDto {
  auctionId!: string;
  amount!: string;
  referencePrice!: string;
  idempotencyKey!: string;
  clientSentAt?: string;
}
