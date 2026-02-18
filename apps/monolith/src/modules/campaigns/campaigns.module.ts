import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignRule } from './entities/campaign-rule.entity';
import { CampaignAssignment } from './entities/campaign-assignment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      CampaignRule,
      CampaignAssignment,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CampaignsModule {}
