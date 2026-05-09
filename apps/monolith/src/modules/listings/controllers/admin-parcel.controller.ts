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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/auth.service';
import { ParcelService } from '../services/parcel.service';
import { ParcelImportService } from '../services/parcel-import.service';
import { ImageProcessingService } from '../services/image-processing.service';
import { ParcelImage } from '../entities/parcel-image.entity';
import { ListParcelsQueryDto } from '../dto/list-parcels-query.dto';
import { UpdateParcelDto } from '../dto/update-parcel.dto';
import { UpdateParcelStatusDto } from '../dto/update-parcel-status.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Parcel } from '../entities/parcel.entity';

@Controller('admin/parcels')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminParcelController {
  constructor(
    private readonly parcelService: ParcelService,
    private readonly importService: ParcelImportService,
    private readonly imageProcessingService: ImageProcessingService,
    @InjectRepository(Parcel)
    private readonly parcelRepo: Repository<Parcel>,
    @InjectRepository(ParcelImage)
    private readonly imageRepo: Repository<ParcelImage>,
  ) {}

  /** List all parcels (admin view — includes drafts, withdrawn, etc.) */
  @Get()
  async findAll(@Query() query: ListParcelsQueryDto) {
    return this.parcelService.findAll(query);
  }

  /** Export parcels — `?format=csv` (default, BOM'lu) or `?format=xlsx` (native Excel) */
  @Get('export')
  async exportParcels(
    @Res() res: Response,
    @Query('format') format?: string,
  ) {
    const parcels = await this.parcelRepo.find({
      order: { createdAt: 'DESC' },
      take: 10000,
    });

    const headerKeys = [
      'listing_id', 'title', 'status', 'city', 'district', 'neighborhood',
      'ada', 'parsel', 'area_m2', 'price', 'currency', 'price_per_m2',
      'zoning_status', 'land_type', 'latitude', 'longitude',
      'is_featured', 'is_auction_eligible', 'created_at',
    ] as const;

    const headerLabels: Record<typeof headerKeys[number], string> = {
      listing_id: 'İlan No',
      title: 'Başlık',
      status: 'Durum',
      city: 'İl',
      district: 'İlçe',
      neighborhood: 'Mahalle',
      ada: 'Ada',
      parsel: 'Parsel',
      area_m2: 'Alan (m²)',
      price: 'Fiyat',
      currency: 'Para Birimi',
      price_per_m2: 'm² Fiyatı',
      zoning_status: 'İmar Durumu',
      land_type: 'Arazi Tipi',
      latitude: 'Enlem',
      longitude: 'Boylam',
      is_featured: 'Öne Çıkan',
      is_auction_eligible: 'İhaleye Uygun',
      created_at: 'Oluşturma Tarihi',
    };

    const rowFor = (p: Parcel): Record<string, string | number | boolean> => ({
      listing_id: p.listingId,
      title: p.title || '',
      status: p.status,
      city: p.city,
      district: p.district,
      neighborhood: p.neighborhood || '',
      ada: p.ada || '',
      parsel: p.parsel || '',
      area_m2: p.areaM2 ? Number(p.areaM2) : '',
      price: p.price ? Number(p.price) : '',
      currency: p.currency,
      price_per_m2: p.pricePerM2 ? Number(p.pricePerM2) : '',
      zoning_status: p.zoningStatus || '',
      land_type: p.landType || '',
      latitude: p.latitude || '',
      longitude: p.longitude || '',
      is_featured: p.isFeatured,
      is_auction_eligible: p.isAuctionEligible,
      created_at: p.createdAt?.toISOString() || '',
    });

    const today = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx') {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'NetTapu Admin';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet('Arsalar', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      sheet.columns = headerKeys.map((k) => ({
        header: headerLabels[k],
        key: k,
        width: Math.max(12, headerLabels[k].length + 4),
      }));

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      };

      for (const p of parcels) {
        sheet.addRow(rowFor(p));
      }

      sheet.getColumn('price').numFmt = '#,##0.00';
      sheet.getColumn('price_per_m2').numFmt = '#,##0.00';
      sheet.getColumn('area_m2').numFmt = '#,##0.00';

      const buffer = await workbook.xlsx.writeBuffer();
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="parcels-export-${today}.xlsx"`,
      });
      res.end(Buffer.from(buffer));
      return;
    }

    // Default: CSV with BOM (Excel-friendly Turkish chars)
    const csvRows = [headerKeys.map((k) => headerLabels[k]).join(',')];
    for (const p of parcels) {
      const row = rowFor(p);
      const cells = headerKeys.map((k) => {
        const v = row[k];
        if (v === null || v === undefined || v === '') return '';
        const s = typeof v === 'string' ? v : String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      });
      csvRows.push(cells.join(','));
    }
    const csv = csvRows.join('\n');
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="parcels-export-${today}.csv"`,
    });
    res.send('﻿' + csv);
  }

  /** Bulk price adjustment (percentage-based) */
  @Post('bulk-price-update')
  @HttpCode(HttpStatus.OK)
  async bulkPriceUpdate(
    @Body()
    body: {
      percentage: number;
      filters?: { city?: string; district?: string; status?: string };
    },
    @CurrentUser() user: JwtPayload,
  ) {
    if (typeof body.percentage !== 'number' || body.percentage === 0) {
      throw new BadRequestException('percentage must be a non-zero number');
    }
    if (Math.abs(body.percentage) > 50) {
      throw new BadRequestException('Percentage change cannot exceed ±50%');
    }

    const qb = this.parcelRepo.createQueryBuilder('p');
    qb.where('p.price IS NOT NULL');

    if (body.filters?.city) {
      qb.andWhere('p.city = :city', { city: body.filters.city });
    }
    if (body.filters?.district) {
      qb.andWhere('p.district = :district', { district: body.filters.district });
    }
    if (body.filters?.status) {
      qb.andWhere('p.status = :status', { status: body.filters.status });
    }

    const parcels = await qb.getMany();
    const multiplier = 1 + body.percentage / 100;
    let updated = 0;

    for (const parcel of parcels) {
      if (parcel.price) {
        const oldPrice = parseFloat(parcel.price as any);
        const newPrice = Math.round(oldPrice * multiplier * 100) / 100;
        await this.parcelRepo.update(parcel.id, {
          price: newPrice as any,
          pricePerM2: parcel.areaM2
            ? (Math.round((newPrice / parseFloat(parcel.areaM2 as any)) * 100) / 100) as any
            : parcel.pricePerM2,
        });
        updated++;
      }
    }

    return {
      message: `${updated} parsel fiyatı güncellendi`,
      totalMatched: parcels.length,
      totalUpdated: updated,
      percentage: body.percentage,
    };
  }

  /** Reprocess all images (regenerate watermarks + thumbnails) */
  @Post('reprocess-images')
  @HttpCode(HttpStatus.OK)
  async reprocessImages() {
    const images = await this.imageRepo.find({ where: { status: 'ready' as any } });
    let success = 0;
    let failed = 0;
    for (const img of images) {
      try {
        await this.imageProcessingService.processImage(img.id);
        success++;
      } catch {
        failed++;
      }
    }
    return { message: `${success} image reprocessed, ${failed} failed`, total: images.length, success, failed };
  }

  /** Get a single parcel by ID */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.parcelService.findById(id);
  }

  /** Update parcel fields */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParcelDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.parcelService.update(id, dto, user.sub);
  }

  /** Update parcel status */
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParcelStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.parcelService.updateStatus(id, dto, user.sub);
  }

  /** Import parcels from CSV / XLSX / XLS */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  async importParcels(
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRunStr?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!file) {
      throw new BadRequestException('Parcel file is required (CSV / XLSX / XLS)');
    }

    const lower = file.originalname.toLowerCase();
    const isCsv = lower.endsWith('.csv');
    const isXlsx = lower.endsWith('.xlsx') || lower.endsWith('.xls');
    const mimeOk =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype.includes('spreadsheetml') ||
      file.mimetype === 'application/octet-stream'; // some browsers send this for xlsx
    if (!isCsv && !isXlsx && !mimeOk) {
      throw new BadRequestException(
        'Only CSV, XLSX or XLS files are accepted',
      );
    }

    const dryRun = dryRunStr === 'true';
    return this.importService.importFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      user!.sub,
      dryRun,
    );
  }
}
