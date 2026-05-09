'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { showApiError } from '@/components/api-error-toast';
import { PageHeader, Button } from '@/components/ui';

export default function NewInstallmentPlanPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    parcelId: '',
    auctionId: '',
    totalAmount: '',
    installmentCount: '12',
    firstDueDate: '',
    autoCharge: true,
    cardToken: '',
    notes: '',
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        userId: form.userId,
        parcelId: form.parcelId,
        totalAmount: form.totalAmount,
        installmentCount: parseInt(form.installmentCount, 10),
        firstDueDate: form.firstDueDate,
        autoCharge: form.autoCharge,
      };
      if (form.auctionId) payload.auctionId = form.auctionId;
      if (form.cardToken) payload.cardToken = form.cardToken;
      if (form.notes) payload.notes = form.notes;

      const res = await apiClient.post<{ id: string }>('/admin/installments', payload);
      router.push(`/admin/installments/${res.data.id}`);
    } catch (err) {
      showApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Yeni Taksit Planı"
        subtitle="Kullanıcı için ödeme planı oluştur"
      />

      <form onSubmit={submit} className="space-y-4 rounded-lg border bg-white p-6">
        <Field
          label="Kullanıcı UUID"
          required
          value={form.userId}
          onChange={(v) => setForm({ ...form, userId: v })}
        />
        <Field
          label="Parsel UUID"
          required
          value={form.parcelId}
          onChange={(v) => setForm({ ...form, parcelId: v })}
        />
        <Field
          label="Açık Artırma UUID (opsiyonel)"
          value={form.auctionId}
          onChange={(v) => setForm({ ...form, auctionId: v })}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Toplam Tutar (TRY)"
            required
            type="number"
            step="0.01"
            value={form.totalAmount}
            onChange={(v) => setForm({ ...form, totalAmount: v })}
          />
          <Field
            label="Taksit Sayısı"
            required
            type="number"
            min="2"
            max="60"
            value={form.installmentCount}
            onChange={(v) => setForm({ ...form, installmentCount: v })}
          />
        </div>
        <Field
          label="İlk Vade Tarihi"
          required
          type="date"
          value={form.firstDueDate}
          onChange={(v) => setForm({ ...form, firstDueDate: v })}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.autoCharge}
            onChange={(e) => setForm({ ...form, autoCharge: e.target.checked })}
          />
          Otomatik tahsilat (cron ile her vadede çek)
        </label>

        {form.autoCharge && (
          <Field
            label="Kart Token (otomatik tahsilat için)"
            value={form.cardToken}
            onChange={(v) => setForm({ ...form, cardToken: v })}
            placeholder="base64-encoded card token"
          />
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Notlar</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={submitting}
          >
            İptal
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Oluşturuluyor…' : 'Plan Oluştur'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        {...rest}
        className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
      />
    </div>
  );
}
