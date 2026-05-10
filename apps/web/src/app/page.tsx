'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import apiClient from '@/lib/api-client';
import { formatPrice } from '@/lib/format';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { ParcelCard } from '@/components/parcel-card';
import { VideoPopup } from '@/components/video-popup';
import {
  Search, ArrowRight, MapPin, Shield, Lock, Headphones, Scale,
  Play, Star, Users, Gavel, Building2, ChevronRight, TrendingUp,
  Zap, Timer, Sparkles, CheckCircle2, Award, X, History, Clock,
} from 'lucide-react';
import { useRecentSearches } from '@/hooks/use-recent-searches';
import { useRef } from 'react';
import { TurkeyParcelMap } from '@/components/turkey-parcel-map';

// Turkish cities + popular districts for autocomplete
const LOCATION_SUGGESTIONS = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin',
  'Aydın', 'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa',
  'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ',
  'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari',
  'Hatay', 'Isparta', 'İçel (Mersin)', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu',
  'Kayseri', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya',
  'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde',
  'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Tekirdağ',
  'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak',
  'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan',
  'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce',
  // Popular districts
  'Belek', 'Kemer', 'Alanya', 'Side', 'Manavgat', 'Kuşadası', 'Bodrum', 'Marmaris',
  'Fethiye', 'Göcek', 'Dalaman', 'Didim', 'Çeşme', 'Alaçatı', 'Sapanca', 'Abant',
];
import type { Parcel, Auction, PaginatedResponse, Reference } from '@/types';

const ParcelMapLazy = dynamic(() => import('@/components/parcel-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center bg-slate-50 rounded-xl">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-slate-200 border-t-emerald-600" />
        <span className="text-sm text-slate-500 font-medium">Harita yükleniyor...</span>
      </div>
    </div>
  ),
});

export default function HomePage() {
  const router = useRouter();
  const siteSettings = useSiteSettings();
  const [featuredParcels, setFeaturedParcels] = useState<Parcel[]>([]);
  const [latestParcels, setLatestParcels] = useState<Parcel[]>([]);
  const [activeAuctions, setActiveAuctions] = useState<Auction[]>([]);
  const [stats, setStats] = useState({ parcels: 0, auctions: 0, cities: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [showVideo, setShowVideo] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const { searches: recentSearches, save: saveSearch, remove: removeSearchItem, clear: clearSearches } = useRecentSearches();

  // Autocomplete suggestions based on current query
  const locationMatches = searchQuery.trim().length >= 1
    ? LOCATION_SUGGESTIONS.filter((s) =>
        s.toLocaleLowerCase('tr').includes(searchQuery.toLocaleLowerCase('tr'))
      ).slice(0, 5)
    : [];
  const filteredRecent = searchQuery.trim().length >= 1
    ? recentSearches.filter((s) => s.toLocaleLowerCase('tr').includes(searchQuery.toLocaleLowerCase('tr')))
    : recentSearches;
  const showDropdown = searchFocused && (filteredRecent.length > 0 || locationMatches.length > 0);
  const [testimonials, setTestimonials] = useState<Reference[]>([]);

  useEffect(() => {
    // Fetch featured parcels
    apiClient.get<PaginatedResponse<Parcel>>('/parcels', { 
      params: { isFeatured: true, limit: 6, status: 'active' } 
    }).then(({ data }) => setFeaturedParcels(data.data)).catch(() => {});

    // Fetch latest parcels
    apiClient.get<PaginatedResponse<Parcel>>('/parcels', { 
      params: { limit: 6, sortBy: 'createdAt', sortOrder: 'DESC', status: 'active' } 
    }).then(({ data }) => {
      setLatestParcels(data.data);
      setStats((s) => ({ ...s, parcels: data.meta.total }));
    }).catch(() => {});

    // Fetch city count
    apiClient.get<PaginatedResponse<Parcel>>('/parcels', { 
      params: { limit: 100, status: 'active' } 
    }).then(({ data }) => {
      const cities = new Set(data.data.map((p) => p.city).filter(Boolean));
      setStats((s) => ({ ...s, cities: cities.size }));
    }).catch(() => {});

    // Fetch testimonials
    apiClient.get<Reference[]>('/content/references')
      .then(({ data }) => setTestimonials(data.filter((r) => r.referenceType === 'testimonial').slice(0, 6)))
      .catch(() => {});

    // Fetch active auctions
    Promise.all([
      apiClient.get<PaginatedResponse<Auction>>('/auctions', { params: { limit: 3, status: 'live' } }).catch(() => ({ data: { data: [], meta: { total: 0 } } })),
      apiClient.get<PaginatedResponse<Auction>>('/auctions', { params: { limit: 3, status: 'scheduled' } }).catch(() => ({ data: { data: [], meta: { total: 0 } } })),
      apiClient.get<PaginatedResponse<Auction>>('/auctions', { params: { limit: 1, status: 'deposit_open' } }).catch(() => ({ data: { data: [], meta: { total: 0 } } })),
    ]).then(([liveRes, schedRes, depositRes]) => {
      const combined = [...liveRes.data.data, ...schedRes.data.data].slice(0, 3);
      setActiveAuctions(combined);
      setStats((s) => ({ ...s, auctions: liveRes.data.meta.total + schedRes.data.meta.total + depositRes.data.meta.total }));
    });
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      saveSearch(q);
      setSearchFocused(false);
      router.push(`/parcels?search=${encodeURIComponent(q)}`);
    }
  }

  function handleRecentClick(q: string) {
    setSearchFocused(false);
    saveSearch(q);
    router.push(`/parcels?search=${encodeURIComponent(q)}`);
  }

  function removeRecent(q: string, e: React.MouseEvent) {
    e.stopPropagation();
    removeSearchItem(q);
  }

  return (
    <main className="bg-gradient-to-b from-white via-slate-50 to-white">
      
      {/* ═══════════════════════════════════════════════════════════════
          ULTRA-PREMIUM HERO SECTION
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pt-16 pb-24 sm:pt-24 sm:pb-32">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-40" />
        
        {/* Gradient Orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-8"
              data-testid="hero-badge"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-emerald" />
              <span className="text-sm font-semibold text-white/90 tracking-wide">
                Türkiye'nin Güvenilir Arsa Platformu
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-heading text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight mb-6"
              data-testid="hero-headline"
            >
              Hayalinizdeki Arsayı{' '}
              <span className="text-gradient-emerald bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-500">
                Bulun
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-12 leading-relaxed"
              data-testid="hero-description"
            >
              Güvenilir, şeffaf ve dijital onaylı emlak yatırımları. Canlı açık artırmalarda yerinizi alın,
              en iyi fırsatları kaçırmayın.
            </motion.p>

            {/* Search Bar - Premium Glassmorphic Design */}
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              onSubmit={handleSearch}
              className="max-w-3xl mx-auto"
              data-testid="hero-search-form"
              data-tour="home-search"
            >
              <div className="relative group">
                {/* Glow effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-2xl opacity-20 blur-xl group-hover:opacity-40 transition-opacity duration-500" />

                {/* Search input container */}
                <div className="relative flex items-center bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/20 p-2">
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 ml-1">
                    <Search className="h-5 w-5" />
                  </div>

                  <input
                    type="text"
                    placeholder="İl, ilçe, ada/parsel veya ilan no ile arayın..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    className="flex-1 px-4 py-3 bg-transparent text-slate-900 placeholder:text-slate-400 text-base focus:outline-none"
                    data-testid="hero-search-input"
                  />

                  <button
                    type="submit"
                    className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-8 py-3 rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200 flex items-center gap-2 shadow-emerald hover:shadow-emerald-lg btn-shine"
                    data-testid="hero-search-button"
                  >
                    Ara
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Smart autocomplete dropdown */}
                {showDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
                    {/* Recent searches section */}
                    {filteredRecent.length > 0 && (
                      <div>
                        <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                            <History className="h-3 w-3" /> Son Aramalar
                          </span>
                          {!searchQuery && (
                            <button type="button" onClick={clearSearches} className="text-[11px] text-slate-400 hover:text-red-500 transition-colors font-medium">
                              Temizle
                            </button>
                          )}
                        </div>
                        {filteredRecent.slice(0, 3).map((q) => (
                          <div key={q} className="flex items-center group/item hover:bg-slate-50 transition-colors">
                            <button
                              type="button"
                              onClick={() => handleRecentClick(q)}
                              className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left"
                            >
                              <Clock className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                              <span className="text-sm text-slate-700 font-medium">{q}</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => removeRecent(q, e)}
                              className="pr-4 opacity-0 group-hover/item:opacity-100 transition-opacity text-slate-300 hover:text-slate-500 p-1"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Location suggestions section */}
                    {locationMatches.length > 0 && (
                      <div className={filteredRecent.length > 0 ? 'border-t border-slate-100' : ''}>
                        <div className="px-4 pt-3 pb-1.5">
                          <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                            <MapPin className="h-3 w-3" /> Konumlar
                          </span>
                        </div>
                        {locationMatches.map((loc) => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => { saveSearch(loc); setSearchQuery(''); setSearchFocused(false); router.push(`/parcels?city=${encodeURIComponent(loc)}`); }}
                            className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-emerald-50 transition-colors group/loc"
                          >
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 group-hover/loc:bg-emerald-200 transition-colors">
                              <MapPin className="h-3 w-3" />
                            </div>
                            <span className="text-sm text-slate-800 font-semibold">{loc}</span>
                            <span className="ml-auto text-xs text-slate-400">İl / İlçe</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Search action footer */}
                    {searchQuery.trim() && (
                      <div className="border-t border-slate-100 px-4 py-2.5">
                        <button
                          type="submit"
                          className="flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          <Search className="h-3.5 w-3.5" />
                          &quot;{searchQuery}&quot; için tüm sonuçları gör
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quick links */}
              <div data-tour="home-popular" className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <span className="text-sm text-slate-400 font-medium">Popüler:</span>
                {['İstanbul', 'İzmir', 'Antalya', 'Muğla'].map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => router.push(`/parcels?city=${city}`)}
                    className="px-4 py-1.5 rounded-lg bg-white/10 border border-white/20 text-sm text-white font-medium hover:bg-white/20 hover:border-white/30 transition-all duration-200 backdrop-blur-sm"
                    data-testid={`quick-city-${city.toLowerCase()}`}
                  >
                    <MapPin className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                    {city}
                  </button>
                ))}
              </div>
            </motion.form>

          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg className="w-full h-16 sm:h-24 text-slate-50" preserveAspectRatio="none" viewBox="0 0 1440 74" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 74V0C240 49.333 480 74 720 74C960 74 1200 49.333 1440 0V74H0Z" fill="currentColor"/>
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          STATS SECTION - Elevated Cards
          ═══════════════════════════════════════════════════════════════ */}
      <section data-tour="home-stats" className="relative -mt-16 mb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { value: `${stats.parcels}+`, label: 'Aktif İlan', icon: Building2, color: 'emerald', gradient: 'from-emerald-500 to-emerald-600' },
            { value: `${stats.auctions}`, label: 'Canlı İhale', icon: Gavel, color: 'amber', gradient: 'from-amber-500 to-amber-600' },
            { value: `${stats.cities}`, label: 'Farklı Şehir', icon: MapPin, color: 'blue', gradient: 'from-blue-500 to-blue-600' },
          ].map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 + 0.4 }}
                className="bg-white rounded-2xl border border-slate-200 p-8 shadow-lg hover:shadow-xl transition-all duration-300 group"
                data-testid={`stat-card-${stat.label.toLowerCase().replace(' ', '-')}`}
              >
                <div className="flex items-center gap-6">
                  <div className={`p-4 rounded-xl bg-gradient-to-br ${stat.gradient} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <p className="text-3xl font-heading font-extrabold text-slate-900 tracking-tight">{stat.value}</p>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-1">{stat.label}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          TURKEY MAP — PARCEL DISTRIBUTION
          ═══════════════════════════════════════════════════════════════ */}
      <TurkeyParcelMap />

      {/* ═══════════════════════════════════════════════════════════════
          FEATURED PARCELS SECTION
          ═══════════════════════════════════════════════════════════════ */}
      {featuredParcels.length > 0 && (
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" data-testid="featured-parcels-section">
          <SectionHeader
            overline="Editörün Seçimi"
            title="Öne Çıkan Arsalar"
            description="Premium lokasyonlarda, yatırım değeri yüksek arsa ilanları"
            href="/parcels?isFeatured=true"
            linkText="Tüm Öne Çıkanlar"
          />
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredParcels.map((parcel, index) => (
              <motion.div
                key={parcel.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <ParcelCard parcel={parcel} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          LIVE AUCTIONS SECTION
          ═══════════════════════════════════════════════════════════════ */}
      {activeAuctions.length > 0 && (
        <section className="py-16 bg-gradient-to-br from-slate-50 to-white" data-testid="active-auctions-section">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-3xl font-heading font-extrabold text-slate-900 tracking-tight">
                      Canlı İhaleler
                    </h2>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Canlı</span>
                    </span>
                  </div>
                  <p className="text-slate-600">Gerçek zamanlı teklif verin, fırsatları kaçırmayın</p>
                </div>
              </div>
              <Link
                href="/auctions"
                className="hidden sm:flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                data-testid="view-all-auctions-link"
              >
                Tümünü Gör
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activeAuctions.map((auction, index) => (
                <motion.div
                  key={auction.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <AuctionCard auction={auction} />
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          HOW IT WORKS SECTION
          ═══════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-50 rounded-full blur-3xl opacity-50" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="overline">Kolay ve Güvenli</span>
            <h2 className="text-4xl md:text-5xl font-heading font-extrabold text-slate-900 tracking-tight mt-3">
              Nasıl Çalışır?
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Sadece 3 adımda hayalinizdeki arsaya ulaşın
            </p>
          </div>

          <div className="grid gap-12 sm:grid-cols-3 relative">
            {/* Connection line */}
            <div className="hidden sm:block absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-200 via-blue-200 to-purple-200" />
            
            {[
              {
                step: '01',
                icon: Search,
                title: 'Arsa Bulun',
                description: 'Gelişmiş filtreler ve harita ile size uygun lokasyonu keşfedin.',
                color: 'from-blue-500 to-cyan-400',
                iconBg: 'bg-blue-50',
                iconColor: 'text-blue-600',
              },
              {
                step: '02',
                icon: Gavel,
                title: 'Teklif Verin',
                description: 'Canlı ihalelere katılın veya hemen teklif vererek satın alın.',
                color: 'from-amber-500 to-orange-400',
                iconBg: 'bg-amber-50',
                iconColor: 'text-amber-600',
              },
              {
                step: '03',
                icon: Shield,
                title: 'Tapunuzu Alın',
                description: 'Güvenli ödeme ile işlemi tamamlayın, tapuyu devir alın.',
                color: 'from-emerald-600 to-emerald-400',
                iconBg: 'bg-emerald-50',
                iconColor: 'text-emerald-600',
              },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.2 }}
                  className="relative bg-white rounded-2xl p-8 border border-slate-200 shadow-sm hover:shadow-xl hover:border-emerald-200 transition-all duration-300 group"
                >
                  {/* Step number */}
                  <div className="absolute top-6 right-6 text-6xl font-heading font-black text-slate-100 select-none">
                    {item.step}
                  </div>

                  {/* Icon */}
                  <div className={`relative inline-flex p-4 rounded-xl ${item.iconBg} ${item.iconColor} mb-6 group-hover:scale-110 transition-transform duration-300 z-10`}>
                    <Icon className="h-7 w-7" />
                  </div>

                  {/* Content */}
                  <h3 className="relative text-xl font-heading font-bold text-slate-900 mb-3 z-10">
                    {item.title}
                  </h3>
                  <p className="relative text-slate-600 leading-relaxed z-10">
                    {item.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          TRUST BADGES SECTION
          ═══════════════════════════════════════════════════════════════ */}
      <section className="py-12 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { icon: Lock, label: 'SSL Güvenlik', desc: '256-bit şifreleme' },
              { icon: Scale, label: 'Yasal Uyum', desc: 'KVKK & mevzuat' },
              { icon: Shield, label: 'Güvenli Ödeme', desc: '3D Secure' },
              { icon: Headphones, label: '7/24 Destek', desc: 'Canlı destek' },
            ].map((badge, index) => {
              const Icon = badge.icon;
              return (
                <motion.div
                  key={badge.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-4 hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{badge.label}</p>
                    <p className="text-xs text-slate-500 truncate">{badge.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          TESTIMONIALS SECTION
          ═══════════════════════════════════════════════════════════════ */}
      {testimonials.length > 0 && (
        <section className="py-24" data-testid="testimonials-section">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <span className="overline">Müşteri Yorumları</span>
              <h2 className="text-4xl font-heading font-extrabold text-slate-900 tracking-tight mt-3">
                Müşterilerimiz Ne Diyor?
              </h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={testimonial.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all duration-300"
                >
                  {/* Stars */}
                  <div className="flex items-center gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} className="h-4 w-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>

                  {/* Quote */}
                  {testimonial.description && (
                    <p className="text-slate-600 leading-relaxed mb-6 line-clamp-4">
                      "{testimonial.description}"
                    </p>
                  )}

                  {/* Author */}
                  <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                    {testimonial.imageUrl ? (
                      <img
                        src={testimonial.imageUrl}
                        alt={testimonial.title}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-100"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
                        {testimonial.title.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{testimonial.title}</p>
                      {testimonial.websiteUrl && (
                        <p className="text-xs text-slate-500">{testimonial.websiteUrl}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          FINAL CTA SECTION
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative py-24 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900">
        {/* Pattern overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
        
        {/* Gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-heading font-extrabold text-white tracking-tight mb-6">
              Geleceğin Yatırımına{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 to-emerald-500">
                Bugün Başlayın
              </span>
            </h2>
            <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
              Binlerce doğrulanmış arsa ve güvenilir açık artırmalar sizi bekliyor. 
              Hemen ücretsiz üye olun, fırsatları kaçırmayın.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/parcels"
                className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-8 py-4 rounded-xl font-bold hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200 flex items-center justify-center gap-2 shadow-emerald-lg hover:shadow-emerald-lg hover:-translate-y-0.5 btn-shine"
                data-testid="cta-browse-parcels"
              >
                Arsaları Keşfet
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/register"
                className="w-full sm:w-auto bg-white/10 backdrop-blur-sm border border-white/20 text-white px-8 py-4 rounded-xl font-bold hover:bg-white/20 hover:border-white/30 transition-all duration-200 flex items-center justify-center gap-2"
                data-testid="cta-register"
              >
                Ücretsiz Üye Ol
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Video Popup */}
      {showVideo && siteSettings.intro_video_url && (
        <VideoPopup videoUrl={siteSettings.intro_video_url} onClose={() => setShowVideo(false)} />
      )}
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION HEADER COMPONENT
   ═══════════════════════════════════════════════════════════════ */
function SectionHeader({
  overline,
  title,
  description,
  href,
  linkText = 'Tümünü Gör',
}: {
  overline?: string;
  title: string;
  description?: string;
  href?: string;
  linkText?: string;
}) {
  return (
    <div className="flex items-end justify-between mb-10">
      <div>
        {overline && <span className="overline">{overline}</span>}
        <h2 className="text-3xl font-heading font-extrabold text-slate-900 tracking-tight mt-2">
          {title}
        </h2>
        {description && <p className="mt-2 text-slate-600">{description}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="hidden sm:flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          {linkText}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AUCTION CARD COMPONENT
   ═══════════════════════════════════════════════════════════════ */
function AuctionCard({ auction }: { auction: Auction }) {
  const statusConfig: Record<string, { label: string; color: string; icon: typeof Zap }> = {
    live: { label: 'Canlı', color: 'bg-red-50 text-red-600 border-red-200', icon: Zap },
    ending: { label: 'Bitiyor', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: Timer },
    scheduled: { label: 'Yaklaşan', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: Timer },
  };

  const status = statusConfig[auction.status] || { 
    label: auction.status, 
    color: 'bg-slate-50 text-slate-600 border-slate-200', 
    icon: Gavel 
  };
  const Icon = status.icon;

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group block bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-xl hover:border-emerald-200 transition-all duration-300"
      data-testid={`auction-card-${auction.id}`}
    >
      <div className="p-6">
        {/* Status badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${status.color}`}>
            <Icon className="h-3 w-3" />
            {status.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-slate-900 mb-4 line-clamp-2 group-hover:text-emerald-600 transition-colors">
          {auction.title || 'Açık Artırma'}
        </h3>

        {/* Price info */}
        <div className="space-y-3">
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-slate-500">{auction.currentPrice ? 'Güncel Fiyat' : 'Başlangıç Fiyatı'}</span>
            <span className="text-2xl font-heading font-extrabold text-emerald-600 tracking-tight">
              {formatPrice(auction.currentPrice || auction.startingPrice)}
            </span>
          </div>
          {auction.currentPrice && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Başlangıç</span>
              <span className="text-slate-600 font-medium">{formatPrice(auction.startingPrice)}</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-5 flex items-center gap-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {auction.participantCount} katılımcı
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            {auction.bidCount} teklif
          </span>
        </div>
      </div>
    </Link>
  );
}
