import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull } from 'typeorm';
import { EkentProvider } from '../entities/ekent-provider.entity';
import { EkentCache } from '../entities/ekent-cache.entity';
import { ParcelMapData } from '../../listings/entities/parcel-map-data.entity';
import { EkentLookupDto, CreateEkentProviderDto } from '../dto/ekent-lookup.dto';

const CACHE_TTL_HOURS = 24 * 7; // 7 days — URLs change rarely
const FALLBACK_PORTAL = 'https://parselsorgu.tkgm.gov.tr/';

export interface EkentLookupResult {
  found: boolean;
  source: 'cache' | 'provider' | 'manual' | 'fallback';
  resolvedUrl: string;
  providerName: string | null;
  imarData: Record<string, unknown> | null;
  cachedAt: string | null;
}

/**
 * Resolves an E-Kent (Kent Rehberi / Belediye GIS) URL for a parcel.
 *
 * Priority:
 *   1. Manual override in `listings.parcel_map_data.ekent_url` if a parcel exists.
 *   2. Cache hit on (city, district, ada, parsel).
 *   3. Provider URL pattern lookup (city+district, then city only).
 *   4. Fallback to TKGM public parcel lookup.
 *
 * Pattern placeholders: {city} {district} {neighborhood} {ada} {parsel}
 */
@Injectable()
export class EkentService {
  private readonly logger = new Logger(EkentService.name);

  constructor(
    @InjectRepository(EkentProvider)
    private readonly providerRepo: Repository<EkentProvider>,
    @InjectRepository(EkentCache)
    private readonly cacheRepo: Repository<EkentCache>,
    @InjectRepository(ParcelMapData)
    private readonly mapDataRepo: Repository<ParcelMapData>,
  ) {}

  // ── Public lookup ──────────────────────────────────────────

  async lookup(dto: EkentLookupDto): Promise<EkentLookupResult> {
    // 0. Manual override on the parcel itself wins (admin set this explicitly)
    if (dto.manualUrl) {
      await this.upsertCache(dto, dto.manualUrl, null, 'manual');
      return {
        found: true,
        source: 'manual',
        resolvedUrl: dto.manualUrl,
        providerName: 'Manual override',
        imarData: null,
        cachedAt: new Date().toISOString(),
      };
    }

    // 1. Cache
    const cached = await this.cacheRepo.findOne({
      where: {
        city: dto.city,
        district: dto.district,
        ada: dto.ada,
        parsel: dto.parsel,
        expiresAt: MoreThan(new Date()),
      },
    });
    if (cached && cached.resolvedUrl) {
      return {
        found: true,
        source: 'cache',
        resolvedUrl: cached.resolvedUrl,
        providerName: null,
        imarData: cached.imarData,
        cachedAt: cached.fetchedAt.toISOString(),
      };
    }

    // 2. Try provider — district-specific first, then city-wide
    const provider = await this.findProvider(dto.city, dto.district);
    if (provider) {
      const url = this.renderUrl(provider.urlPattern, dto);
      const imarData = provider.imarEndpoint
        ? await this.tryFetchImar(provider, dto)
        : null;
      await this.upsertCache(dto, url, imarData, 'provider');
      this.logger.debug(
        `E-Kent resolved via provider "${provider.name}": ${dto.city}/${dto.district} ${dto.ada}/${dto.parsel}`,
      );
      return {
        found: true,
        source: 'provider',
        resolvedUrl: url,
        providerName: provider.name,
        imarData,
        cachedAt: new Date().toISOString(),
      };
    }

    // 3. Fallback to TKGM public parsel sorgu portal
    const fallback = `${FALLBACK_PORTAL}#${encodeURIComponent(
      `${dto.city}|${dto.district}|${dto.ada}|${dto.parsel}`,
    )}`;
    await this.upsertCache(dto, fallback, null, 'fallback');
    return {
      found: false,
      source: 'fallback',
      resolvedUrl: fallback,
      providerName: 'TKGM Parsel Sorgu (genel)',
      imarData: null,
      cachedAt: new Date().toISOString(),
    };
  }

  /**
   * Hook called after parcel creation/update.
   * Sets parcel_map_data.ekent_url for the given parcel.
   */
  async populateForParcel(
    parcelId: string,
    city: string,
    district: string,
    ada: string,
    parsel: string,
    neighborhood?: string,
  ): Promise<string | null> {
    if (!city || !district || !ada || !parsel) return null;
    try {
      const result = await this.lookup({
        city,
        district,
        ada,
        parsel,
        neighborhood,
      });

      let mapData = await this.mapDataRepo.findOne({ where: { parcelId } });
      if (!mapData) {
        mapData = this.mapDataRepo.create({ parcelId, ekentUrl: result.resolvedUrl });
      } else {
        // Don't overwrite a manually-set URL
        if (mapData.ekentUrl && result.source !== 'manual') {
          return mapData.ekentUrl;
        }
        mapData.ekentUrl = result.resolvedUrl;
      }
      mapData.lastSyncedAt = new Date();
      await this.mapDataRepo.save(mapData);
      return result.resolvedUrl;
    } catch (err) {
      this.logger.warn(
        `populateForParcel failed for ${parcelId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async invalidateCache(
    city: string,
    district: string,
    ada: string,
    parsel: string,
  ): Promise<number> {
    const result = await this.cacheRepo.delete({ city, district, ada, parsel });
    return result.affected ?? 0;
  }

  // ── Provider CRUD (admin) ──────────────────────────────────

  async listProviders(): Promise<EkentProvider[]> {
    return this.providerRepo.find({ order: { city: 'ASC', district: 'ASC' } });
  }

  async createProvider(dto: CreateEkentProviderDto): Promise<EkentProvider> {
    const provider = this.providerRepo.create({
      city: dto.city,
      district: dto.district ?? null,
      name: dto.name,
      urlPattern: dto.urlPattern,
      imarEndpoint: dto.imarEndpoint ?? null,
      notes: dto.notes ?? null,
      active: true,
    });
    return this.providerRepo.save(provider);
  }

  async updateProvider(id: string, patch: Partial<EkentProvider>): Promise<EkentProvider> {
    const existing = await this.providerRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Provider not found');
    Object.assign(existing, patch);
    return this.providerRepo.save(existing);
  }

  async deleteProvider(id: string): Promise<void> {
    await this.providerRepo.delete({ id });
  }

  // ── Internal ───────────────────────────────────────────────

  private async findProvider(
    city: string,
    district: string,
  ): Promise<EkentProvider | null> {
    // 1. Exact match (city + district)
    const exact = await this.providerRepo.findOne({
      where: { city, district, active: true },
    });
    if (exact) return exact;

    // 2. City-wide match (district = NULL)
    const cityWide = await this.providerRepo.findOne({
      where: { city, district: IsNull(), active: true },
    });
    return cityWide ?? null;
  }

  private renderUrl(pattern: string, dto: EkentLookupDto): string {
    return pattern
      .replace(/\{city\}/g, encodeURIComponent(dto.city))
      .replace(/\{district\}/g, encodeURIComponent(dto.district))
      .replace(/\{neighborhood\}/g, encodeURIComponent(dto.neighborhood ?? ''))
      .replace(/\{ada\}/g, encodeURIComponent(dto.ada))
      .replace(/\{parsel\}/g, encodeURIComponent(dto.parsel));
  }

  private async tryFetchImar(
    provider: EkentProvider,
    dto: EkentLookupDto,
  ): Promise<Record<string, unknown> | null> {
    if (!provider.imarEndpoint) return null;
    try {
      const url = this.renderUrl(provider.imarEndpoint, dto);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'NetTapu/1.0' },
        });
        if (!res.ok) return null;
        return (await res.json()) as Record<string, unknown>;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      this.logger.debug(
        `Imar fetch failed for ${provider.name}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async upsertCache(
    dto: EkentLookupDto,
    url: string,
    imarData: Record<string, unknown> | null,
    source: 'provider' | 'manual' | 'fallback',
  ) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);

    const existing = await this.cacheRepo.findOne({
      where: {
        city: dto.city,
        district: dto.district,
        ada: dto.ada,
        parsel: dto.parsel,
      },
    });

    if (existing) {
      existing.resolvedUrl = url;
      existing.imarData = imarData;
      existing.source = source;
      existing.fetchedAt = now;
      existing.expiresAt = expiresAt;
      await this.cacheRepo.save(existing);
      return;
    }

    const fresh = this.cacheRepo.create({
      city: dto.city,
      district: dto.district,
      ada: dto.ada,
      parsel: dto.parsel,
      resolvedUrl: url,
      imarData,
      source,
      fetchedAt: now,
      expiresAt,
    });
    await this.cacheRepo.save(fresh);
  }
}
