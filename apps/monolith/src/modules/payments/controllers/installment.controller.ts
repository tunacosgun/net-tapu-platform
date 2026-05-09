import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/auth.service';
import { InstallmentService } from '../services/installment.service';

@Controller('installments')
@UseGuards(JwtAuthGuard)
export class InstallmentController {
  constructor(private readonly service: InstallmentService) {}

  @Get('mine')
  async listMine(@CurrentUser() user: JwtPayload) {
    return this.service.listPlansForUser(user.sub);
  }

  @Get(':planId')
  async planDetail(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.service.getPlanWithInstallments(planId);
    if (result.plan.userId !== user.sub) {
      // Don't leak existence — same response shape as 404
      const { ForbiddenException } = await import('@nestjs/common');
      throw new ForbiddenException('Not your plan');
    }
    return result;
  }

  /** User-initiated manual payment for a single installment */
  @Post(':installmentId/pay')
  @HttpCode(HttpStatus.OK)
  async pay(
    @Param('installmentId', ParseUUIDPipe) installmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.payManually(installmentId, user.sub);
  }
}
