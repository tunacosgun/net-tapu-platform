'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { showApiError } from '@/components/api-error-toast';
import { PageHeader, Button } from '@/components/ui';
import { CreditCard, ShieldAlert, CheckCircle2 } from 'lucide-react';

function Banner({
  variant,
  children,
}: {
  variant: 'warning' | 'success' | 'error';
  children: React.ReactNode;
}) {
  const styles = {
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  } as const;
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${styles[variant]}`}>
      <div className="flex-1">{children}</div>
    </div>
  );
}

interface MailOrderResult {
  id: string;
  status: string;
  amount: string;
  currency: string;
  description: string | null;
}

export default function AdminMailOrderPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<MailOrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: '',
    parcelId: '',
    auctionId: '',
    amount: '',
    currency: 'TRY',
    cardHolder: '',
    cardNumber: '',
    expMonth: '',
    expYear: '',
    cvc: '',
    buyerEmail: '',
    buyerPhone: '',
    description: '',
    operatorNotes: '',
  });

  function update(k: keyof typeof form, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    const payload: Record<string, unknown> = {
      userId: form.userId.trim(),
      amount: form.amount.replace(',', '.'),
      currency: form.currency,
      idempotencyKey: `moto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cardHolder: form.cardHolder.trim(),
      cardNumber: form.cardNumber.replace(/\s+/g, ''),
      expMonth: form.expMonth.padStart(2, '0'),
      expYear: form.expYear.length === 2 ? '20' + form.expYear : form.expYear,
      cvc: form.cvc,
    };
    if (form.parcelId.trim()) payload.parcelId = form.parcelId.trim();
    if (form.auctionId.trim()) payload.auctionId = form.auctionId.trim();
    if (form.buyerEmail.trim()) payload.buyerEmail = form.buyerEmail.trim();
    if (form.buyerPhone.trim()) payload.buyerPhone = form.buyerPhone.trim();
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.operatorNotes.trim()) payload.operatorNotes = form.operatorNotes.trim();

    try {
      const res = await apiClient.post<MailOrderResult>(
        '/payments/admin/mail-order',
        payload,
      );
      setResult(res.data);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Mail order başarısız oldu.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      showApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const success = ['provisioned', 'completed'].includes(result.status);
    return (
      <div className="max-w-2xl">
        <PageHeader title="Mail Order Sonucu" />
        <div className="mt-6 rounded-lg border bg-white p-6 space-y-4">
          {success ? (
            <Banner variant="success">
              Tahsilat başarılı (status: <strong>{result.status}</strong>).
            </Banner>
          ) : (
            <Banner variant="warning">
              İşlem tamamlandı, durum: <strong>{result.status}</strong>
            </Banner>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-[var(--muted-foreground)]">Payment ID</dt>
            <dd className="font-mono text-xs break-all">{result.id}</dd>
            <dt className="text-[var(--muted-foreground)]">Tutar</dt>
            <dd>
              {result.amount} {result.currency}
            </dd>
            <dt className="text-[var(--muted-foreground)]">Açıklama</dt>
            <dd className="break-all">{result.description ?? '—'}</dd>
          </dl>

          <div className="flex gap-2">
            <Button variant="primary" onClick={() => router.push('/admin/deposits')}>
              Ödemelere Dön
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
            >
              Yeni Mail Order
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Mail Order Tahsilat"
        subtitle="Telefon üzerinden alınan kart bilgisiyle MOTO modunda tahsilat (3DS bypass)"
      />

      <Banner variant="warning">
        <strong>Dikkat:</strong> Mail Order işlemleri 3D Secure'dan geçmez. Sadece kart sahibinin
        telefonda kimliğini doğruladıktan sonra başlatın. Tüm işlemler operatör kimliğiyle ledger'a
        yazılır.
      </Banner>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border bg-white p-6">
        {error && <Banner variant="error">{error}</Banner>}

        <h3 className="font-semibold text-sm uppercase text-[var(--muted-foreground)]">
          Müşteri & Tutar
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Kullanıcı UUID"
            required
            value={form.userId}
            onChange={(v) => update('userId', v)}
          />
          <Field
            label="Tutar (TRY)"
            required
            type="text"
            placeholder="1000.00"
            value={form.amount}
            onChange={(v) => update('amount', v)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Parsel UUID (opsiyonel)"
            value={form.parcelId}
            onChange={(v) => update('parcelId', v)}
          />
          <Field
            label="Açık Artırma UUID (opsiyonel)"
            value={form.auctionId}
            onChange={(v) => update('auctionId', v)}
          />
        </div>

        <h3 className="font-semibold text-sm uppercase text-[var(--muted-foreground)] pt-2">
          Kart Bilgileri
        </h3>

        <Field
          label="Kart Üzerindeki İsim"
          required
          value={form.cardHolder}
          onChange={(v) => update('cardHolder', v)}
        />

        <Field
          label="Kart Numarası"
          required
          inputMode="numeric"
          maxLength={19}
          placeholder="•••• •••• •••• ••••"
          value={form.cardNumber}
          onChange={(v) => update('cardNumber', v.replace(/\D/g, ''))}
          mono
        />

        <div className="grid grid-cols-3 gap-4">
          <Field
            label="Ay (MM)"
            required
            inputMode="numeric"
            maxLength={2}
            placeholder="MM"
            value={form.expMonth}
            onChange={(v) => update('expMonth', v.replace(/\D/g, ''))}
          />
          <Field
            label="Yıl (YYYY)"
            required
            inputMode="numeric"
            maxLength={4}
            placeholder="YYYY"
            value={form.expYear}
            onChange={(v) => update('expYear', v.replace(/\D/g, ''))}
          />
          <Field
            label="CVC"
            required
            inputMode="numeric"
            maxLength={4}
            placeholder="•••"
            value={form.cvc}
            onChange={(v) => update('cvc', v.replace(/\D/g, ''))}
            mono
          />
        </div>

        <h3 className="font-semibold text-sm uppercase text-[var(--muted-foreground)] pt-2">
          İletişim & Notlar
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Email"
            type="email"
            value={form.buyerEmail}
            onChange={(v) => update('buyerEmail', v)}
          />
          <Field
            label="Telefon"
            value={form.buyerPhone}
            onChange={(v) => update('buyerPhone', v)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Açıklama</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Operatör Notu (ledger'a yazılır)</label>
          <textarea
            value={form.operatorNotes}
            onChange={(e) => update('operatorNotes', e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
            rows={2}
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
            <CreditCard className="h-4 w-4 mr-2" />
            {submitting ? 'Tahsil Ediliyor…' : 'Tahsil Et'}
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
  mono,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  mono?: boolean;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  maxLength?: number;
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
        className={`w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm ${
          mono ? 'font-mono tracking-wider' : ''
        }`}
      />
    </div>
  );
}
