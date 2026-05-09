'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import { showApiError } from '@/components/api-error-toast';
import { TableSkeleton } from '@/components/skeleton';
import { formatPrice, formatDate } from '@/lib/format';
import { PageHeader, DataTable, Badge, Pagination, Button, type Column } from '@/components/ui';

interface InstallmentPlan {
  id: string;
  userId: string;
  parcelId: string;
  auctionId: string | null;
  totalAmount: string;
  installmentCount: number;
  paidCount: number;
  currency: string;
  status: 'active' | 'completed' | 'cancelled' | 'defaulted';
  autoCharge: boolean;
  firstDueDate: string | null;
  notes: string | null;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  active: 'Aktif',
  completed: 'Tamamlandı',
  cancelled: 'İptal Edildi',
  defaulted: 'Temerrüt',
};

const statusColors: Record<string, 'success' | 'default' | 'danger' | 'warning'> = {
  active: 'success',
  completed: 'default',
  cancelled: 'default',
  defaulted: 'danger',
};

export default function AdminInstallmentsPage() {
  const [data, setData] = useState<{ data: InstallmentPlan[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const res = await apiClient.get<{ data: InstallmentPlan[]; total: number }>(
        '/admin/installments',
        { params },
      );
      setData(res.data);
    } catch (err) {
      showApiError(err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const columns: Column<InstallmentPlan>[] = [
    {
      header: 'Plan',
      accessor: (p) => (
        <Link
          href={`/admin/installments/${p.id}`}
          className="text-brand-600 hover:underline font-mono text-xs"
        >
          {p.id.slice(0, 8)}…
        </Link>
      ),
    },
    {
      header: 'Toplam',
      accessor: (p) => formatPrice(p.totalAmount),
    },
    {
      header: 'Taksit',
      accessor: (p) => `${p.paidCount} / ${p.installmentCount}`,
    },
    {
      header: 'Durum',
      accessor: (p) => (
        <Badge variant={statusColors[p.status] ?? 'default'}>
          {statusLabels[p.status] ?? p.status}
        </Badge>
      ),
    },
    {
      header: 'Mod',
      accessor: (p) => (p.autoCharge ? 'Otomatik' : 'Manuel'),
    },
    {
      header: 'İlk Vade',
      accessor: (p) => (p.firstDueDate ? formatDate(p.firstDueDate) : '—'),
    },
    {
      header: 'Oluşturma',
      accessor: (p) => formatDate(p.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Taksitli Satış Planları"
        subtitle="Aktif ve tamamlanmış taksit planlarını yönetin"
        action={
          <Link href="/admin/installments/new">
            <Button variant="primary">Yeni Plan</Button>
          </Link>
        }
      />

      <div className="flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          <option value="">Tümü</option>
          <option value="active">Aktif</option>
          <option value="completed">Tamamlandı</option>
          <option value="cancelled">İptal Edildi</option>
          <option value="defaulted">Temerrüt</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            keyExtractor={(p) => p.id}
            emptyMessage="Henüz taksit planı oluşturulmamış."
          />
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / 50))}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
