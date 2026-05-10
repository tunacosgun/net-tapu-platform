'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import { formatPrice } from '@/lib/format';
import { StatCard, LoadingState } from '@/components/ui';
import {
  Map, Gavel, Users, CreditCard, Phone, HandCoins, TrendingUp,
  AlertTriangle, ArrowUpRight, Landmark, CalendarDays,
} from 'lucide-react';
import type { ReconciliationReport } from '@/types';

interface FinanceSummary {
  total_captured_amount: string;
  total_refunded_amount: string;
  total_settled_auctions: number;
  total_failed_settlements: number;
}

interface DashboardStats {
  parcels: { total: number; active: number; sold: number; deposit_taken: number };
  auctions: { total: number; live: number; scheduled: number };
  users: { total: number; newThisMonth: number };
  contacts: { pending: number };
  offers: { pending: number };
  deposits: { held: number };
}

export default function AdminDashboard() {
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [recon, setRecon] = useState<ReconciliationReport | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      const results = await Promise.allSettled([
        apiClient.get<FinanceSummary>('/admin/finance/summary'),
        apiClient.get<ReconciliationReport>('/admin/reconciliation'),
        apiClient.get('/admin/analytics/overview'),
      ]);

      if (cancelled) return;

      if (results[0].status === 'fulfilled') setFinance(results[0].value.data);
      if (results[1].status === 'fulfilled') setRecon(results[1].value.data);
      if (results[2].status === 'fulfilled') {
        const d = results[2].value.data;
        setStats({
          parcels: d.parcels || { total: 0, active: 0, sold: 0, deposit_taken: 0 },
          auctions: d.auctions || { total: 0, live: 0, scheduled: 0 },
          users: d.users || { total: 0, newThisMonth: 0 },
          contacts: { pending: d.crm?.contactRequests || 0 },
          offers: { pending: d.crm?.pendingOffers || 0 },
          deposits: { held: 0 },
        });
      }
      setLoading(false);
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingState centered={false} />;

  const stalePayments = recon?.stalePendingPayments.length ?? 0;
  const staleRefunds = recon?.stalePendingRefunds.length ?? 0;
  const hasAlerts = stalePayments > 0 || staleRefunds > 0 || (finance?.total_failed_settlements ?? 0) > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Yönetim Paneli</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">Platformun genel durumu</p>
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div data-tour="admin-alerts" className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-yellow-800 font-semibold text-sm">
            <AlertTriangle className="h-4 w-4" />
            Dikkat Gerektiren İşlemler
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {stalePayments > 0 && (
              <Link href="/admin/reconciliation" className="flex items-center gap-1 text-yellow-700 hover:underline">
                {stalePayments} bekleyen ödeme <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
            {staleRefunds > 0 && (
              <Link href="/admin/reconciliation" className="flex items-center gap-1 text-red-700 hover:underline">
                {staleRefunds} bekleyen iade <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
            {(finance?.total_failed_settlements ?? 0) > 0 && (
              <Link href="/admin/reconciliation" className="flex items-center gap-1 text-red-700 hover:underline">
                {finance!.total_failed_settlements} başarısız sonuçlandırma <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div data-tour="admin-kpis" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={Map}
          label="Aktif İlanlar"
          value={String(stats?.parcels.active ?? 0)}
          subtext={`${stats?.parcels.total ?? 0} toplam`}
          href="/admin/parcels"
          color="text-green-600 bg-green-50"
        />
        <KPICard
          icon={Gavel}
          label="Canlı Açık Artırma"
          value={String(stats?.auctions.live ?? 0)}
          subtext={`${stats?.auctions.scheduled ?? 0} planlanmış`}
          href="/admin/auctions"
          color="text-blue-600 bg-blue-50"
        />
        <KPICard
          icon={Users}
          label="Kullanıcılar"
          value={String(stats?.users.total ?? 0)}
          subtext={`+${stats?.users.newThisMonth ?? 0} bu ay`}
          href="/admin/users"
          color="text-purple-600 bg-purple-50"
        />
        <KPICard
          icon={TrendingUp}
          label="Toplam Tahsilat"
          value={finance ? formatPrice(finance.total_captured_amount) : '₺0'}
          subtext={finance ? `${formatPrice(finance.total_refunded_amount)} iade` : ''}
          href="/admin/analytics"
          color="text-emerald-600 bg-emerald-50"
        />
      </div>

      {/* Quick Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStat
          icon={Phone}
          label="Bekleyen İletişim"
          value={stats?.contacts.pending ?? 0}
          href="/admin/contacts"
          variant={stats?.contacts.pending ? 'warning' : 'default'}
        />
        <QuickStat
          icon={HandCoins}
          label="Bekleyen Teklifler"
          value={stats?.offers.pending ?? 0}
          href="/admin/offers"
          variant={stats?.offers.pending ? 'warning' : 'default'}
        />
        <QuickStat
          icon={Landmark}
          label="Satılan Arsalar"
          value={stats?.parcels.sold ?? 0}
          href="/admin/parcels?status=sold"
        />
        <QuickStat
          icon={CalendarDays}
          label="Sonuçlanan Açık Artırmalar"
          value={finance?.total_settled_auctions ?? 0}
          href="/admin/auctions"
        />
      </div>

      {/* Finance Summary */}
      {finance && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Finansal Özet</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Toplam Tahsilat" value={formatPrice(finance.total_captured_amount)} />
            <StatCard label="Toplam İade" value={formatPrice(finance.total_refunded_amount)} variant="danger" />
            <StatCard label="Sonuçlanan Açık Artırmalar" value={String(finance.total_settled_auctions)} />
            <StatCard
              label="Başarısız Sonuçlandırmalar"
              value={String(finance.total_failed_settlements)}
              variant={finance.total_failed_settlements > 0 ? 'danger' : 'default'}
            />
          </div>
        </div>
      )}

      {/* Mutabakat */}
      {recon && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Mutabakat</h2>
          <p className="text-xs text-[var(--muted-foreground)] mb-3">
            Eşik: {recon.thresholdMinutes} dk | {new Date(recon.generatedAt).toLocaleString('tr-TR')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Bekleyen Ödemeler"
              value={String(recon.stalePendingPayments.length)}
              variant={recon.stalePendingPayments.length > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="Bekleyen İadeler"
              value={String(recon.stalePendingRefunds.length)}
              variant={recon.stalePendingRefunds.length > 0 ? 'danger' : 'default'}
            />
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Hızlı İşlemler</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction href="/admin/parcels/new" icon={Map} label="Yeni Arsa Ekle" />
          <QuickAction href="/admin/auctions/new" icon={Gavel} label="Yeni Açık Artırma" />
          <QuickAction href="/admin/contacts" icon={Phone} label="İletişim Talepleri" />
          <QuickAction href="/admin/reconciliation" icon={CreditCard} label="Mutabakat Kontrol" />
        </div>
      </div>
    </div>
  );
}

function KPICard({
  icon: Icon, label, value, subtext, href, color,
}: {
  icon: any; label: string; value: string; subtext: string; href: string; color: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 hover:shadow-md transition-all group"
    >
      <div className="flex items-center justify-between">
        <div className={`rounded-lg p-2.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-4 text-2xl font-bold">{value}</p>
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
      {subtext && <p className="text-xs text-[var(--muted-foreground)] mt-1">{subtext}</p>}
    </Link>
  );
}

function QuickStat({
  icon: Icon, label, value, href, variant = 'default',
}: {
  icon: any; label: string; value: number; href: string; variant?: 'default' | 'warning';
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg border p-4 transition-all hover:shadow-sm ${
        variant === 'warning' && value > 0
          ? 'border-yellow-200 bg-yellow-50'
          : 'border-[var(--border)] bg-[var(--background)]'
      }`}
    >
      <Icon className="h-5 w-5 text-[var(--muted-foreground)] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold">{value}</p>
        <p className="text-xs text-[var(--muted-foreground)] truncate">{label}</p>
      </div>
    </Link>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-4 hover:border-brand-500 hover:shadow-sm transition-all"
    >
      <Icon className="h-5 w-5 text-brand-500 shrink-0" />
      <span className="font-medium text-sm">{label}</span>
      <ArrowUpRight className="ml-auto h-4 w-4 text-[var(--muted-foreground)]" />
    </Link>
  );
}
