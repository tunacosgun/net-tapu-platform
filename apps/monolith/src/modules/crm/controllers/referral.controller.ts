import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReferralService } from '../services/referral.service';

@Controller('referral')
export class ReferralController {
  constructor(private readonly service: ReferralService) {}

  /** Public: validate a referral code (used in register form) */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() body: { code: string }) {
    return this.service.validateCode(body.code ?? '');
  }

  /** Authenticated: my referral code, invited count, credits */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { sub: string }) {
    return this.service.getMySummary(user.sub);
  }
}

@Controller('admin/referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminReferralController {
  constructor(private readonly service: ReferralService) {}

  @Get('report')
  async report() {
    return this.service.adminReport();
  }
}
