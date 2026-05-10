import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { ReferralCredit } from '../entities/referral-credit.entity';

const REFERRER_REWARD_TRY = 250;
const REFEREE_REWARD_TRY = 250;
const FIRST_DEPOSIT_TRIGGER = 'first_deposit';

export interface ReferralSummary {
  referralCode: string;
  invitedCount: number;
  totalEarnedAmount: string;
  availableAmount: string;
  usedAmount: string;
  credits: ReferralCredit[];
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ReferralCredit)
    private readonly creditRepo: Repository<ReferralCredit>,
  ) {}

  // ── Lookup ────────────────────────────────────────────────

  /** Resolve a referral code to the inviter user. Used at signup time. */
  async resolveCode(code: string): Promise<User | null> {
    if (!code) return null;
    const normalized = code.trim().toUpperCase();
    return this.userRepo.findOne({ where: { referralCode: normalized } });
  }

  async validateCode(code: string): Promise<{ valid: boolean; inviterName?: string }> {
    const inviter = await this.resolveCode(code);
    if (!inviter) return { valid: false };
    return {
      valid: true,
      inviterName: `${inviter.firstName} ${inviter.lastName?.charAt(0) ?? ''}.`.trim(),
    };
  }

  /** Mark a freshly-created user as referred by another user. */
  async setReferredBy(newUserId: string, referralCode: string | undefined | null): Promise<void> {
    if (!referralCode) return;
    const inviter = await this.resolveCode(referralCode);
    if (!inviter) {
      this.logger.warn(`Referral code "${referralCode}" not found at signup of ${newUserId}`);
      return;
    }
    if (inviter.id === newUserId) return; // self-referral guard
    await this.userRepo.update({ id: newUserId }, { referredBy: inviter.id });
    this.logger.log(
      JSON.stringify({
        event: 'referral_signup',
        new_user: newUserId,
        inviter: inviter.id,
        code: referralCode,
      }),
    );
  }

  // ── Reward grant ──────────────────────────────────────────

  /**
   * Idempotent grant — fired when a referred user makes their first
   * successful deposit/payment. Both the referrer and the referee
   * receive a discount credit. Re-firing returns null without dup error.
   */
  async grantFirstDepositReward(
    refereeUserId: string,
    paymentId: string,
  ): Promise<{ refereeCreditId: string; referrerCreditId: string } | null> {
    const referee = await this.userRepo.findOne({ where: { id: refereeUserId } });
    if (!referee || !referee.referredBy) return null;

    const referrerId = referee.referredBy;

    // Idempotency: skip if already granted (unique index on user+source+trigger)
    const existing = await this.creditRepo.findOne({
      where: {
        userId: refereeUserId,
        sourceUserId: refereeUserId,
        triggerEvent: FIRST_DEPOSIT_TRIGGER,
      },
    });
    if (existing) return null;

    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 180 days

    const refereeCredit = this.creditRepo.create({
      userId: refereeUserId,
      sourceUserId: refereeUserId,
      type: 'discount',
      amount: REFEREE_REWARD_TRY.toFixed(2),
      currency: 'TRY',
      status: 'available',
      triggerEvent: FIRST_DEPOSIT_TRIGGER,
      triggerPaymentId: paymentId,
      expiresAt,
      notes: 'İlk depozit kuponu (paylaş-kazan)',
    });

    const referrerCredit = this.creditRepo.create({
      userId: referrerId,
      sourceUserId: refereeUserId,
      type: 'discount',
      amount: REFERRER_REWARD_TRY.toFixed(2),
      currency: 'TRY',
      status: 'available',
      triggerEvent: FIRST_DEPOSIT_TRIGGER,
      triggerPaymentId: paymentId,
      expiresAt,
      notes: 'Davet ettiğiniz kullanıcı ilk depozit ödemesini yaptı',
    });

    try {
      await this.creditRepo.save([refereeCredit, referrerCredit]);
    } catch (err) {
      // Unique constraint violation → already granted concurrently
      if ((err as { code?: string }).code === '23505') return null;
      throw err;
    }

    this.logger.log(
      JSON.stringify({
        event: 'referral_reward_granted',
        referee: refereeUserId,
        referrer: referrerId,
        payment_id: paymentId,
        amount: REFEREE_REWARD_TRY,
      }),
    );

    return {
      refereeCreditId: refereeCredit.id,
      referrerCreditId: referrerCredit.id,
    };
  }

  // ── User-facing summary ───────────────────────────────────

  async getMySummary(userId: string): Promise<ReferralSummary> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.referralCode) {
      throw new BadRequestException('Referral code not assigned');
    }

    const credits = await this.creditRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const invitedCount = await this.userRepo.count({ where: { referredBy: userId } });

    const sum = (status: string) =>
      credits
        .filter((c) => c.status === status)
        .reduce((acc, c) => acc + parseFloat(c.amount), 0)
        .toFixed(2);

    const total = credits
      .reduce((acc, c) => acc + parseFloat(c.amount), 0)
      .toFixed(2);

    return {
      referralCode: user.referralCode,
      invitedCount,
      totalEarnedAmount: total,
      availableAmount: sum('available'),
      usedAmount: sum('used'),
      credits,
    };
  }

  // ── Admin reporting ───────────────────────────────────────

  async adminReport(): Promise<{
    totalReferredUsers: number;
    totalCreditsIssued: number;
    totalCreditsValueTry: string;
    topReferrers: Array<{
      userId: string;
      email: string;
      fullName: string;
      referralCode: string;
      inviteCount: number;
      earnedTry: string;
    }>;
  }> {
    const totalReferredUsers = await this.userRepo
      .createQueryBuilder('u')
      .where('u.referred_by IS NOT NULL')
      .getCount();

    const totalCreditsIssued = await this.creditRepo.count();
    const allCredits = await this.creditRepo.find();
    const totalCreditsValueTry = allCredits
      .reduce((acc, c) => acc + parseFloat(c.amount), 0)
      .toFixed(2);

    const topReferrersRaw = await this.userRepo
      .createQueryBuilder('u')
      .leftJoin('auth.users', 'invited', 'invited.referred_by = u.id')
      .select('u.id', 'userId')
      .addSelect('u.email', 'email')
      .addSelect('u.first_name', 'firstName')
      .addSelect('u.last_name', 'lastName')
      .addSelect('u.referral_code', 'referralCode')
      .addSelect('COUNT(invited.id)', 'inviteCount')
      .where('u.referral_code IS NOT NULL')
      .groupBy('u.id')
      .having('COUNT(invited.id) > 0')
      .orderBy('"inviteCount"', 'DESC')
      .limit(20)
      .getRawMany();

    // For each top referrer, sum their credits
    const topReferrers = await Promise.all(
      topReferrersRaw.map(async (r) => {
        const earned = await this.creditRepo
          .createQueryBuilder('c')
          .select('COALESCE(SUM(c.amount), 0)', 'total')
          .where('c.user_id = :uid', { uid: r.userId })
          .getRawOne<{ total: string }>();
        return {
          userId: r.userId as string,
          email: r.email as string,
          fullName: `${r.firstName} ${r.lastName}`,
          referralCode: r.referralCode as string,
          inviteCount: parseInt(r.inviteCount as string, 10),
          earnedTry: parseFloat(earned?.total ?? '0').toFixed(2),
        };
      }),
    );

    return {
      totalReferredUsers,
      totalCreditsIssued,
      totalCreditsValueTry,
      topReferrers,
    };
  }
}
