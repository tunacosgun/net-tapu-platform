'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import NotificationBell from '@/components/admin/NotificationBell';
import {
  LayoutDashboard, BarChart3, Users, ShieldBan, Map, Gavel,
  CreditCard, Landmark, ClipboardList, Phone, CalendarDays,
  HandCoins, FileText, HelpCircle, Trophy, MessageSquare,
  Target, Handshake, Settings, Bell, Menu, X, ExternalLink, BookOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ADMIN_ROLES = ['superadmin', 'admin'];

const navSections: Array<{
  title: string | null;
  items: Array<{ href: string; label: string; icon: LucideIcon }>;
}> = [
  { title: null, items: [
    { href: '/admin',           label: 'Genel Bakış', icon: LayoutDashboard },
    { href: '/admin/analytics', label: 'Analitik',    icon: BarChart3 },
  ]},
  { title: 'Kullanıcılar', items: [
    { href: '/admin/users', label: 'Kullanıcılar',  icon: Users },
    { href: '/admin/bans',  label: 'Yasaklamalar',  icon: ShieldBan },
  ]},
  { title: 'Gayrimenkul', items: [
    { href: '/admin/parcels',   label: 'Arsalar',          icon: Map },
    { href: '/admin/auctions',  label: 'Açık Artırmalar',  icon: Gavel },
  ]},
  { title: 'Finans', items: [
    { href: '/admin/deposits',       label: 'Depozitolar',   icon: CreditCard },
    { href: '/admin/bank-transfers', label: 'Havale / EFT',  icon: Landmark },
    { href: '/admin/installments',   label: 'Taksitli Satış', icon: CreditCard },
    { href: '/admin/mail-order',     label: 'Mail Order',    icon: CreditCard },
    { href: '/admin/reconciliation', label: 'Mutabakat',     icon: ClipboardList },
  ]},
  { title: 'CRM', items: [
    { href: '/admin/contacts',     label: 'İletişim Talepleri', icon: Phone },
    { href: '/admin/appointments', label: 'Randevular',         icon: CalendarDays },
    { href: '/admin/offers',       label: 'Teklifler',          icon: HandCoins },
  ]},
  { title: 'İçerik', items: [
    { href: '/admin/pages',               label: 'Sayfalar',       icon: FileText },
    { href: '/admin/faq',                 label: 'S.S.S.',         icon: HelpCircle },
    { href: '/admin/real-estate-guide',   label: 'Rehber Makaleleri', icon: BookOpen },
    { href: '/admin/references',          label: 'Referanslar',    icon: Trophy },
    { href: '/admin/testimonials',        label: 'Yorumlar',       icon: MessageSquare },
  ]},
  { title: 'Pazarlama', items: [
    { href: '/admin/campaigns', label: 'Kampanyalar',         icon: Target },
    { href: '/admin/dealers',   label: 'Bayiler / Danışmanlar', icon: Handshake },
  ]},
  { title: 'Sistem', items: [
    { href: '/admin/settings',      label: 'Ayarlar',    icon: Settings },
    { href: '/admin/notifications', label: 'Bildirimler', icon: Bell },
  ]},
];

function NavItems({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5 px-2">
      {navSections.map((section, i) => (
        <div key={i}>
          {section.title && (
            <p className="section-label mb-1 px-2">{section.title}</p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const exact = item.href === '/admin';
              const isActive = exact ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={[
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors duration-100',
                    isActive
                      ? 'bg-[var(--brand-light)] text-[var(--brand)] font-medium'
                      : 'text-[#374151] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
                  ].join(' ')}
                >
                  <Icon className={`h-[15px] w-[15px] shrink-0 ${isActive ? 'text-[var(--brand)]' : 'text-[#9ca3af]'}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

const SidebarLogo = () => (
  <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[var(--border)]">
    <div className="flex h-6 w-6 items-center justify-center rounded bg-[var(--brand)]">
      <span className="text-[10px] font-bold text-white leading-none">NT</span>
    </div>
    <span className="text-[13px] font-semibold text-[var(--foreground)]">NetTapu</span>
    <span className="ml-auto text-[10px] font-medium text-[var(--muted-foreground)] bg-[var(--muted)] px-1.5 py-0.5 rounded">Admin</span>
  </div>
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { router.replace('/login?returnTo=/admin'); return; }
    if (user && !user.roles?.some((r) => ADMIN_ROLES.includes(r))) { router.replace('/'); }
  }, [isLoading, isAuthenticated, user, router]);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background-subtle)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]" />
          <p className="text-sm text-[var(--muted-foreground)]">Yükleniyor...</p>
        </div>
      </div>
    );
  }
  if (!user || !user.roles?.some((r) => ADMIN_ROLES.includes(r))) return null;

  return (
    <div className="flex flex-1 bg-[var(--background-subtle)]">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[9999] lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[var(--background)] shadow-xl overflow-y-auto z-10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-[var(--brand)]">
                  <span className="text-[10px] font-bold text-white">NT</span>
                </div>
                <span className="text-[13px] font-semibold">NetTapu Admin</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              <NavItems pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-[var(--border)] bg-[var(--background)] lg:flex flex-col overflow-y-auto">
        <SidebarLogo />
        <div className="flex-1 overflow-y-auto py-4">
          <NavItems pathname={pathname} />
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-md hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-xs text-[var(--muted-foreground)] hidden sm:block">{user.email}</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Siteye Dön
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
