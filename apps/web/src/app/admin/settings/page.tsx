'use client';

import { useEffect, useState, useRef } from 'react';
import apiClient from '@/lib/api-client';
import { showApiError } from '@/components/api-error-toast';
import { PageHeader, Card, Button, Alert, LoadingState } from '@/components/ui';
import { GripVertical, Eye, EyeOff, X, Plus } from 'lucide-react';

interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

/* ── Logo Upload Component ── */
function LogoUploader({
  label,
  description,
  settingKey,
  currentUrl,
  onUploaded,
  accept,
}: {
  label: string;
  description: string;
  settingKey: string;
  currentUrl: string;
  onUploaded: (key: string, url: string) => void;
  accept?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await apiClient.post<{ url: string }>('/admin/settings/upload-logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploaded(settingKey, data.url);
    } catch (err) {
      showApiError(err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="flex items-start gap-4 rounded-lg border border-[var(--border)] p-4">
      {/* Preview */}
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)] overflow-hidden cursor-pointer"
        onClick={() => fileRef.current?.click()}
      >
        {currentUrl ? (
          <img src={currentUrl} alt={label} className="h-full w-full object-contain p-1" />
        ) : (
          <svg className="h-8 w-8 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        )}
      </div>

      <div className="flex-1">
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
        <input ref={fileRef} type="file" accept={accept || 'image/*'} onChange={handleFile} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mt-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs font-medium hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
        >
          {uploading ? 'Yükleniyor...' : currentUrl ? 'Değiştir' : 'Yükle'}
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={() => onUploaded(settingKey, '')}
            className="ml-2 text-xs text-red-500 hover:underline"
          >
            Kaldır
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Video Upload Component ── */
function VideoUploader({
  currentUrl,
  onUploaded,
}: {
  currentUrl: string;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await apiClient.post<{ url: string }>('/admin/settings/upload-logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
          }
        },
      });
      onUploaded(data.url);
    } catch (err) {
      showApiError(err);
    } finally {
      setUploading(false);
      setProgress(0);
      e.target.value = '';
    }
  }

  const isVideo = currentUrl && currentUrl.match(/\.(mp4|webm|ogg)(\?|$)/i);

  return (
    <div className="flex items-start gap-4 rounded-lg border border-[var(--border)] p-4">
      <div
        className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)] overflow-hidden cursor-pointer"
        onClick={() => fileRef.current?.click()}
      >
        {isVideo ? (
          <video src={currentUrl} className="h-full w-full object-cover" muted />
        ) : (
          <svg className="h-8 w-8 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold">Video Dosyası Yükle</h3>
        <p className="text-xs text-[var(--muted-foreground)]">MP4, WebM veya OGG formatında video dosyası (maks. 100MB)</p>
        <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/ogg" onChange={handleFile} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mt-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs font-medium hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
        >
          {uploading ? `Yükleniyor... ${progress}%` : currentUrl ? 'Değiştir' : 'Video Yükle'}
        </button>
        {currentUrl && (
          <button type="button" onClick={() => onUploaded('')} className="ml-2 text-xs text-red-500 hover:underline">
            Kaldır
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Setting Groups ── */
type SettingField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'email' | 'tel' | 'url' | 'password' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  help?: string;
};

type SettingGroup = {
  title: string;
  icon: string;
  description: string;
  keys: SettingField[];
  collapsed?: boolean;
};

const SETTING_GROUPS: SettingGroup[] = [
  {
    title: 'Genel Bilgiler',
    icon: '🏢',
    description: 'Site adı, açıklaması ve temel bilgiler',
    keys: [
      { key: 'site_title', label: 'Site Adı', type: 'text', placeholder: 'NetTapu' },
      { key: 'site_description', label: 'Site Açıklaması', type: 'textarea', placeholder: 'Gayrimenkul ve arsa alım-satım platformu' },
      { key: 'default_currency', label: 'Para Birimi', type: 'text', placeholder: 'TRY' },
      { key: 'copyright_text', label: 'Telif Hakkı Metni', type: 'text', placeholder: '© 2026 NetTapu. Tüm hakları saklıdır.' },
    ],
  },
  {
    title: 'İletişim Bilgileri',
    icon: '📞',
    description: 'Müşteri iletişim bilgileri (header, footer ve iletişim sayfasında görünür)',
    keys: [
      { key: 'contact_phone', label: 'Telefon', type: 'tel', placeholder: '0850 XXX XX XX' },
      { key: 'contact_email', label: 'E-posta', type: 'email', placeholder: 'info@nettapu.com' },
      { key: 'whatsapp_number', label: 'WhatsApp', type: 'tel', placeholder: '905551234567' },
      { key: 'address', label: 'Adres', type: 'textarea', placeholder: 'Firma adresi' },
    ],
  },
  {
    title: 'Sosyal Medya',
    icon: '🌐',
    description: 'Sosyal medya bağlantıları (footer ve iletişim sayfasında görünür)',
    keys: [
      { key: 'social_facebook', label: 'Facebook', type: 'url', placeholder: 'https://facebook.com/nettapu' },
      { key: 'social_twitter', label: 'X (Twitter)', type: 'url', placeholder: 'https://twitter.com/nettapu' },
      { key: 'social_instagram', label: 'Instagram', type: 'url', placeholder: 'https://instagram.com/nettapu' },
      { key: 'social_linkedin', label: 'LinkedIn', type: 'url', placeholder: 'https://linkedin.com/company/nettapu' },
      { key: 'social_youtube', label: 'YouTube', type: 'url', placeholder: 'https://youtube.com/@nettapu' },
    ],
  },
  {
    title: 'SEO & Analitik',
    icon: '📊',
    description: 'Arama motoru optimizasyonu ve analiz araçları',
    keys: [
      { key: 'seo_meta_title', label: 'Varsayılan Meta Başlık', type: 'text', placeholder: 'NetTapu — Online Arsa Satış Platformu' },
      { key: 'seo_meta_description', label: 'Varsayılan Meta Açıklama', type: 'textarea', placeholder: 'Türkiyenin güvenilir online arsa açık artırma platformu.' },
      { key: 'google_analytics_id', label: 'Google Analytics ID', type: 'text', placeholder: 'G-XXXXXXXXXX' },
      { key: 'google_tag_manager_id', label: 'Google Tag Manager ID', type: 'text', placeholder: 'GTM-XXXXXXX' },
    ],
  },
  {
    title: 'Header & Footer',
    icon: '🎨',
    description: 'Üst ve alt menü metinleri',
    keys: [
      { key: 'header_announcement', label: 'Duyuru Bandı (boş = gizli)', type: 'text', placeholder: 'Yeni arsalar eklendi! Hemen inceleyin.' },
      { key: 'footer_tagline', label: 'Footer Alt Yazı', type: 'text', placeholder: 'Gayrimenkul ve arsa alım-satımı için güvenilir açık artırma platformu.' },
    ],
  },
];

const INTEGRATION_GROUPS: SettingGroup[] = [
  {
    title: 'Havale / EFT Bilgileri',
    icon: '🏦',
    description: 'Kullanıcılara gösterilecek banka hesap bilgileri',
    collapsed: false,
    keys: [
      { key: 'bank_name', label: 'Banka Adı', type: 'text', placeholder: 'Ziraat Bankası' },
      { key: 'bank_iban', label: 'IBAN', type: 'text', placeholder: 'TR00 0000 0000 0000 0000 0000 00' },
      { key: 'bank_account_holder', label: 'Hesap Sahibi', type: 'text', placeholder: 'Şirket Adı' },
      { key: 'bank_swift_code', label: 'SWIFT Kodu (Opsiyonel)', type: 'text', placeholder: 'TCZBTR2A' },
      { key: 'bank_branch', label: 'Şube (Opsiyonel)', type: 'text', placeholder: 'Merkez Şube' },
    ],
  },
  {
    title: 'Ödeme Sistemi (POS)',
    icon: '💳',
    description: 'Sanal POS entegrasyon ayarları — PayTR veya iyzico',
    collapsed: true,
    keys: [
      { key: 'pos_provider', label: 'POS Sağlayıcı', type: 'select', options: [
        { value: 'mock', label: 'Test Modu (Mock)' },
        { value: 'paytr', label: 'PayTR' },
        { value: 'iyzico', label: 'iyzico' },
      ], help: 'Canlıya geçmeden önce test modu ile deneyin' },
      { key: 'paytr_merchant_id', label: 'PayTR Merchant ID', type: 'text', placeholder: 'XXXXXX' },
      { key: 'paytr_merchant_key', label: 'PayTR Merchant Key', type: 'password', placeholder: '••••••••' },
      { key: 'paytr_merchant_salt', label: 'PayTR Merchant Salt', type: 'password', placeholder: '••••••••' },
      { key: 'paytr_callback_url', label: 'PayTR Callback URL', type: 'url', placeholder: 'https://domain.com/api/v1/payments/callback' },
      { key: 'paytr_ok_url', label: 'PayTR Başarılı URL', type: 'url', placeholder: 'https://domain.com/payment/success' },
      { key: 'paytr_fail_url', label: 'PayTR Başarısız URL', type: 'url', placeholder: 'https://domain.com/payment/fail' },
      { key: 'paytr_test_mode', label: 'PayTR Test Modu', type: 'select', options: [
        { value: '1', label: 'Açık (Test)' },
        { value: '0', label: 'Kapalı (Canlı)' },
      ] },
      { key: 'iyzico_api_key', label: 'iyzico API Key', type: 'password', placeholder: '••••••••' },
      { key: 'iyzico_secret_key', label: 'iyzico Secret Key', type: 'password', placeholder: '••••••••' },
      { key: 'iyzico_base_url', label: 'iyzico Base URL', type: 'url', placeholder: 'https://sandbox-api.iyzipay.com' },
      { key: 'iyzico_callback_url', label: 'iyzico Callback URL', type: 'url', placeholder: 'https://domain.com/api/v1/payments/iyzico/callback' },
    ],
  },
  {
    title: 'E-posta (SendGrid)',
    icon: '📧',
    description: 'E-posta gönderim servisi ayarları',
    collapsed: true,
    keys: [
      { key: 'sendgrid_api_key', label: 'SendGrid API Key', type: 'password', placeholder: 'SG.xxxxxxxxxxxxx' },
      { key: 'sendgrid_from_email', label: 'Gönderici E-posta', type: 'email', placeholder: 'noreply@domain.com', help: 'E-postalar bu adresten gönderilir' },
      { key: 'sendgrid_from_name', label: 'Gönderici Adı', type: 'text', placeholder: 'Platform Adı' },
    ],
  },
  {
    title: 'SMS (NetGSM)',
    icon: '📱',
    description: 'SMS gönderim servisi ayarları',
    collapsed: true,
    keys: [
      { key: 'netgsm_usercode', label: 'NetGSM Kullanıcı Kodu', type: 'text', placeholder: '850XXXXXXX' },
      { key: 'netgsm_password', label: 'NetGSM Şifre', type: 'password', placeholder: '••••••••' },
      { key: 'netgsm_msgheader', label: 'SMS Başlık (Sender ID)', type: 'text', placeholder: 'FIRMAADI', help: 'SMS gönderildiğinde görünen başlık' },
    ],
  },
];

/* ── Collapsible integration card ── */
function IntegrationCard({
  group, settings, updateSetting,
}: {
  group: SettingGroup;
  settings: Record<string, string>;
  updateSetting: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  const togglePwVisibility = (key: string) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filledCount = group.keys.filter((k) => settings[k.key]).length;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-[var(--muted)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{group.icon}</span>
          <div>
            <h2 className="text-sm font-semibold">{group.title}</h2>
            <p className="text-xs text-[var(--muted-foreground)]">{group.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {filledCount > 0 && (
            <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
              {filledCount}/{group.keys.length} ayarlandı
            </span>
          )}
          <svg className={`h-5 w-5 text-[var(--muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-6 py-5 space-y-4">
          {group.keys.map((setting) => (
            <div key={setting.key}>
              <label className="block text-sm font-medium mb-1">{setting.label}</label>
              {setting.type === 'select' && setting.options ? (
                <select
                  value={settings[setting.key] || ''}
                  onChange={(e) => updateSetting(setting.key, e.target.value)}
                  className="w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Seçiniz...</option>
                  {setting.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : setting.type === 'textarea' ? (
                <textarea
                  value={settings[setting.key] || ''}
                  onChange={(e) => updateSetting(setting.key, e.target.value)}
                  rows={3}
                  placeholder={setting.placeholder}
                  className="w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm font-mono text-xs resize-none focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              ) : setting.type === 'password' ? (
                <div className="relative">
                  <input
                    type={visiblePasswords.has(setting.key) ? 'text' : 'password'}
                    value={settings[setting.key] || ''}
                    onChange={(e) => updateSetting(setting.key, e.target.value)}
                    placeholder={setting.placeholder}
                    className="w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 pr-10 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => togglePwVisibility(setting.key)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    {visiblePasswords.has(setting.key) ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </button>
                </div>
              ) : (
                <input
                  type={setting.type}
                  value={settings[setting.key] || ''}
                  onChange={(e) => updateSetting(setting.key, e.target.value)}
                  placeholder={setting.placeholder}
                  className="w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
              {setting.help && (
                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{setting.help}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── Corporate Nav Manager ── */
type CorporateNavItem = {
  label: string;
  href: string;
  description?: string;
  icon?: string;
  active?: boolean;
};

const DEFAULT_CORPORATE_NAV_ITEMS: CorporateNavItem[] = [
  { label: 'Hakkımızda', href: '/about', description: 'Şirketimiz hakkında' },
  { label: 'Vizyon', href: '/vision', description: '2030 hedeflerimiz' },
  { label: 'Misyon', href: '/mission', description: 'Değerlerimiz' },
  { label: 'Nasıl Çalışır?', href: '/how-it-works', description: 'Platform süreci' },
  { label: 'Referanslar', href: '/references', description: 'İş ortaklarımız' },
  { label: 'Projelerimiz', href: '/projects', description: 'Tamamlanan projeler' },
  { label: 'Müşteri Yorumları', href: '/testimonials', description: 'Kullanıcı deneyimleri' },
  { label: 'Basın', href: '/press', description: 'Medyada NetTapu' },
  { label: 'Gayrimenkul Rehberi', href: '/real-estate-guide', description: 'Yatırım rehberi' },
  { label: 'Satış Sonrası', href: '/post-sale', description: 'Destek süreçleri' },
  { label: 'İletişim', href: '/contact', description: 'Bize ulaşın' },
];

function CorporateNavManager({
  value,
  onChange,
}: {
  value: string;
  onChange: (json: string) => void;
}) {
  const [open, setOpen] = useState(false);

  function parseItems(): CorporateNavItem[] {
    if (!value) return DEFAULT_CORPORATE_NAV_ITEMS;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : DEFAULT_CORPORATE_NAV_ITEMS;
    } catch {
      return DEFAULT_CORPORATE_NAV_ITEMS;
    }
  }

  const items = parseItems();

  function commit(next: CorporateNavItem[]) {
    onChange(JSON.stringify(next));
  }

  function updateItem(index: number, patch: Partial<CorporateNavItem>) {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    commit(next);
  }

  function removeItem(index: number) {
    commit(items.filter((_, i) => i !== index));
  }

  function addItem() {
    commit([...items, { label: '', href: '/', description: '', active: true }]);
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-[var(--muted)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🗂️</span>
          <div>
            <h2 className="text-sm font-semibold">Kurumsal Menü</h2>
            <p className="text-xs text-[var(--muted-foreground)]">Header'daki "Kurumsal" dropdown menüsünde yer alan sayfalar</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
            {items.length} öğe
          </span>
          <svg className={`h-5 w-5 text-[var(--muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-6 py-5 space-y-3">
          {/* Column headers */}
          <div className="grid grid-cols-[24px_1fr_1fr_1fr_32px_32px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            <span />
            <span>Etiket</span>
            <span>Href (yol)</span>
            <span>Açıklama</span>
            <span className="text-center">Aktif</span>
            <span />
          </div>

          {items.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-[24px_1fr_1fr_1fr_32px_32px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2"
            >
              {/* Drag handle (visual only) */}
              <span className="flex items-center justify-center text-[var(--muted-foreground)] cursor-grab">
                <GripVertical className="h-4 w-4" />
              </span>

              {/* Label */}
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateItem(index, { label: e.target.value })}
                placeholder="Etiket"
                className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />

              {/* Href */}
              <input
                type="text"
                value={item.href}
                onChange={(e) => updateItem(index, { href: e.target.value })}
                placeholder="/sayfa"
                className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 py-1.5 text-xs font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />

              {/* Description */}
              <input
                type="text"
                value={item.description || ''}
                onChange={(e) => updateItem(index, { description: e.target.value })}
                placeholder="Kısa açıklama (opsiyonel)"
                className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />

              {/* Active toggle */}
              <button
                type="button"
                onClick={() => updateItem(index, { active: !(item.active ?? true) })}
                title={(item.active ?? true) ? 'Aktif — gizlemek için tıklayın' : 'Gizli — göstermek için tıklayın'}
                className={`flex items-center justify-center rounded p-1 transition-colors ${
                  (item.active ?? true)
                    ? 'text-brand-600 hover:bg-brand-50'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'
                }`}
              >
                {(item.active ?? true) ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={() => removeItem(index)}
                title="Kaldır"
                className="flex items-center justify-center rounded p-1 text-red-500 hover:bg-red-50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--muted-foreground)] hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-colors w-full justify-center"
          >
            <Plus className="h-4 w-4" />
            Yeni Ekle
          </button>

          <p className="text-[11px] text-[var(--muted-foreground)]">
            Değişiklikler sayfanın üstündeki "Kaydet" butonuna basıldığında uygulanır.
          </p>
        </div>
      )}
    </Card>
  );
}

/* ── Auto-generated defaults for JWT & Notification ── */
function generateHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

const AUTO_DEFAULTS: Record<string, () => string> = {
  jwt_secret: () => generateHex(64),
  jwt_issuer: () => 'nettapu',
  jwt_audience: () => 'nettapu-platform',
  internal_service_key: () => generateHex(32),
  notification_dispatch_enabled: () => 'true',
  notification_poll_interval_ms: () => '5000',
  notification_batch_size: () => '10',
  email_verification_expiry_hours: () => '24',
  password_reset_expiry_minutes: () => '30',
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    apiClient
      .get<SystemSetting[]>('/admin/settings')
      .then(({ data }) => {
        const map: Record<string, string> = {};
        if (Array.isArray(data)) {
          data.forEach((s) => {
            const raw = s.value;
            map[s.key] = typeof raw === 'string' ? raw : typeof raw === 'object' ? (raw as any)?.toString?.() ?? JSON.stringify(raw) : String(raw);
          });
        }

        // Set default corporate nav items if not present
        if (!map['corporate_nav_items']) {
          map['corporate_nav_items'] = JSON.stringify(DEFAULT_CORPORATE_NAV_ITEMS);
        }

        // Auto-generate missing JWT & notification defaults
        let generated = false;
        for (const [key, factory] of Object.entries(AUTO_DEFAULTS)) {
          if (!map[key]) {
            map[key] = factory();
            generated = true;
          }
        }
        setSettings(map);

        // Persist auto-generated values immediately
        if (generated) {
          const autoSettings: Record<string, string> = {};
          for (const key of Object.keys(AUTO_DEFAULTS)) {
            autoSettings[key] = map[key];
          }
          apiClient.patch('/admin/settings', { settings: autoSettings }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateSetting(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSuccess(false);
  }

  async function handleSave() {
    setSaving(true);
    setSuccess(false);
    try {
      await apiClient.patch('/admin/settings', { settings });
      setSuccess(true);
      setDirty(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Site Ayarları"
        subtitle="Logo, iletişim, sosyal medya ve SEO ayarlarını yönetin"
        action={
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="text-xs text-amber-600 font-medium">Kaydedilmemiş değişiklikler var</span>
            )}
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        }
      />

      {success && (
        <Alert variant="success">Ayarlar başarıyla kaydedildi.</Alert>
      )}

      {/* ── Sistem Tanıtıcısı (Tour) ── */}
      <Card className="p-6" data-tour="settings-tour-toggle">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🎯</span>
          <div>
            <h2 className="text-lg font-semibold">Sistem Tanıtıcısı</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Ziyaretçi ve admin sayfalarında interaktif tur (sağ alttaki "?" butonu + ilk ziyarette otomatik açılış).
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={(settings.tour_enabled ?? 'true') !== 'false'}
              onChange={(e) =>
                updateSetting('tour_enabled', e.target.checked ? 'true' : 'false')
              }
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <div>
              <span className="text-sm font-medium">Sistem tanıtıcısını aç</span>
              <p className="text-xs text-[var(--muted-foreground)]">
                Kapatıldığında her sayfadaki "?" butonu ve otomatik açılış gizlenir.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={(settings.tour_auto_start ?? 'true') !== 'false'}
              disabled={(settings.tour_enabled ?? 'true') === 'false'}
              onChange={(e) =>
                updateSetting('tour_auto_start', e.target.checked ? 'true' : 'false')
              }
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 disabled:opacity-50"
            />
            <div>
              <span className="text-sm font-medium">Yeni ziyaretçi için otomatik başlat</span>
              <p className="text-xs text-[var(--muted-foreground)]">
                Her sayfanın ilk ziyaretinde tur otomatik açılır. Kullanıcı "Bir daha gösterme" derse kapanır.
              </p>
            </div>
          </label>
        </div>
      </Card>

      {/* ── Logo & Branding Section ── */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🖼️</span>
          <div>
            <h2 className="text-lg font-semibold">Logo & Marka</h2>
            <p className="text-xs text-[var(--muted-foreground)]">Site logosu, favicon ve filigran görseli</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <LogoUploader
            label="Site Logosu"
            description="Header ve footer'da görünecek logo (PNG/SVG, şeffaf arka plan önerilir)"
            settingKey="site_logo"
            currentUrl={settings.site_logo || ''}
            onUploaded={updateSetting}
            accept="image/png,image/svg+xml,image/webp"
          />
          <LogoUploader
            label="Favicon"
            description="Tarayıcı sekmesindeki küçük ikon (ICO/PNG, 32x32 veya 64x64)"
            settingKey="site_favicon"
            currentUrl={settings.site_favicon || ''}
            onUploaded={updateSetting}
            accept="image/x-icon,image/png,image/vnd.microsoft.icon"
          />
          <LogoUploader
            label="Filigran Logosu"
            description="Arsa görselleri üzerine eklenecek watermark logosu (PNG, şeffaf arka plan)"
            settingKey="watermark_logo"
            currentUrl={settings.watermark_logo || ''}
            onUploaded={updateSetting}
            accept="image/png,image/webp"
          />
        </div>
      </Card>

      {/* ── Tanıtım Videosu ── */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🎬</span>
          <div>
            <h2 className="text-lg font-semibold">Tanıtım Videosu</h2>
            <p className="text-xs text-[var(--muted-foreground)]">Ana sayfada gösterilecek tanıtım videosu (MP4 yükleyin veya YouTube/Vimeo URL girin)</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Video file upload */}
          <VideoUploader
            currentUrl={settings.intro_video_url || ''}
            onUploaded={(url) => updateSetting('intro_video_url', url)}
          />

          {/* Or enter URL manually */}
          <div>
            <label className="block text-sm font-medium mb-1">veya Video URL (YouTube / Vimeo embed linki)</label>
            <input
              type="url"
              value={settings.intro_video_url || ''}
              onChange={(e) => updateSetting('intro_video_url', e.target.value)}
              placeholder="https://www.youtube.com/embed/... veya /uploads/video.mp4"
              className="w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
              MP4 yüklerseniz otomatik doldurulur. Veya YouTube embed URL yapıştırabilirsiniz.
            </p>
          </div>

          {/* Preview */}
          {settings.intro_video_url && (
            <div className="mt-2">
              <p className="text-xs font-medium mb-1">Önizleme:</p>
              <div className="relative w-full max-w-md overflow-hidden rounded-lg bg-black" style={{ paddingBottom: '56.25%' }}>
                {settings.intro_video_url.match(/\.(mp4|webm|ogg)(\?|$)/i) ? (
                  <video
                    src={settings.intro_video_url}
                    controls
                    className="absolute inset-0 h-full w-full"
                  />
                ) : (
                  <iframe
                    src={settings.intro_video_url}
                    title="Video Önizleme"
                    className="absolute inset-0 h-full w-full"
                    allowFullScreen
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Setting Groups ── */}
      {SETTING_GROUPS.map((group) => (
        <Card key={group.title} className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">{group.icon}</span>
            <div>
              <h2 className="text-lg font-semibold">{group.title}</h2>
              <p className="text-xs text-[var(--muted-foreground)]">{group.description}</p>
            </div>
          </div>
          <div className="space-y-4">
            {group.keys.map((setting) => (
              <div key={setting.key}>
                <label className="block text-sm font-medium mb-1">{setting.label}</label>
                {setting.type === 'textarea' ? (
                  <textarea
                    value={settings[setting.key] || ''}
                    onChange={(e) => updateSetting(setting.key, e.target.value)}
                    rows={3}
                    placeholder={setting.placeholder}
                    className="w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm resize-none focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                ) : (
                  <input
                    type={setting.type}
                    value={settings[setting.key] || ''}
                    onChange={(e) => updateSetting(setting.key, e.target.value)}
                    placeholder={setting.placeholder}
                    className="w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      {/* ── Integration & Credentials Section ── */}
      <div className="pt-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Entegrasyon Ayarları</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mb-4">
          Ödeme, SMS, e-posta ve bildirim servislerinin bağlantı bilgileri. Bu bilgiler şifreli olarak saklanır.
        </p>
        <div className="space-y-3">
          {INTEGRATION_GROUPS.map((group) => (
            <IntegrationCard
              key={group.title}
              group={group}
              settings={settings}
              updateSetting={updateSetting}
            />
          ))}
        </div>
      </div>

      {/* ── Kurumsal Menü Section ── */}
      <div className="pt-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Kurumsal Menü</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <CorporateNavManager
          value={settings.corporate_nav_items || ''}
          onChange={(json) => updateSetting('corporate_nav_items', json)}
        />
      </div>

      {/* Bottom save */}
      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="shadow-lg">
            {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </Button>
        </div>
      )}
    </div>
  );
}
