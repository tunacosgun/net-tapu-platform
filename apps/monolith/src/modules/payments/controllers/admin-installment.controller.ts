import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { InstallmentService } from '../services/installment.service';
import { CreateInstallmentPlanDto } from '../dto/create-installment-plan.dto';

@Controller('admin/installments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminInstallmentController {
  constructor(private readonly service: InstallmentService) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listAllPlans({
      status,
      userId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post()
  async createPlan(@Body() dto: CreateInstallmentPlanDto) {
    return this.service.createPlan(dto);
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPlanWithInstallments(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ) {
    return this.service.cancelPlan(id, body.reason || 'Admin cancellation');
  }

  /** Manually trigger a charge for a specific installment (admin debug / late payment) */
  @Post('items/:installmentId/charge')
  @HttpCode(HttpStatus.OK)
  async charge(@Param('installmentId', ParseUUIDPipe) installmentId: string) {
    return this.service.processInstallment(installmentId);
  }
}
