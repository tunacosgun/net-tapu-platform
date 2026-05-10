'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '@/lib/api-client';
import { formatPrice, resolveImageUrl } from '@/lib/format';
import { useCompareStore } from '@/stores/compare-store';
import { CompareBar, CompareModal } from '@/components/parcel-compare';
import { ParcelDetailModal } from '@/components/parcel-detail-modal';
import {
  Search, LayoutGrid, List, Map as MapIcon, MapPin, X, SlidersHorizontal,
  Heart, ChevronDown, ChevronUp, ArrowUpDown, Sparkles, TrendingUp,
  Calendar, Maximize2, Building2, Filter, Check, History, Layers,
} from 'lucide-react';
import { useRecentSearches } from '@/hooks/use-recent-searches';
import { TkgmParselSorgula } from '@/components/tkgm-parsel-sorgula';
import type { Parcel, PaginatedResponse } from '@/types';

const ParcelMapLazy = dynamic(() => import('@/components/parcel-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center bg-slate-50 rounded-xl h-[600px]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-slate-200 border-t-emerald-600" />
        <span className="text-sm text-slate-500 font-medium">Harita yükleniyor...</span>
      </div>
    </div>
  ),
});

type ViewMode = 'grid' | 'list' | 'map';

const SORT_OPTIONS = [
  { value: 'createdAt-DESC', label: 'En Yeni' },
  { value: 'createdAt-ASC', label: 'En Eski' },
  { value: 'price-ASC', label: 'Fiyat: Düşük → Yüksek' },
  { value: 'price-DESC', label: 'Fiyat: Yüksek → Düşük' },
  { value: 'area-DESC', label: 'Alan: Büyük → Küçük' },
  { value: 'area-ASC', label: 'Alan: Küçük → Büyük' },
];

const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Antalya', 'Muğla', 'Aydın', 'Balıkesir', 'Çanakkale'];

export default function ParcelsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ParcelsContent />
    </Suspense>
  );
}

function ParcelsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL params
  const page = Number(searchParams.get('page') || '1');
  const city = searchParams.get('city') || '';
  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || 'active';
  const viewParam = searchParams.get('view') || 'grid';
  const sortParam = searchParams.get('sort') || 'createdAt-DESC';

  // State
  const [data, setData] = useState<PaginatedResponse<Parcel> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(search);
  const [viewMode, setViewMode] = useState<ViewMode>(viewParam as ViewMode);
  const [showFilters, setShowFilters] = useState(true);
  const [modalParcelId, setModalParcelId] = useState<string | null>(searchParams.get('parcel'));

  const { searches: recentSearches, save: saveSearch, remove: removeSearch, clear: clearSearches } = useRecentSearches();
  const [searchFocused, setSearchFocused] = useState(false);
  const [showTkgm, setShowTkgm] = useState(false);

  // Filter state
  const [selectedCity, setSelectedCity] = useState(city);
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [areaRange, setAreaRange] = useState({ min: '', max: '' });
  const [isFeatured, setIsFeatured] = useState(false);
  const [zoningFilter, setZoningFilter] = useState(searchParams.get('zoning') || '');
  const [roadFilter, setRoadFilter] = useState(searchParams.get('road') || '');

  const fetchParcels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sortBy, sortOrder] = sortParam.split('-');
      const params: Record<string, string | number> = {
        page,
        limit: viewMode === 'map' ? 100 : 12,
        sortBy,
        sortOrder,
      };
      
      if (statusFilter) params.status = statusFilter;
      if (selectedCity) params.city = selectedCity;
      if (search) params.search = search;
      if (isFeatured) params.isFeatured = 'true';
      if (priceRange.min) params.minPrice = priceRange.min;
      if (priceRange.max) params.maxPrice = priceRange.max;
      if (areaRange.min) params.minArea = areaRange.min;
      if (areaRange.max) params.maxArea = areaRange.max;
      if (zoningFilter) params.zoningStatus = zoningFilter;
      if (roadFilter) params.roadAccess = roadFilter;

      const { data: res } = await apiClient.get<PaginatedResponse<Parcel>>('/parcels', { params });
      setData(res);
    } catch {
      setError('Arsalar yüklenemedi. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [page, selectedCity, search, statusFilter, viewMode, sortParam, isFeatured, priceRange, areaRange, zoningFilter, roadFilter]);

  useEffect(() => { fetchParcels(); }, [fetchParcels]);

  function updateSearchParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.push(`/parcels?${params.toString()}`, { scroll: false });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchInput.trim()) saveSearch(searchInput.trim());
    updateSearchParams({ search: searchInput, page: '1' });
  }

  function handleRecentSearchClick(q: string) {
    setSearchInput(q);
    saveSearch(q);
    setSearchFocused(false);
    updateSearchParams({ search: q, page: '1' });
  }

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    updateSearchParams({ view: mode, page: '1' });
  }

  function handleSortChange(value: string) {
    updateSearchParams({ sort: value, page: '1' });
  }

  function handleCityFilter(cityName: string) {
    setSelectedCity(cityName === selectedCity ? '' : cityName);
    updateSearchParams({ city: cityName === selectedCity ? '' : cityName, page: '1' });
  }

  function clearAllFilters() {
    setSelectedCity('');
    setPriceRange({ min: '', max: '' });
    setAreaRange({ min: '', max: '' });
    setIsFeatured(false);
    setZoningFilter('');
    setRoadFilter('');
    router.push('/parcels?status=active');
  }

  const activeFilterCount = [
    selectedCity,
    priceRange.min,
    priceRange.max,
    areaRange.min,
    areaRange.max,
    isFeatured,
    zoningFilter,
    roadFilter,
  ].filter(Boolean).length;

  return (
    <>
      <TkgmParselSorgula open={showTkgm} onClose={() => setShowTkgm(false)} />
      <div className="min-h-screen bg-slate-50">
        
        {/* ═══════════════════════════════════════════════════════════════
            HEADER BAR - Search, View Toggle, Sort
            ═══════════════════════════════════════════════════════════════ */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
              
              {/* Search bar */}
              <form onSubmit={handleSearch} className="flex-1 max-w-2xl relative">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="İl, ilçe, ada/parsel veya ilan no ile arayın..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    data-testid="parcels-search-input"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => { setSearchInput(''); updateSearchParams({ search: '' }); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>

                {/* Recent searches dropdown */}
                {searchFocused && !searchInput && recentSearches.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <History className="h-3.5 w-3.5" />
                        Son Aramalar
                      </span>
                      <button type="button" onClick={clearSearches} className="text-xs text-slate-400 hover:text-slate-600">Temizle</button>
                    </div>
                    {recentSearches.map((q) => (
                      <div key={q} className="flex items-center group hover:bg-slate-50">
                        <button
                          type="button"
                          onClick={() => handleRecentSearchClick(q)}
                          className="flex-1 flex items-center gap-3 px-4 py-3 text-sm text-slate-700 text-left"
                        >
                          <Search className="h-4 w-4 text-slate-400 shrink-0" />
                          {q}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSearch(q)}
                          className="pr-4 p-1 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </form>

              {/* Right controls */}
              <div className="flex items-center gap-3">
                
                {/* Filter toggle (mobile) */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                  data-testid="toggle-filters-button"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtreler
                  {activeFilterCount > 0 && (
                    <span className="ml-1 px-2 py-0.5 bg-emerald-600 text-white text-xs rounded-full font-semibold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* View toggle */}
                <div className="flex items-center bg-slate-100 rounded-lg p-1" data-testid="view-toggle" data-tour="parcels-map-toggle">
                  <button
                    onClick={() => handleViewChange('grid')}
                    className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                    title="Grid görünümü"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleViewChange('list')}
                    className={`p-2 rounded ${viewMode === 'list' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                    title="Liste görünümü"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleViewChange('map')}
                    className={`p-2 rounded ${viewMode === 'map' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                    title="Harita görünümü"
                  >
                    <MapIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Sort dropdown */}
                <select
                  value={sortParam}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  data-testid="sort-select"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {/* TKGM Parsel Sorgula button */}
                <button
                  onClick={() => setShowTkgm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                  title="TKGM Parsel Sorgulama"
                >
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">Parsel Sorgula</span>
                </button>
              </div>
            </div>

            {/* Active filters pills */}
            {activeFilterCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-500 font-medium">Aktif Filtreler:</span>
                {selectedCity && (
                  <FilterPill label={selectedCity} onRemove={() => handleCityFilter(selectedCity)} />
                )}
                {priceRange.min && (
                  <FilterPill label={`Min: ${formatPrice(String(priceRange.min))}`} onRemove={() => setPriceRange({ ...priceRange, min: '' })} />
                )}
                {priceRange.max && (
                  <FilterPill label={`Max: ${formatPrice(String(priceRange.max))}`} onRemove={() => setPriceRange({ ...priceRange, max: '' })} />
                )}
                {isFeatured && (
                  <FilterPill label="Öne Çıkan" onRemove={() => setIsFeatured(false)} />
                )}
                {zoningFilter && (
                  <FilterPill label={`İmar: ${zoningFilter}`} onRemove={() => setZoningFilter('')} />
                )}
                {roadFilter && (
                  <FilterPill label={roadFilter === 'yes' ? 'Yolu Var' : 'Yolu Yok'} onRemove={() => setRoadFilter('')} />
                )}
                <button
                  onClick={clearAllFilters}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-semibold"
                >
                  Tümünü Temizle
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            MAIN CONTENT - Sidebar + Results
            ═══════════════════════════════════════════════════════════════ */}
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row gap-6">
            
            {/* ─── FILTER SIDEBAR ─── */}
            <AnimatePresence>
              {showFilters && (
                <motion.aside
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="lg:w-80 shrink-0"
                  data-testid="filter-sidebar"
                  data-tour="parcels-filter"
                >
                  <div className="sticky top-24 bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6 space-y-6">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                      <h2 className="text-lg font-heading font-bold text-slate-900 flex items-center gap-2">
                        <Filter className="h-5 w-5 text-emerald-600" />
                        Filtrele
                      </h2>
                      {activeFilterCount > 0 && (
                        <button
                          onClick={clearAllFilters}
                          className="text-sm text-emerald-600 hover:text-emerald-700 font-semibold"
                        >
                          Temizle
                        </button>
                      )}
                    </div>

                    {/* Featured toggle */}
                    <FilterSection title="Özellikler">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`relative w-5 h-5 rounded border-2 transition-all ${isFeatured ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 group-hover:border-emerald-400'}`}>
                          {isFeatured && <Check className="absolute inset-0 h-5 w-5 text-white" strokeWidth={3} />}
                        </div>
                        <input
                          type="checkbox"
                          checked={isFeatured}
                          onChange={(e) => setIsFeatured(e.target.checked)}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                          Sadece Öne Çıkanlar
                        </span>
                      </label>
                    </FilterSection>

                    {/* City filter */}
                    <FilterSection title="Şehir">
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {CITIES.map((cityName) => (
                          <button
                            key={cityName}
                            onClick={() => handleCityFilter(cityName)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              selectedCity === cityName
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                            }`}
                            data-testid={`city-filter-${cityName}`}
                          >
                            <span className="flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              {cityName}
                            </span>
                            {selectedCity === cityName && <Check className="h-4 w-4" />}
                          </button>
                        ))}
                      </div>
                    </FilterSection>

                    {/* Price range */}
                    <FilterSection title="Fiyat Aralığı">
                      <div className="space-y-3">
                        <input
                          type="number"
                          placeholder="Min (₺)"
                          value={priceRange.min}
                          onChange={(e) => setPriceRange({ ...priceRange, min: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input
                          type="number"
                          placeholder="Max (₺)"
                          value={priceRange.max}
                          onChange={(e) => setPriceRange({ ...priceRange, max: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          onClick={fetchParcels}
                          className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                        >
                          Uygula
                        </button>
                      </div>
                    </FilterSection>

                    {/* Area range */}
                    <FilterSection title="Alan Aralığı (m²)">
                      <div className="space-y-3">
                        <input
                          type="number"
                          placeholder="Min (m²)"
                          value={areaRange.min}
                          onChange={(e) => setAreaRange({ ...areaRange, min: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input
                          type="number"
                          placeholder="Max (m²)"
                          value={areaRange.max}
                          onChange={(e) => setAreaRange({ ...areaRange, max: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          onClick={fetchParcels}
                          className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                        >
                          Uygula
                        </button>
                      </div>
                    </FilterSection>

                    {/* Zoning filter */}
                    <FilterSection title="İmar Durumu">
                      <div className="space-y-1.5">
                        {['', 'İmarlı', 'İmarsız', 'Tarla', 'Bağ & Bahçe', 'Konut İmarlı', 'Ticari İmarlı'].map((z) => (
                          <button
                            key={z || 'all'}
                            onClick={() => setZoningFilter(z)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              zoningFilter === z
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                            }`}
                          >
                            <span>{z || 'Tümü'}</span>
                            {zoningFilter === z && <Check className="h-4 w-4" />}
                          </button>
                        ))}
                      </div>
                    </FilterSection>

                    {/* Road access filter */}
                    <FilterSection title="Yol Durumu">
                      <div className="space-y-1.5">
                        {[
                          { value: '', label: 'Tümü' },
                          { value: 'yes', label: 'Yolu Var' },
                          { value: 'no', label: 'Yolu Yok' },
                        ].map((opt) => (
                          <button
                            key={opt.value || 'all'}
                            onClick={() => setRoadFilter(opt.value)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              roadFilter === opt.value
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {roadFilter === opt.value && <Check className="h-4 w-4" />}
                          </button>
                        ))}
                      </div>
                    </FilterSection>
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>

            {/* ─── RESULTS SECTION ─── */}
            <div className="flex-1 min-w-0">
              
              {/* Results header */}
              {data && (
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-heading font-bold text-slate-900">
                      {data.meta.total} Arsa Bulundu
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                      Sayfa {data.meta.page} / {data.meta.totalPages}
                    </p>
                  </div>
                </div>
              )}

              {/* Loading state */}
              {loading && <LoadingSkeleton />}

              {/* Error state */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                  <p className="text-red-600 font-medium">{error}</p>
                  <button
                    onClick={fetchParcels}
                    className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Tekrar Dene
                  </button>
                </div>
              )}

              {/* Results */}
              {!loading && !error && data && (
                <>
                  {viewMode === 'map' ? (
                    <div className="rounded-xl overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
                      <ParcelMapLazy parcels={data.data} />
                    </div>
                  ) : viewMode === 'grid' ? (
                    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="parcels-grid">
                      {data.data.map((parcel, index) => (
                        <motion.div
                          key={parcel.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                        >
                          <ParcelCard parcel={parcel} />
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4" data-testid="parcels-list">
                      {data.data.map((parcel, index) => (
                        <motion.div
                          key={parcel.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                        >
                          <ParcelListItem parcel={parcel} />
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {data.data.length === 0 && (
                    <div className="text-center py-16">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                        <Building2 className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-xl font-heading font-bold text-slate-900 mb-2">
                        Sonuç Bulunamadı
                      </h3>
                      <p className="text-slate-500 mb-6">
                        Arama kriterlerinize uygun arsa bulunamadı. Filtreleri değiştirmeyi deneyin.
                      </p>
                      <button
                        onClick={clearAllFilters}
                        className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        Filtreleri Temizle
                      </button>
                    </div>
                  )}

                  {/* Pagination */}
                  {data.meta.totalPages > 1 && (
                    <div className="mt-8 flex justify-center">
                      <PaginationControls
                        currentPage={data.meta.page}
                        totalPages={data.meta.totalPages}
                        onPageChange={(p) => updateSearchParams({ page: String(p) })}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {modalParcelId && (
        <ParcelDetailModal
          parcelId={modalParcelId}
          onClose={() => {
            setModalParcelId(null);
            updateSearchParams({ parcel: '' });
          }}
        />
      )}
      <CompareBar />
      <CompareModal />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PARCEL CARD COMPONENT (Grid View)
   ═══════════════════════════════════════════════════════════════ */
function ParcelCard({ parcel }: { parcel: Parcel }) {
  const [loved, setLoved] = useState(false);
  const compareStore = useCompareStore();
  const isComparing = compareStore.selectedParcels.some((p) => p.id === parcel.id);

  const mainImage = parcel.images?.[0]
    ? resolveImageUrl(parcel.images[0])
    : '/placeholder-parcel.jpg';

  return (
    <Link
      href={`/parcels/${parcel.id}`}
      className="group block bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all duration-300"
      data-testid={`parcel-card-${parcel.id}`}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <img
          src={mainImage}
          alt={parcel.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {parcel.isFeatured && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500 text-white text-xs font-bold rounded-md shadow-lg">
              <Sparkles className="h-3 w-3" />
              Öne Çıkan
            </span>
          )}
          {parcel.status === 'sold' && (
            <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded-md">
              SATILDI
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <button
            onClick={(e) => { e.preventDefault(); setLoved(!loved); }}
            className={`p-2 rounded-full backdrop-blur-sm transition-all ${loved ? 'bg-red-500 text-white' : 'bg-white/90 text-slate-600 hover:bg-white'}`}
          >
            <Heart className={`h-4 w-4 ${loved ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              compareStore.toggleParcel(parcel);
            }}
            className={`p-2 rounded-full backdrop-blur-sm transition-all ${isComparing ? 'bg-emerald-600 text-white' : 'bg-white/90 text-slate-600 hover:bg-white'}`}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Image count */}
        {parcel.images && parcel.images.length > 1 && (
          <div className="absolute bottom-3 right-3 px-2 py-1 bg-slate-900/80 backdrop-blur-sm text-white text-xs font-semibold rounded-md flex items-center gap-1">
            <LayoutGrid className="h-3 w-3" />
            {parcel.images.length}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Price */}
        <div className="mb-3">
          <p className="text-2xl font-heading font-extrabold text-emerald-600 tracking-tight">
            {formatPrice(parcel.price)}
          </p>
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-slate-900 line-clamp-2 mb-3 group-hover:text-emerald-600 transition-colors">
          {parcel.title}
        </h3>

        {/* Location */}
        <p className="flex items-center gap-1 text-sm text-slate-500 mb-3">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">{parcel.city}, {parcel.district}</span>
        </p>

        {/* Features */}
        <div className="flex items-center gap-4 pt-3 border-t border-slate-50 text-xs text-slate-600">
          {parcel.areaM2 && (
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3.5 w-3.5" />
              {Number(parcel.areaM2).toLocaleString()} m²
            </span>
          )}
          {parcel.ada && parcel.parsel && (
            <span className="truncate">
              Ada: {parcel.ada}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PARCEL LIST ITEM COMPONENT (List View)
   ═══════════════════════════════════════════════════════════════ */
function ParcelListItem({ parcel }: { parcel: Parcel }) {
  const [loved, setLoved] = useState(false);
  const mainImage = parcel.images?.[0]
    ? resolveImageUrl(parcel.images[0])
    : '/placeholder-parcel.jpg';

  return (
    <Link
      href={`/parcels/${parcel.id}`}
      className="group block bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all duration-300"
      data-testid={`parcel-list-${parcel.id}`}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Image */}
        <div className="relative w-full sm:w-64 h-48 sm:h-auto shrink-0 bg-slate-100">
          <img
            src={mainImage}
            alt={parcel.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          {parcel.isFeatured && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 bg-amber-500 text-white text-xs font-bold rounded-md shadow-lg">
              <Sparkles className="h-3 w-3" />
              Öne Çıkan
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-emerald-600 transition-colors">
                {parcel.title}
              </h3>
              <p className="flex items-center gap-1 text-sm text-slate-500 mb-4">
                <MapPin className="h-4 w-4 shrink-0" />
                {parcel.city}, {parcel.district}
              </p>
              {parcel.description && (
                <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                  {parcel.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                {parcel.areaM2 && (
                  <span className="flex items-center gap-1">
                    <Maximize2 className="h-4 w-4" />
                    {Number(parcel.areaM2).toLocaleString()} m²
                  </span>
                )}
                {parcel.ada && parcel.parsel && (
                  <span>Ada/Parsel: {parcel.ada}/{parcel.parsel}</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-heading font-extrabold text-emerald-600 tracking-tight mb-2">
                {formatPrice(parcel.price)}
              </p>
              <button
                onClick={(e) => { e.preventDefault(); setLoved(!loved); }}
                className={`p-2 rounded-full transition-all ${loved ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <Heart className={`h-5 w-5 ${loved ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border-b border-slate-100 pb-4 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-sm font-semibold text-slate-900 mb-3 hover:text-emerald-600 transition-colors"
      >
        {title}
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 text-sm font-medium rounded-full border border-emerald-200">
      {label}
      <button onClick={onRemove} className="hover:text-emerald-900">
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages = [];
  for (let i = 1; i <= Math.min(totalPages, 5); i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-4 py-2 bg-white rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        Önceki
      </button>
      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentPage === page
              ? 'bg-emerald-600 text-white shadow-emerald'
              : 'bg-white text-slate-700 hover:bg-slate-50 shadow-sm'
          }`}
        >
          {page}
        </button>
      ))}
      {totalPages > 5 && <span className="text-slate-400">...</span>}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-4 py-2 bg-white rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        Sonraki
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden animate-pulse">
          <div className="aspect-[4/3] bg-slate-100" />
          <div className="p-4 space-y-3">
            <div className="h-6 bg-slate-100 rounded w-3/4" />
            <div className="h-4 bg-slate-100 rounded w-full" />
            <div className="h-4 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
