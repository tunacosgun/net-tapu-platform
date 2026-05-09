'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { showApiError } from '@/components/api-error-toast';
import { LoadingState, PageHeader, StatCard, Badge, Button } from '@/components/ui';
import { formatPrice, formatDate } from '@/lib/format';
import { Play, X } from 'lucide-react';

interface Installment {
  id: string;
  sequenceNo: number;
  amount: string;
  currency: string;
  dueDate: string;
  status: 'pending' | 'paid' | 'failed' | 'overdue' | 'cancelled';
  retryCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  paymentId: string | null;
  paidAt: string | null;
}

interface Plan {
  id: string;
  userId: string;
  parcelId: string;
  totalAmount: string;
  installmentCount: number;
  paidCount: number;
  currency: string;
  status: string;
  autoCharge: boolean;
  firstDueDate: string | null;
  notes: string | null;
  createdAt: string;
}

const statusBadge: Record<Installment['status'], 'success' | 'warning' | 'danger' | 'default'> = {
  paid: 'success',
  pending: 'default',
  failed: 'warning',
  overdue: 'danger',
  cancelled: 'default',
};

const statusLabel: Record<Installment['status'], string> = {
  paid: 'Ödendi',
  pending: 'Bekliyor',
  failed: 'Başarısız',
  overdue: 'Gecikmiş',
  cancelled: 'İptal',
};

export default function AdminInstallmentDetailPage() {
  const params = useParams<{ id: string }>();
  const planId = params.id;
  const [data, setData] = useState<{ plan: Plan; installments: Installment[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [chargingId, setChargingId] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ plan: Plan; installments: Installment[] }>(
        `/admin/installments/${planId}`,
      );
      setData(res.data);
    } catch (err) {
      showApiError(err);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  async function chargeNow(installmentId: string) {
    if (!confirm('Bu taksiti şimdi tahsil etmek istediğinizden emin misiniz?')) return;
    setChargingId(installmentId);
    try {
      await apiClient.post(`/admin/installments/items/${installmentId}/charge`);
      await fetch();
    } catch (err) {
      showApiError(err);
    } finally {
      setChargingId(null);
    }
  }

  async function cancelPlan() {
    const reason = prompt('İptal sebebi:');
    if (!reason) return;
    try {
      await apiClient.post(`/admin/installments/${planId}/cancel`, { reason });
      await fetch();
    } catch (err) {
      showApiError(err);
    }
  }

  if (loading || !data) return <LoadingState />;

  const { plan, installments } = data;

  return (
    <div>
      <PageHeader
        title={`Taksit Planı ${plan.id.slice(0, 8)}`}
        subtitle={`Kullanıcı: ${plan.userId.slice(0, 8)} • Parsel: ${plan.parcelId.slice(0, 8)}`}
        action={
          plan.status === 'active' ? (
            <Button variant="danger" onClick={cancelPlan}>
              <X className="h-4 w-4 mr-1" /> Planı İptal Et
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Toplam" value={formatPrice(plan.totalAmount)} />
        <StatCard
          label="Ödenen"
          value={`${plan.paidCount} / ${plan.installmentCount}`}
          variant="success"
        />
        <StatCard
          label="Plan Durumu"
          value={plan.status}
          variant={plan.status === 'active' ? 'success' : plan.status === 'defaulted' ? 'danger' : 'default'}
        />
        <StatCard label="Mod" value={plan.autoCharge ? 'Otomatik' : 'Manuel'} />
      </div>

      <h2 className="text-lg font-semibold mb-3">Taksitler</h2>
      <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--background-subtle)] text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Tutar</th>
              <th className="px-4 py-3 text-left">Vade</th>
              <th className="px-4 py-3 text-left">Durum</th>
              <th className="px-4 py-3 text-left">Deneme</th>
              <th className="px-4 py-3 text-left">Son Hata</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {installments.map((inst) => (
              <tr key={inst.id} className="hover:bg-[var(--background-subtle)]">
                <td className="px-4 py-3">{inst.sequenceNo}</td>
                <td className="px-4 py-3">{formatPrice(inst.amount)}</td>
                <td className="px-4 py-3">{formatDate(inst.dueDate)}</td>
                <td className="px-4 py-3">
                  <Badge variant={statusBadge[inst.status]}>{statusLabel[inst.status]}</Badge>
                </td>
                <td className="px-4 py-3">{inst.retryCount}</td>
                <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">
                  {inst.lastError ?? '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {(inst.status === 'pending' || inst.status === 'failed' || inst.status === 'overdue') && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => chargeNow(inst.id)}
                      disabled={chargingId === inst.id}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      {chargingId === inst.id ? 'Çekiliyor…' : 'Şimdi Çek'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
