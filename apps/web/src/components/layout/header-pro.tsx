'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Map, Heart, Shield, User, LogOut, Menu, X, Bell,
  ChevronDown, Phone, Mail, Search,
  Settings, CreditCard, Gavel, Clock, TrendingUp, ArrowRight,
  Info, Eye, Target, Settings2, Building2, FolderOpen, Star, Newspaper, BookOpen, Headphones,
  History, HelpCircle, Scale, Undo2, LifeBuoy, MessageCircle,
} from 'lucide-react';
import { useRecentSearches } from '@/hooks/use-recent-searches';
import { useRouter } from 'next/navigation';
import type { Auction } from '@/types';
import apiClient from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NavDropdownItem {
  label: string;
  href: string;
  description?: string;
  icon?: string; // lucide icon name
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveUploadUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/')) return url; // already relative
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/site/')) {
      return parsed.pathname;
    }
  } catch {}
  return url;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info,
  eye: Eye,
  target: Target,
  settings: Settings2,
  building: Building2,
  folder: FolderOpen,
  star: Star,
  newspaper: Newspaper,
  book: BookOpen,
  headphones: Headphones,
  mail: Mail,
  help: HelpCircle,
  scale: Scale,
  undo: Undo2,
  lifebuoy: LifeBuoy,
  message: MessageCircle,
};

function NavIcon({ name, className }: { name?: string; className?: string }) {
  if (!name) return null;
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}

// ─── Default corporate items ──────────────────────────────────────────────────

const DEFAULT_CORPORATE_ITEMS: NavDropdownItem[] = [
  { label: 'Hakkımızda', href: '/about', description: 'Şirketimiz ve hikayemiz', icon: 'info' },
  { label: 'Vizyon', href: '/vision', description: '2030 hedeflerimiz', icon: 'eye' },
  { label: 'Misyon', href: '/mission', description: 'Değerlerimiz ve taahhütlerimiz', icon: 'target' },
  { label: 'Nasıl Çalışır?', href: '/how-it-works', description: 'Platform süreci', icon: 'settings' },
  { label: 'Referanslar', href: '/references', description: 'İş ortaklarımız', icon: 'building' },
  { label: 'Projelerimiz', href: '/projects', description: 'Tamamlanan projeler', icon: 'folder' },
  { label: 'Müşteri Yorumları', href: '/testimonials', description: 'Kullanıcı deneyimleri', icon: 'star' },
  { label: 'Basın', href: '/press', description: 'Medyada NetTapu', icon: 'newspaper' },
];

const DEFAULT_SUPPORT_ITEMS: NavDropdownItem[] = [
  { label: 'S.S.S.', href: '/faq', description: 'Sık sorulan sorular', icon: 'help' },
  { label: 'Gayrimenkul Rehberi', href: '/real-estate-guide', description: 'Kapsamlı yatırım rehberi', icon: 'book' },
  { label: 'Satış Sonrası', href: '/post-sale', description: 'Destek süreçleri', icon: 'headphones' },
  { label: 'Yasal Bilgiler', href: '/legal', description: 'Kullanım koşulları & KVKK', icon: 'scale' },
  { label: 'Cayma Hakkı', href: '/cancellation', description: 'İptal ve iade politikası', icon: 'undo' },
  { label: 'İletişim', href: '/contact', description: 'Bize ulaşın', icon: 'mail' },
];

// ─── Main nav ─────────────────────────────────────────────────────────────────

const mainNav = [
  { href: '/parcels', label: 'Arsalar', icon: Map },
];

// ─── Auctions Live Dropdown ───────────────────────────────────────────────────

function formatTimeLeft(end: string) {
  const ms = new Date(end).getTime() - Date.now();
  if (ms <= 0) return 'Sona erdi';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)} gün`;
  if (h > 0) return `${h}s ${m}dk`;
  return `${m} dakika`;
}

function AuctionsLiveDropdown({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didFetch = useRef(false);

  const fetchAuctions = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<{ data: Auction[] }>('/auctions?limit=6');
      setAuctions(data.data || []);
    } catch {
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  };

  // WebSocket: refresh list on new bids
  useEffect(() => {
    if (!open) return;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('wss://nettapu-demo.tunasoft.tech/auction-ws');
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'BID_PLACED' || msg.type === 'AUCTION_STATUS') {
            didFetch.current = false;
            fetchAuctions();
          }
        } catch {}
      };
    } catch {}
    return () => { ws?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleEnter() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
    if (!didFetch.current) { didFetch.current = true; fetchAuctions(); }
  }
  function handleLeave() {
    timerRef.current = setTimeout(() => setOpen(false), 150);
  }

  const isActive = pathname?.startsWith('/auctions');
  const hasLive = auctions.some(a => a.status === 'live');

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <Link
        href="/auctions"
        className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 select-none ${
          isActive || open
            ? 'text-emerald-600 bg-emerald-50'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
        }`}
      >
        <Gavel className="h-4 w-4" />
        İhaleler
        {hasLive && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </Link>

      {open && (
          <div
            className="absolute left-0 top-full mt-1 z-[100] w-80 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white">
                <div className="flex items-center gap-2">
                  <Gavel className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-bold text-slate-800">Mevcut İhaleler</span>
                </div>
                {hasLive && (
                  <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 uppercase tracking-wide">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    Canlı
                  </span>
                )}
              </div>

              {/* List */}
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  </div>
                ) : auctions.length === 0 ? (
                  <div className="py-8 text-center">
                    <Gavel className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                    <p className="text-sm text-slate-400">Aktif ihale bulunmuyor</p>
                  </div>
                ) : (
                  auctions.map((a) => (
                    <Link
                      key={a.id}
                      href={`/auctions/${a.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group"
                    >
                      <div className="mt-1.5 shrink-0">
                        {a.status === 'live'
                          ? <span className="h-2 w-2 rounded-full bg-green-500 block animate-pulse" />
                          : <span className="h-2 w-2 rounded-full bg-amber-400 block" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-emerald-600 transition-colors">
                          {a.title}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <TrendingUp className="h-3 w-3" />
                            {Number(a.currentPrice || a.startingPrice).toLocaleString('tr-TR')} ₺
                          </span>
                          {a.status === 'live' && a.scheduledEnd && (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                              <Clock className="h-3 w-3" />
                              {formatTimeLeft(a.scheduledEnd)}
                            </span>
                          )}
                          {a.status === 'scheduled' && (
                            <span className="text-xs text-amber-600 font-semibold">Yakında</span>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-400 shrink-0 mt-1 transition-colors" />
                    </Link>
                  ))
                )}
              </div>

              {/* Footer */}
              <Link
                href="/auctions"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-emerald-600 hover:bg-emerald-50 transition-colors border-t border-slate-100"
              >
                Tüm İhaleleri Gör <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
      )}
    </div>
  );
}

// ─── Mega Dropdown (shared for Kurumsal & Destek) ────────────────────────────

function MegaDropdown({
  items,
  pathname,
  accentColor = 'emerald',
  align = 'left',
}: {
  items: NavDropdownItem[];
  pathname: string | null;
  accentColor?: 'emerald' | 'blue';
  align?: 'left' | 'center' | 'right';
}) {
  const colorMap = {
    emerald: {
      active: 'bg-emerald-50 text-emerald-700',
      activeBar: 'bg-emerald-500',
      activeIcon: 'bg-emerald-100 text-emerald-600',
      hoverIcon: 'group-hover:bg-emerald-50 group-hover:text-emerald-500',
      hoverBar: 'group-hover:bg-emerald-300',
      headerGrad: 'from-emerald-50 to-white',
      headerIcon: 'text-emerald-600',
    },
    blue: {
      active: 'bg-blue-50 text-blue-700',
      activeBar: 'bg-blue-500',
      activeIcon: 'bg-blue-100 text-blue-600',
      hoverIcon: 'group-hover:bg-blue-50 group-hover:text-blue-500',
      hoverBar: 'group-hover:bg-blue-300',
      headerGrad: 'from-blue-50 to-white',
      headerIcon: 'text-blue-600',
    },
  };
  const c = colorMap[accentColor];
  const alignClass = align === 'center' ? '-translate-x-1/2 left-1/2' : align === 'right' ? 'right-0' : 'left-0';

  return (
    <div
      className={`absolute top-full mt-1 z-[100] ${alignClass} animate-in fade-in slide-in-from-top-2 duration-150`}
      style={{ minWidth: 480 }}
    >
      <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-slate-100/80 overflow-hidden">
        <div
          className="grid gap-0.5 p-2"
          style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
        >
          {items.map((item) => {
            const isActive = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-start gap-3 rounded-xl px-3 py-3 transition-all duration-150 ${
                  isActive ? c.active : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                {/* Left accent */}
                <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full transition-all duration-150 ${isActive ? c.activeBar : `bg-transparent ${c.hoverBar}`}`} />

                {/* Icon */}
                <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-colors duration-150 ${
                  isActive ? c.activeIcon : `bg-slate-100 text-slate-400 ${c.hoverIcon}`
                }`}>
                  <NavIcon name={item.icon} className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold leading-tight ${isActive ? '' : 'text-slate-800 group-hover:text-slate-900'}`}>
                    {item.label}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 text-xs text-slate-400 leading-snug">
                      {item.description}
                    </p>
                  )}
                </div>

                <ArrowRight className={`h-3.5 w-3.5 mt-1 shrink-0 transition-all duration-150 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 ${isActive ? c.headerIcon : 'text-slate-400'}`} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HeaderPro() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, avatarUrl } = useAuthStore();
  const s = useSiteSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [corporateOpen, setCorporateOpen] = useState(false);
  const [mobileCorporateOpen, setMobileCorporateOpen] = useState(false);
  const corporateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [mobileSupportOpen, setMobileSupportOpen] = useState(false);
  const supportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { searches: recentSearches, save: saveSearch, remove: removeSearch, clear: clearSearches } = useRecentSearches();

  // Parse corporate nav items from settings
  // Support item hrefs must never bleed into the corporate dropdown
  const SUPPORT_HREFS = new Set(DEFAULT_SUPPORT_ITEMS.map((i) => i.href));
  let corporateItems: NavDropdownItem[] = DEFAULT_CORPORATE_ITEMS;
  if (s.corporate_nav_items) {
    try {
      const parsed = JSON.parse(s.corporate_nav_items as string);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge icon from DEFAULT_CORPORATE_ITEMS by matching href when icon is missing
        // Also strip any support items that ended up in DB
        corporateItems = parsed
          .filter((item: NavDropdownItem) => !SUPPORT_HREFS.has(item.href))
          .map((item: NavDropdownItem) => {
            if (!item.icon || item.icon === '') {
              const def = DEFAULT_CORPORATE_ITEMS.find(d => d.href === item.href);
              if (def?.icon) return { ...item, icon: def.icon };
            }
            return item;
          });
        // If filtering left nothing, fall back to defaults
        if (corporateItems.length === 0) corporateItems = DEFAULT_CORPORATE_ITEMS;
      }
    } catch {}
  }

  const supportItems: NavDropdownItem[] = DEFAULT_SUPPORT_ITEMS;

  const resolvedLogo = resolveUploadUrl(s.site_logo as string | undefined);

  // Fetch real notification count (only if endpoint exists)
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchNotifs = async () => {
      try {
        const { default: apiClient } = await import('@/lib/api-client');
        const { data } = await apiClient.get('/notifications', { params: { limit: 10, unreadOnly: true } });
        if (cancelled) return;
        const items = data?.data || data || [];
        setNotifications(Array.isArray(items) ? items : []);
        const unread = Array.isArray(items) ? items.filter((n: any) => !n.isRead).length : 0;
        setNotificationCount(unread);
      } catch {
        if (!cancelled) setNotificationCount(0);
      }
    };

    fetchNotifs();
    intervalId = setInterval(fetchNotifs, 60000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 20); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [searchOpen]);

  const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/register') || pathname?.startsWith('/forgot-password');
  const isAdminPage = pathname?.startsWith('/admin');
  if (isAuthPage || isAdminPage) return null;

  const isAdmin = user?.roles?.includes('admin') || user?.roles?.includes('superadmin');

  const isCorporateActive = corporateItems.some((item) => pathname?.startsWith(item.href));
  const isSupportActive = supportItems.some((item) => pathname?.startsWith(item.href));

  function handleCorporateEnter() {
    if (corporateTimer.current) clearTimeout(corporateTimer.current);
    setCorporateOpen(true);
  }

  function handleCorporateLeave() {
    corporateTimer.current = setTimeout(() => setCorporateOpen(false), 120);
  }

  function handleSupportEnter() {
    if (supportTimer.current) clearTimeout(supportTimer.current);
    setSupportOpen(true);
  }
  function handleSupportLeave() {
    supportTimer.current = setTimeout(() => setSupportOpen(false), 120);
  }

  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  function handleSearchSubmit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    saveSearch(trimmed);
    setSearchOpen(false);
    setSearchQuery('');
    router.push(`/parcels?search=${encodeURIComponent(trimmed)}`);
  }

  return (
    <>
      <div className="h-[72px] lg:h-[108px]" />
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]'
            : 'bg-white'
        }`}
        data-testid="main-header"
      >
        {/* Top utility bar */}
        <div className="hidden lg:block bg-slate-50">
          <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-6 text-xs">
            <div className="flex items-center gap-6">
              {s.contact_phone && (
                <a
                  href={`tel:${s.contact_phone}`}
                  className="flex items-center gap-2 text-slate-500 hover:text-emerald-600 transition-colors duration-200"
                  data-testid="header-phone"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span className="font-medium">{s.contact_phone}</span>
                </a>
              )}
              {s.contact_email && (
                <a
                  href={`mailto:${s.contact_email}`}
                  className="flex items-center gap-2 text-slate-500 hover:text-emerald-600 transition-colors duration-200"
                  data-testid="header-email"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span className="font-medium">{s.contact_email}</span>
                </a>
              )}
            </div>
            <div className="flex items-center gap-6">
              <Link
                href="/contact"
                className="font-medium text-slate-500 hover:text-emerald-600 transition-colors duration-200"
              >
                İletişim
              </Link>
              <Link
                href="/how-it-works"
                className="flex items-center gap-1.5 font-medium text-slate-500 hover:text-emerald-600 transition-colors duration-200"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Yardım
              </Link>
            </div>
          </div>
        </div>

        {/* Main navigation */}
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group" data-testid="header-logo">
            {!s._loaded ? (
              /* Skeleton while settings load — no flash of wrong logo */
              <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-100" />
            ) : resolvedLogo ? (
              <img
                src={resolvedLogo}
                alt={s.site_title || 'NetTapu'}
                className="h-10 object-contain transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white text-sm font-bold shadow-sm transition-transform duration-200 group-hover:scale-105">
                  NT
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-lg font-bold font-heading text-slate-900 tracking-tight">
                    {s.site_title || 'NetTapu'}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    Arsa & Açık Artırma
                  </span>
                </div>
              </>
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1" data-testid="desktop-nav">
            {mainNav.map((item) => {
              const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'text-emerald-600 bg-emerald-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                  data-testid={`nav-link-${item.href.replace('/', '')}`}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {item.label}
                </Link>
              );
            })}

            {/* İhaleler live dropdown */}
            <AuctionsLiveDropdown pathname={pathname} />

            {/* Kurumsal dropdown trigger */}
            <div
              className="relative"
              onMouseEnter={handleCorporateEnter}
              onMouseLeave={handleCorporateLeave}
            >
              <button
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 select-none ${
                  isCorporateActive || corporateOpen
                    ? 'text-emerald-600 bg-emerald-50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                data-testid="nav-corporate-btn"
                aria-expanded={corporateOpen}
                aria-haspopup="true"
              >
                Kurumsal
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${corporateOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {corporateOpen && (
                <MegaDropdown items={corporateItems} pathname={pathname} accentColor="emerald" align="left" />
              )}
            </div>

            {/* Destek dropdown trigger */}
            <div
              className="relative"
              onMouseEnter={handleSupportEnter}
              onMouseLeave={handleSupportLeave}
            >
              <button
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 select-none ${
                  isSupportActive || supportOpen
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                data-testid="nav-support-btn"
                aria-expanded={supportOpen}
                aria-haspopup="true"
              >
                Destek
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${supportOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {supportOpen && (
                <MegaDropdown items={supportItems} pathname={pathname} accentColor="blue" align="right" />
              )}
            </div>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Search - Desktop only */}
            <div className="relative hidden lg:block" ref={searchRef}>
              <button
                onClick={openSearch}
                className="flex items-center justify-center h-10 w-10 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-all duration-200"
                data-testid="header-search-btn"
              >
                <Search className="h-5 w-5" />
              </button>

              {searchOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 z-[100] w-80 animate-in fade-in slide-in-from-top-2 duration-150"
                  >
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                      {/* Search input */}
                      <form onSubmit={(e) => { e.preventDefault(); handleSearchSubmit(searchQuery); }} className="p-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false); }}
                            placeholder="Ara... (il, ilçe, ilan no)"
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          />
                        </div>
                      </form>

                      {/* Recent searches */}
                      {recentSearches.length > 0 && (
                        <div className="pb-3">
                          <div className="flex items-center justify-between px-4 pb-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              <History className="h-3.5 w-3.5" />
                              Son Aramalar
                            </span>
                            <button onClick={clearSearches} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Temizle</button>
                          </div>
                          <div className="space-y-0.5">
                            {recentSearches.slice(0, 3).map((q) => (
                              <div key={q} className="flex items-center gap-2 px-3 mx-1 rounded-lg hover:bg-slate-50 group">
                                <button
                                  onClick={() => handleSearchSubmit(q)}
                                  className="flex-1 flex items-center gap-2 py-2 text-sm text-slate-700 text-left"
                                >
                                  <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  {q}
                                </button>
                                <button
                                  onClick={() => removeSearch(q)}
                                  className="p-1 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Go to parcels */}
                      <div className="border-t border-slate-100">
                        <button
                          onClick={() => { setSearchOpen(false); router.push('/parcels'); }}
                          className="w-full flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          Tüm Arsaları Gör <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
              )}
            </div>

            {isAuthenticated ? (
              <>
                {/* Notifications */}
                <button
                  className="relative flex items-center justify-center h-10 w-10 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-all duration-200"
                  data-testid="header-notifications-btn"
                  onClick={() => setNotifOpen(!notifOpen)}
                >
                  <Bell className="h-5 w-5" />
                  {notificationCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
                  )}
                </button>

                {/* Favorites */}
                <Link
                  href="/profile/favorites"
                  className="hidden lg:flex items-center justify-center h-10 w-10 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 transition-all duration-200"
                  data-testid="header-favorites-btn"
                >
                  <Heart className="h-5 w-5" />
                </Link>

                {/* Admin Badge */}
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="hidden lg:flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-all duration-200"
                    data-testid="header-admin-btn"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span>Admin</span>
                  </Link>
                )}

                {/* Profile dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white overflow-hidden shadow-sm transition-all duration-200 hover:bg-emerald-700"
                    data-testid="header-profile-btn"
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      user?.email?.charAt(0).toUpperCase() || 'U'
                    )}
                  </button>

                  {profileOpen && (
                      <div
                        className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.1)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 z-[100]"
                        onMouseLeave={() => setProfileOpen(false)}
                        data-testid="profile-dropdown"
                      >
                        {/* Profile Header */}
                        <div className="px-4 py-4 bg-slate-50">
                          <p className="text-sm font-bold font-heading text-slate-900 truncate">{user?.email}</p>
                          <p className="text-xs text-slate-500 mt-1 font-medium">Kişisel Hesap</p>
                        </div>

                        {/* Menu Items */}
                        <div className="py-2">
                          <Link
                            href="/profile"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-150"
                          >
                            <User className="h-4 w-4 text-slate-400" />
                            <span>Hesabım</span>
                          </Link>
                          <Link
                            href="/profile/favorites"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-150"
                          >
                            <Heart className="h-4 w-4 text-slate-400" />
                            <span>Favorilerim</span>
                          </Link>
                          <Link
                            href="/profile/auctions"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-150"
                          >
                            <Gavel className="h-4 w-4 text-slate-400" />
                            <span>İhalelerim</span>
                          </Link>
                          <Link
                            href="/profile/payments"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-150"
                          >
                            <CreditCard className="h-4 w-4 text-slate-400" />
                            <span>Ödemeler</span>
                          </Link>
                          <Link
                            href="/profile/saved-searches"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-150"
                          >
                            <History className="h-4 w-4 text-slate-400" />
                            <span>Kayıtlı Aramalar</span>
                          </Link>
                        </div>

                        {/* Logout */}
                        <div className="py-2 border-t border-slate-100">
                          <button
                            onClick={async () => {
                              setProfileOpen(false);
                              try { await fetch('/api/auth/session', { method: 'DELETE' }); } catch {}
                              useAuthStore.getState().clearTokens();
                              window.location.href = '/login';
                            }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors duration-150"
                            data-testid="logout-btn"
                          >
                            <LogOut className="h-4 w-4" />
                            <span>Çıkış Yap</span>
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="hidden lg:block px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition-all duration-200"
                  data-testid="header-login-btn"
                >
                  Giriş Yap
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm hover:shadow transition-all duration-200"
                  data-testid="header-register-btn"
                >
                  Üye Ol
                </Link>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              className="ml-2 flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-50 lg:hidden transition-colors duration-200"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
              data-testid="mobile-menu-toggle"
            >
              {mobileOpen ? <X className="h-5 w-5 text-slate-600" /> : <Menu className="h-5 w-5 text-slate-600" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden bg-white shadow-lg overflow-hidden"
              data-testid="mobile-menu"
            >
              <nav className="px-4 py-4 space-y-1">
                {/* Main nav items */}
                {mainNav.map((item) => {
                  const isActive = pathname?.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-lg transition-colors duration-150 ${
                        isActive ? 'text-emerald-600 bg-emerald-50' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {Icon && <Icon className="h-5 w-5" />}
                      {item.label}
                    </Link>
                  );
                })}

                {/* Kurumsal expandable section */}
                <div>
                  <button
                    onClick={() => setMobileCorporateOpen(!mobileCorporateOpen)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold rounded-lg transition-colors duration-150 ${
                      isCorporateActive ? 'text-emerald-600 bg-emerald-50' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                    data-testid="mobile-corporate-toggle"
                  >
                    <span className="flex items-center gap-3">
                      <Building2 className="h-5 w-5" />
                      Kurumsal
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${mobileCorporateOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <AnimatePresence>
                    {mobileCorporateOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-4 mt-1 border-l-2 border-emerald-100 pl-3 space-y-0.5">
                          {corporateItems.map((item) => {
                            const isActive = pathname?.startsWith(item.href);
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => { setMobileOpen(false); setMobileCorporateOpen(false); }}
                                className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors duration-150 ${
                                  isActive
                                    ? 'text-emerald-600 bg-emerald-50 font-semibold'
                                    : 'text-slate-600 hover:bg-slate-50 font-medium'
                                }`}
                              >
                                <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                  <NavIcon name={item.icon} className="h-3.5 w-3.5" />
                                </span>
                                {item.label}
                              </Link>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Destek expandable section */}
                <div>
                  <button
                    onClick={() => setMobileSupportOpen(!mobileSupportOpen)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold rounded-lg transition-colors duration-150 ${
                      isSupportActive ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                    data-testid="mobile-support-toggle"
                  >
                    <span className="flex items-center gap-3">
                      <LifeBuoy className="h-5 w-5" />
                      Destek
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${mobileSupportOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {mobileSupportOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-4 mt-1 border-l-2 border-blue-100 pl-3 space-y-0.5">
                          {supportItems.map((item) => {
                            const isActive = pathname?.startsWith(item.href);
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => { setMobileOpen(false); setMobileSupportOpen(false); }}
                                className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors duration-150 ${
                                  isActive
                                    ? 'text-blue-600 bg-blue-50 font-semibold'
                                    : 'text-slate-600 hover:bg-slate-50 font-medium'
                                }`}
                              >
                                <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                  <NavIcon name={item.icon} className="h-3.5 w-3.5" />
                                </span>
                                {item.label}
                              </Link>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Auth section */}
                {isAuthenticated && (
                  <div className="pt-2 mt-2 border-t border-slate-100 space-y-1">
                    <Link
                      href="/profile"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-lg"
                    >
                      <User className="h-5 w-5 text-slate-400" />
                      Hesabım
                    </Link>
                    <button
                      onClick={async () => {
                        setMobileOpen(false);
                        try { await fetch('/api/auth/session', { method: 'DELETE' }); } catch {}
                        useAuthStore.getState().clearTokens();
                        window.location.href = '/login';
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <LogOut className="h-5 w-5" />
                      Çıkış Yap
                    </button>
                  </div>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
