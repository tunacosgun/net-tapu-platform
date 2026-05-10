import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PaymentService } from '../services/payment.service';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { InitiateMailOrderDto } from '../dto/initiate-mail-order.dto';
import { ListPaymentsQueryDto } from '../dto/list-payments-query.dto';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async initiate(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.paymentService.initiate(dto, user.sub);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Query() query: ListPaymentsQueryDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.paymentService.findByUser(user.sub, query);
  }

  @Get('admin/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminList(@Query() query: ListPaymentsQueryDto & { paymentMethod?: string; sortBy?: string; sortOrder?: string }) {
    return this.paymentService.findAllAdmin(query);
  }

  /** Admin-only: initiate a Mail Order / Telephone Order transaction (no 3DS) */
  @Post('admin/mail-order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.CREATED)
  async mailOrder(
    @Body() dto: InitiateMailOrderDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.paymentService.initiateMailOrder(dto, user.sub);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string; roles: string[] },
  ) {
    const payment = await this.paymentService.findById(id);
    if (!user.roles?.includes('admin') && payment.userId !== user.sub) {
      throw new ForbiddenException('You do not have access to this payment');
    }
    return payment;
  }

  @Patch(':id/capture')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async capture(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentService.capture(id);
  }

  @Patch(':id/verify-transfer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async verifyTransfer(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentService.verifyBankTransfer(id);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentService.cancel(id);
  }
}
