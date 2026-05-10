'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';
import { showApiError } from '@/components/api-error-toast';
import { LoadingState, Button, Badge } from '@/components/ui';
import { Share2, Copy, Check, Gift, Users, Wallet } from 'lucide-react';

interface ReferralCredit {
  id: string;
  amount: string;
  currency: string;
  status: 'pending' | 'available' | 'used' | 'expired' | 'cancelled';
  triggerEvent: string;
  notes: string | null;
  createdAt: string;
  expiresAt: string | null;
}

interface Summary {
  referralCode: string;
  invitedCount: number;
  totalEarnedAmount: string;
  availableAmount: string;
  usedAmount: string;
  credits: ReferralCredit[];
}

const statusLabel: Record<ReferralCredit['status'], string> = {
  pending: 'Bekliyor',
  available: 'Kullanılabilir',
  used: 'Kullanıldı',
  expired: 'Süresi Doldu',
  cancelled: 'İptal',
};

export default function MyReferralPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiClient
      .get<Summary>('/referral/me')
      .then((r) => setData(r.data))
      .catch((err) => showApiError(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!data) return null;

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/register?ref=${data.referralCode}`
      : `https://nettapu.com/register?ref=${data.referralCode}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  }

  function share() {
    if (navigator.share) {
      navigator
        .share({
          title: 'NetTapu - Sana özel hediye!',
          text: `${data!.referralCode} kodumla NetTapu'ya kayıt ol, ilk depozitinde ${data!.totalEarnedAmount === '0.00' ? '250' : ''} TL indirim kazan!`,
          url: inviteUrl,
        })
        .catch(() => {});
    } else {
      copyLink();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Davet & Kazanç</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Arkadaşlarınızı davet edin, ikiniz de 250 TL kupon kazanın.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card icon={<Users className="h-5 w-5" />} label="Davet Edilen" value={String(data.invitedCount)} />
        <Card
          icon={<Wallet className="h-5 w-5" />}
          label="Kullanılabilir"
          value={`${parseFloat(data.availableAmount).toLocaleString('tr-TR')} TL`}
          highlight
        />
        <Card
          icon={<Gift className="h-5 w-5" />}
          label="Toplam Kazanç"
          value={`${parseFloat(data.totalEarnedAmount).toLocaleString('tr-TR')} TL`}
        />
      </div>

      {/* Code + share */}
      <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-amber-50 p-6">
        <p className="text-xs font-semibold uppercase text-emerald-700 mb-1">
          Davet Kodun
        </p>
        <div className="flex items-center gap-3" data-tour="referral-code">
          <code className="text-3xl font-bold tracking-wider font-mono text-slate-900">
            {data.referralCode}
          </code>
        </div>

        <div className="mt-5 flex gap-2 flex-wrap" data-tour="referral-share">
          <input
            readOnly
            value={inviteUrl}
            className="flex-1 min-w-0 rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-mono"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <Button onClick={copyLink} variant="secondary">
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? 'Kopyalandı!' : 'Linki Kopyala'}
          </Button>
          <Button onClick={share} variant="primary">
            <Share2 className="h-4 w-4 mr-1" /> Paylaş
          </Button>
        </div>

        <p className="mt-4 text-xs text-slate-600">
          Davet ettiğiniz kullanıcı NetTapu'ya kaydolup ilk depozit ödemesini yaptığında her ikinize
          de 250 TL'lik indirim kuponu otomatik tanımlanır.
        </p>
      </div>

      {/* Credits history */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Kazançlarım</h2>
        {data.credits.length === 0 ? (
          <p className="rounded-lg border bg-white p-6 text-sm text-[var(--muted-foreground)] text-center">
            Henüz kazancın yok. Davet linkini paylaşmaya başla!
          </p>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Tarih</th>
                  <th className="px-4 py-3 text-left">Açıklama</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                  <th className="px-4 py-3 text-left">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.credits.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                      {new Date(c.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-4 py-3">{c.notes ?? c.triggerEvent}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {parseFloat(c.amount).toLocaleString('tr-TR')} {c.currency}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.status === 'available' ? 'success' : 'default'}>
                        {statusLabel[c.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        highlight
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-[var(--border)] bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`${highlight ? 'text-emerald-700' : 'text-[var(--muted-foreground)]'}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
    </div>
  );
}
