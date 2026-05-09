import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParcelService } from './parcel.service';
import PDFDocument = require('pdfkit');
import QRCode = require('qrcode');
import { Parcel } from '../entities/parcel.entity';

const PRIMARY = '#3F4F2C';      // brand olive
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const TEXT = '#111827';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  deposit_taken: 'Depozito Alındı',
  sold: 'Satıldı',
  withdrawn: 'Geri Çekildi',
  reserved: 'Ayırtıldı',
};

/**
 * Generates a per-parcel PDF: logo header + watermark + structured detail
 * table + QR code linking back to the public parcel page.
 *
 * Uses PDFKit (no headless chrome) for small Docker footprint.
 */
@Injectable()
export class ParcelPdfService {
  private readonly logger = new Logger(ParcelPdfService.name);

  constructor(
    private readonly parcelService: ParcelService,
    private readonly config: ConfigService,
  ) {}

  async generate(parcelId: string): Promise<Buffer> {
    const parcel = await this.parcelService.findById(parcelId);
    if (!parcel) throw new NotFoundException('Parcel not found');

    const siteUrl =
      this.config.get<string>('PUBLIC_SITE_URL') ||
      'https://nettapu.com';
    const parcelUrl = `${siteUrl}/parcels/${parcel.id}`;
    const qrPng = await QRCode.toBuffer(parcelUrl, {
      width: 120,
      margin: 0,
      color: { dark: TEXT, light: '#FFFFFF' },
    });

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `${parcel.title} — NetTapu`,
        Author: 'NetTapu',
        Subject: `Parsel ${parcel.listingId}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.drawWatermark(doc);
    this.drawHeader(doc, parcel, parcelUrl);
    this.drawDetailTable(doc, parcel);
    this.drawDescription(doc, parcel);
    this.drawFooter(doc, qrPng, parcelUrl);

    doc.end();
    return finished;
  }

  // ── Sections ──────────────────────────────────────────────

  private drawWatermark(doc: PDFKit.PDFDocument) {
    doc.save();
    doc
      .fillColor(PRIMARY)
      .opacity(0.07)
      .fontSize(96)
      .text('NETTAPU', 0, 380, {
        width: doc.page.width,
        align: 'center',
      });
    doc.restore();
  }

  private drawHeader(doc: PDFKit.PDFDocument, parcel: Parcel, parcelUrl: string) {
    const x = doc.page.margins.left;
    let y = doc.page.margins.top;

    // Logo monogram (NT)
    doc.save();
    doc.roundedRect(x, y, 36, 36, 6).fill(PRIMARY);
    doc
      .fillColor('#FFFFFF')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('NT', x, y + 11, { width: 36, align: 'center' });
    doc.restore();

    // Brand text
    doc
      .fillColor(TEXT)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('NetTapu', x + 46, y + 4);
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .font('Helvetica')
      .text('Arsa & Gayrimenkul Açık Artırma Platformu', x + 46, y + 22);

    // Listing ID + status (right side)
    const rightX = doc.page.width - doc.page.margins.right;
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text('İlan No', rightX - 120, y + 2, { width: 120, align: 'right' });
    doc
      .fillColor(TEXT)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(parcel.listingId, rightX - 120, y + 14, {
        width: 120,
        align: 'right',
      });

    y += 50;

    // Title
    doc
      .fillColor(TEXT)
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(parcel.title, x, y, { width: doc.page.width - x - doc.page.margins.right });
    y = doc.y + 4;

    // Location line
    const location = [parcel.neighborhood, parcel.district, parcel.city]
      .filter(Boolean)
      .join(' / ');
    doc
      .fillColor(MUTED)
      .fontSize(11)
      .font('Helvetica')
      .text(location, x, y);

    y = doc.y + 6;

    // Status pill
    const statusLabel = STATUS_LABEL[parcel.status] || parcel.status;
    doc.save();
    doc
      .roundedRect(x, y, 90, 18, 9)
      .fillColor(this.statusColor(parcel.status))
      .fill();
    doc
      .fillColor('#FFFFFF')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(statusLabel, x, y + 5, { width: 90, align: 'center' });
    doc.restore();

    doc.moveTo(x, y + 30)
      .lineTo(doc.page.width - doc.page.margins.right, y + 30)
      .strokeColor(BORDER)
      .lineWidth(1)
      .stroke();

    doc.y = y + 40;
  }

  private drawDetailTable(doc: PDFKit.PDFDocument, parcel: Parcel) {
    const x = doc.page.margins.left;
    let y = doc.y;

    doc
      .fillColor(TEXT)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('Parsel Bilgileri', x, y);
    y = doc.y + 8;

    const rows: Array<[string, string]> = [
      ['Şehir', parcel.city],
      ['İlçe', parcel.district],
      ['Mahalle', parcel.neighborhood ?? '—'],
      ['Ada', parcel.ada ?? '—'],
      ['Parsel', parcel.parsel ?? '—'],
      ['Alan', parcel.areaM2 ? `${this.fmtNumber(parcel.areaM2)} m²` : '—'],
      ['İmar Durumu', parcel.zoningStatus ?? '—'],
      ['Arazi Tipi', parcel.landType ?? '—'],
      ['Tapu Tipi', parcel.deedType ?? '—'],
      ['Yola Cephe', parcel.roadAccess ?? '—'],
      ['Fiyat', parcel.price ? `${this.fmtPrice(parcel.price)} ${parcel.currency}` : '—'],
      ['m² Fiyatı', parcel.pricePerM2 ? `${this.fmtPrice(parcel.pricePerM2)} ${parcel.currency}/m²` : '—'],
      ['KDV', parcel.vatRate ? `%${parcel.vatRate}` : '—'],
      ['İhaleye Uygun', parcel.isAuctionEligible ? 'Evet' : 'Hayır'],
      ['Köşe Parseli', parcel.isCornerParcel ? 'Evet' : 'Hayır'],
    ];

    if (parcel.latitude && parcel.longitude) {
      rows.push(['Koordinat', `${parcel.latitude}, ${parcel.longitude}`]);
    }

    const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
    const cellH = 22;

    rows.forEach(([label, value], idx) => {
      const isLeft = idx % 2 === 0;
      const cellX = isLeft ? x : x + colW;
      const cellY = y + Math.floor(idx / 2) * cellH;

      doc.save();
      if (idx % 4 < 2) {
        doc.rect(cellX, cellY, colW, cellH).fillColor('#F9FAFB').fill();
      }
      doc.restore();

      doc
        .fillColor(MUTED)
        .fontSize(8)
        .font('Helvetica')
        .text(label.toUpperCase(), cellX + 8, cellY + 3, {
          width: colW - 16,
          continued: false,
        });
      doc
        .fillColor(TEXT)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(value, cellX + 8, cellY + 11, {
          width: colW - 16,
          height: cellH - 12,
          ellipsis: true,
        });
    });

    const tableEnd = y + Math.ceil(rows.length / 2) * cellH;
    doc.moveTo(x, tableEnd + 10)
      .lineTo(doc.page.width - doc.page.margins.right, tableEnd + 10)
      .strokeColor(BORDER)
      .lineWidth(1)
      .stroke();

    doc.y = tableEnd + 20;
  }

  private drawDescription(doc: PDFKit.PDFDocument, parcel: Parcel) {
    if (!parcel.description) return;
    const x = doc.page.margins.left;
    const w = doc.page.width - x - doc.page.margins.right;

    doc
      .fillColor(TEXT)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('Açıklama', x, doc.y);

    doc
      .fillColor(TEXT)
      .fontSize(10)
      .font('Helvetica')
      .text(parcel.description, x, doc.y + 6, {
        width: w,
        align: 'justify',
      });

    doc.moveDown(1);
  }

  private drawFooter(doc: PDFKit.PDFDocument, qrPng: Buffer, parcelUrl: string) {
    const footerY = doc.page.height - doc.page.margins.bottom - 90;
    const x = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc
      .moveTo(x, footerY)
      .lineTo(right, footerY)
      .strokeColor(BORDER)
      .lineWidth(1)
      .stroke();

    // QR code (bottom-right)
    doc.image(qrPng, right - 70, footerY + 12, { width: 70, height: 70 });

    // Bottom-left text
    const date = new Date().toLocaleString('tr-TR', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .font('Helvetica')
      .text('Detaylı bilgi ve canlı ihale için:', x, footerY + 14)
      .fillColor(PRIMARY)
      .font('Helvetica-Bold')
      .text(parcelUrl, x, footerY + 28, { link: parcelUrl, underline: true })
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(`Oluşturma: ${date}`, x, footerY + 50)
      .text(
        'Bu belge bilgilendirme amaçlıdır; resmi tapu kayıtları TKGM üzerinden teyit edilmelidir.',
        x,
        footerY + 64,
        { width: right - x - 90 },
      );
  }

  // ── Helpers ───────────────────────────────────────────────

  private statusColor(status: string): string {
    switch (status) {
      case 'active':
        return '#16A34A';
      case 'sold':
        return '#DC2626';
      case 'deposit_taken':
        return '#D97706';
      case 'reserved':
        return '#7C3AED';
      case 'withdrawn':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  }

  private fmtPrice(v: string | null | undefined): string {
    if (!v) return '0';
    const n = parseFloat(v);
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n);
  }

  private fmtNumber(v: string | null | undefined): string {
    if (!v) return '0';
    const n = parseFloat(v);
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n);
  }
}
