import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { EkentService } from '../services/ekent.service';
import { EkentLookupDto, CreateEkentProviderDto } from '../dto/ekent-lookup.dto';

@Controller('integrations/ekent')
export class EkentController {
  constructor(private readonly service: EkentService) {}

  /** Public: resolve E-Kent URL for a parcel — no auth, cached 7d */
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  async lookup(@Body() dto: EkentLookupDto) {
    return this.service.lookup(dto);
  }
}

@Controller('admin/ekent')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminEkentController {
  constructor(private readonly service: EkentService) {}

  @Get('providers')
  async listProviders() {
    return this.service.listProviders();
  }

  @Post('providers')
  async createProvider(@Body() dto: CreateEkentProviderDto) {
    return this.service.createProvider(dto);
  }

  @Patch('providers/:id')
  async updateProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() patch: Partial<CreateEkentProviderDto> & { active?: boolean },
  ) {
    return this.service.updateProvider(id, patch as never);
  }

  @Delete('providers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProvider(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.deleteProvider(id);
  }

  /** Admin can probe a parcel and force re-cache */
  @Post('probe')
  @HttpCode(HttpStatus.OK)
  async probe(@Body() dto: EkentLookupDto) {
    await this.service.invalidateCache(dto.city, dto.district, dto.ada, dto.parsel);
    return this.service.lookup(dto);
  }
}
