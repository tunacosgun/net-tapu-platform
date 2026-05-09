import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/auth.service';
import { ParcelService } from '../services/parcel.service';
import { ParcelPdfService } from '../services/parcel-pdf.service';
import { ViewerCountService } from '../services/viewer-count.service';
import { CreateParcelDto } from '../dto/create-parcel.dto';
import { UpdateParcelDto } from '../dto/update-parcel.dto';
import { UpdateParcelStatusDto } from '../dto/update-parcel-status.dto';
import { ListParcelsQueryDto } from '../dto/list-parcels-query.dto';

@Controller('parcels')
export class ParcelController {
  constructor(
    private readonly parcelService: ParcelService,
    private readonly viewerCountService: ViewerCountService,
    private readonly pdfService: ParcelPdfService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'consultant')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateParcelDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.parcelService.create(dto, user.sub);
  }

  @Get()
  async findAll(@Query() query: ListParcelsQueryDto) {
    return this.parcelService.findAll(query);
  }

  @Get('featured')
  async findFeatured() {
    return this.parcelService.findAll({
      isFeatured: true,
      status: 'active' as any,
      limit: 12,
      page: 1,
    });
  }

  @Get('stats/by-city')
  async statsByCity() {
    return this.parcelService.getStatsByCity();
  }

  @Get('stats/by-district')
  async statsByDistrict(@Query('city') city: string) {
    if (!city) return [];
    return this.parcelService.getStatsByDistrict(city);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const parcel = await this.parcelService.findById(id);
    // Populate live viewer count from Redis
    parcel.viewerCount = await this.viewerCountService.getActiveViewerCount(id);
    return parcel;
  }

  /** Public PDF export for a parcel — logo, watermark, detail table, QR code */
  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generate(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="parsel-${id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    });
    res.end(buffer);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'consultant')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParcelDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.parcelService.update(id, dto, user.sub);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'consultant')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParcelStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.parcelService.updateStatus(id, dto, user.sub);
  }
}
