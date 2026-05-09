import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { parse } from 'csv-parse';
import * as ExcelJS from 'exceljs';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Parcel } from '../entities/parcel.entity';
import { ImportParcelRowDto } from '../dto/import-parcel-row.dto';
import { AuditLogService } from '../../admin/services/audit-log.service';

export interface ImportResult {
  totalRows: number;
  inserted: number;
  failed: number;
  errors: { row: number; message: string }[];
}

interface ValidatedRow {
  rowNum: number;
  dto: ImportParcelRowDto;
}

@Injectable()
export class ParcelImportService {
  private readonly logger = new Logger(ParcelImportService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Public entry point — auto-detects file type by extension/MIME and parses
   * accordingly. Falls back to CSV if format is unknown.
   */
  async importFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    userId: string,
    dryRun: boolean,
  ): Promise<ImportResult> {
    const lower = filename.toLowerCase();
    const isXlsx =
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xls') ||
      mimeType.includes('spreadsheetml') ||
      mimeType === 'application/vnd.ms-excel';

    if (isXlsx) {
      const records = await this.parseXlsx(buffer);
      return this.importRecords(records, userId, dryRun);
    }
    return this.importCsv(buffer, userId, dryRun);
  }

  async importCsv(
    buffer: Buffer,
    userId: string,
    dryRun: boolean,
  ): Promise<ImportResult> {
    const records = await this.parseCsv(buffer);
    return this.importRecords(records, userId, dryRun);
  }

  private async importRecords(
    records: Record<string, string>[],
    userId: string,
    dryRun: boolean,
  ): Promise<ImportResult> {

    const result: ImportResult = {
      totalRows: records.length,
      inserted: 0,
      failed: 0,
      errors: [],
    };

    if (records.length === 0) return result;

    // ── Phase 1: Validate each row ────────────────────────────────
    const validRows: ValidatedRow[] = [];

    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 2; // 1-indexed + header row
      const dto = plainToInstance(ImportParcelRowDto, records[i]);
      const validationErrors = await validate(dto, { whitelist: true });

      if (validationErrors.length > 0) {
        const msg = validationErrors
          .flatMap((e) => Object.values(e.constraints ?? {}))
          .join('; ');
        result.errors.push({ row: rowNum, message: msg });
        result.failed++;
        continue;
      }
      validRows.push({ rowNum, dto });
    }

    // ── Phase 2: Duplicate parcelNumber within CSV ────────────────
    const seenIds = new Map<string, number>();
    const insertable: ValidatedRow[] = [];

    for (const row of validRows) {
      if (row.dto.parcelNumber) {
        const prev = seenIds.get(row.dto.parcelNumber);
        if (prev !== undefined) {
          result.errors.push({
            row: row.rowNum,
            message: `Duplicate parcelNumber within CSV: "${row.dto.parcelNumber}" (first on row ${prev})`,
          });
          result.failed++;
          continue;
        }
        seenIds.set(row.dto.parcelNumber, row.rowNum);
      }
      insertable.push(row);
    }

    // ── Phase 3: Check existing listing_ids in DB ─────────────────
    const providedIds = insertable
      .filter((r) => r.dto.parcelNumber)
      .map((r) => r.dto.parcelNumber!);

    if (providedIds.length > 0) {
      const existing = await this.dataSource
        .getRepository(Parcel)
        .createQueryBuilder('p')
        .select('p.listingId')
        .where('p.listing_id IN (:...ids)', { ids: providedIds })
        .getMany();

      const existingSet = new Set(existing.map((p) => p.listingId));
      const filtered: ValidatedRow[] = [];

      for (const row of insertable) {
        if (row.dto.parcelNumber && existingSet.has(row.dto.parcelNumber)) {
          result.errors.push({
            row: row.rowNum,
            message: `listing_id already exists: "${row.dto.parcelNumber}"`,
          });
          result.failed++;
        } else {
          filtered.push(row);
        }
      }

      insertable.length = 0;
      insertable.push(...filtered);
    }

    // ── Dry run: stop before inserting ────────────────────────────
    if (dryRun || insertable.length === 0) {
      return result;
    }

    // ── Phase 4: Insert in transaction ────────────────────────────
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      for (const { dto } of insertable) {
        let listingId = dto.parcelNumber;
        if (!listingId) {
          const rows: { nextval: string }[] = await qr.query(
            `SELECT nextval('listings.listing_id_seq')`,
          );
          listingId = `NT-${String(rows[0].nextval).padStart(6, '0')}`;
        }

        const parcel = qr.manager.create(Parcel, {
          listingId,
          title: dto.title,
          city: dto.city,
          district: dto.district,
          areaM2: dto.areaSize || null,
          price: dto.price || null,
          ada: dto.ada || null,
          parsel: dto.parsel || null,
          description: null,
          status: 'draft',
          currency: 'TRY',
          neighborhood: null,
          address: null,
          latitude: null,
          longitude: null,
          zoningStatus: null,
          landType: null,
          isAuctionEligible: false,
          isFeatured: false,
          createdBy: userId,
        });

        await qr.manager.save(Parcel, parcel);
        result.inserted++;
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      result.inserted = 0;
      throw err;
    } finally {
      await qr.release();
    }

    // ── Audit log ─────────────────────────────────────────────────
    await this.auditLogService.record({
      actorId: userId,
      actorRole: 'admin',
      action: 'CSV_IMPORT',
      resourceType: 'parcel',
      resourceId: null,
      newValue: {
        totalRows: result.totalRows,
        inserted: result.inserted,
        failed: result.failed,
      },
    });

    this.logger.log(
      `CSV import by ${userId}: ${result.inserted} inserted, ${result.failed} failed out of ${result.totalRows} rows`,
    );

    return result;
  }

  /**
   * Parse .xlsx / .xls buffer using ExcelJS.
   * First row is treated as header (column names matching ImportParcelRowDto fields).
   * Empty cells are dropped so optional validators behave correctly.
   */
  private async parseXlsx(buffer: Buffer): Promise<Record<string, string>[]> {
    const workbook = new ExcelJS.Workbook();
    try {
      // ExcelJS expects ArrayBuffer-like input
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch (err) {
      throw new BadRequestException(
        `XLSX parse error: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('XLSX has no sheets');

    const records: Record<string, string>[] = [];
    let headers: string[] = [];

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = row.values as Array<unknown>;
      // ExcelJS row.values is 1-indexed; index 0 is undefined
      const cells = values.slice(1).map((v) => this.cellToString(v));

      if (rowNumber === 1) {
        headers = cells.map((c) => c.trim());
        return;
      }

      const record: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        const key = headers[i];
        if (!key) continue;
        const val = cells[i];
        if (val === undefined || val === null || val === '') continue;
        record[key] = val;
      }
      if (Object.keys(record).length > 0) records.push(record);
    });

    return records;
  }

  /** Coerce ExcelJS cell value (string|number|Date|formula|RichText) → string */
  private cellToString(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    // Formula cell: { formula, result }
    if (typeof v === 'object' && v !== null) {
      const obj = v as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
      if (obj.result !== undefined) return this.cellToString(obj.result);
      if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join('');
      if (typeof obj.text === 'string') return obj.text;
    }
    return String(v);
  }

  private parseCsv(buffer: Buffer): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      parse(
        buffer,
        {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true,
          relax_column_count: true,
        },
        (err, records: Record<string, string>[]) => {
          if (err) {
            reject(
              new BadRequestException(`CSV parse error: ${err.message}`),
            );
            return;
          }

          // Strip empty strings so optional validators work correctly
          for (const record of records) {
            for (const key of Object.keys(record)) {
              if (record[key] === '') {
                delete record[key];
              }
            }
          }

          resolve(records);
        },
      );
    });
  }
}
