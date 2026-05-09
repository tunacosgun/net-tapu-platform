'use client';

import { useEffect, useState, useCallback } from 'react';
import apiClient from '@/lib/api-client';
import { showApiError } from '@/components/api-error-toast';
import { Card, Badge, EmptyState, LoadingState, Button } from '@/components/ui';
import { formatPrice, formatDate } from '@/lib/format';
import { CreditCard, Calendar, AlertCircle } from 'lucide-react';

interface Plan {
  id: string;
  totalAmount: string;
  installmentCount: number;
  paidCount: number;
  currency: string;
  status: string;
  autoCharge: boolean;
  firstDueDate: string | null;
  createdAt: string;
}

interface Installment {
  id: string;
  sequenceNo: number;
  amount: string;
  dueDate: string;
  status: 'pending' | 'paid' | 'failed' | 'overdue' | 'cancelled';
  paidAt: string | null;
}

const statusBadge: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  paid: 'success',
  pending: 'default',
  failed: 'warning',
  overdue: 'danger',
  cancelled: 'default',
};

const statusLabel: Record<string, string> = {
  paid: 'Ödendi',
  pending: 'Bekliyor',
  failed: 'Başarısız',
  overdue: 'Gecikmiş',
  cancelled: 'İptal',
};

export default function MyInstallmentsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [planDetails, setPlanDetails] = useState<Record<string, Installment[]>>({});
  const [paying, setPaying] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    try {
      const res = await apiClient.get<Plan[]>('/installments/mine');
      setPlans(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      showApiError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  async function togglePlan(planId: string) {
    if (expandedPlan === planId) {
      setExpandedPlan(null);
      return;
    }
    setExpandedPlan(planId);
    if (planDetails[planId]) return;
    try {
      const res = await apiClient.get<{ installments: Installment[] }>(
        `/installments/${planId}`,
      );
      setPlanDetails((prev) => ({ ...prev, [planId]: res.data.installments }));
    } catch (err) {
      showApiError(err);
    }
  }

  async function payInstallment(planId: string, installmentId: string) {
    setPaying(installmentId);
    try {
      await apiClient.post(`/installments/${installmentId}/pay`);
      // Refresh plan details and list
      const res = await apiClient.get<{ installments: Installment[] }>(
        `/installments/${planId}`,
      );
      setPlanDetails((prev) => ({ ...prev, [planId]: res.data.installments }));
      await loadPlans();
    } catch (err) {
      showApiError(err);
    } finally {
      setPaying(null);
    }
  }

  if (loading) return <LoadingState />;

  if (plans.length === 0) {
    return (
      <EmptyState
        icon={<CreditCard className="h-6 w-6" />}
        title="Henüz taksit planınız yok"
        message="Aktif bir taksitli satışınız bulunmuyor."
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold mb-4">Taksitlerim</h1>
      {plans.map((plan) => {
        const remaining = plan.installmentCount - plan.paidCount;
        const isExpanded = expandedPlan === plan.id;
        const installments = planDetails[plan.id] ?? [];

        return (
          <Card key={plan.id}>
            <div
              className="flex items-center justify-between cursor-pointer p-4"
              onClick={() => togglePlan(plan.id)}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-4 w-4 text-brand-600" />
                  <span className="font-semibold">{formatPrice(plan.totalAmount)}</span>
                  <Badge variant={plan.status === 'active' ? 'success' : 'default'}>
                    {plan.status === 'active' ? 'Aktif' : plan.status}
                  </Badge>
                </div>
                <div className="text-sm text-[var(--muted-foreground)]">
                  {plan.paidCount} / {plan.installmentCount} taksit ödendi •{' '}
                  {remaining > 0 ? `${remaining} taksit kaldı` : 'Tamamlandı'}
                </div>
              </div>
              <div className="text-right text-xs text-[var(--muted-foreground)]">
                {plan.firstDueDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> İlk vade: {formatDate(plan.firstDueDate)}
                  </div>
                )}
                <div>{plan.autoCharge ? 'Otomatik tahsilat' : 'Manuel ödeme'}</div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t px-4 pt-3 pb-4">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-[var(--muted-foreground)]">
                    <tr>
                      <th className="text-left py-2">Taksit</th>
                      <th className="text-left py-2">Tutar</th>
                      <th className="text-left py-2">Vade</th>
                      <th className="text-left py-2">Durum</th>
                      <th className="text-right py-2">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installments.map((inst) => {
                      const isOverdue =
                        inst.status === 'overdue' ||
                        (inst.status === 'pending' && new Date(inst.dueDate) < new Date());
                      return (
                        <tr key={inst.id} className="border-t">
                          <td className="py-2">{inst.sequenceNo}</td>
                          <td className="py-2">{formatPrice(inst.amount)}</td>
                          <td className="py-2 flex items-center gap-1">
                            {formatDate(inst.dueDate)}
                            {isOverdue && inst.status !== 'paid' && (
                              <AlertCircle className="h-3 w-3 text-red-500" />
                            )}
                          </td>
                          <td className="py-2">
                            <Badge variant={statusBadge[inst.status] ?? 'default'}>
                              {statusLabel[inst.status] ?? inst.status}
                            </Badge>
                          </td>
                          <td className="py-2 text-right">
                            {(inst.status === 'pending' ||
                              inst.status === 'failed' ||
                              inst.status === 'overdue') && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => payInstallment(plan.id, inst.id)}
                                disabled={paying === inst.id}
                              >
                                {paying === inst.id ? 'Ödeniyor…' : 'Şimdi Öde'}
                              </Button>
                            )}
                            {inst.status === 'paid' && inst.paidAt && (
                              <span className="text-xs text-[var(--muted-foreground)]">
                                {formatDate(inst.paidAt)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
