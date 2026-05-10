/**
 * Page-level tour configurations.
 *
 * Each entry is a path-prefix → ordered tour steps.
 * Steps reference DOM elements by `data-tour` selectors that we
 * add to relevant components. Paths are matched by `startsWith` so
 * `/admin/parcels` covers `/admin/parcels/[id]` etc., unless an
 * earlier (more specific) entry already matched.
 *
 * To add a tour to a new page:
 *   1. Add entries to TOUR_CONFIGS keyed by the route prefix.
 *   2. Place `data-tour="<key>"` attributes on the elements you
 *      want highlighted.
 */

export interface TourStep {
  /** CSS selector — typically `[data-tour="key"]` */
  element?: string;
  /** Tooltip title shown above description */
  title: string;
  /** Body text */
  description: string;
  /** Where the popover appears relative to the target */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment along the side */
  align?: 'start' | 'center' | 'end';
}

export interface TourDefinition {
  id: string;
  title: string;
  steps: TourStep[];
}

// ── PUBLIC TOURS ──────────────────────────────────────────────

const HOMEPAGE_TOUR: TourDefinition = {
  id: 'home',
  title: 'NetTapu Anasayfa Turu',
  steps: [
    {
      title: 'NetTapu\'ya Hoş Geldiniz! 👋',
      description:
        'Türkiye\'nin güvenilir arsa ve gayrimenkul açık artırma platformu. Bu kısa tura sizinle birlikte göz atalım.',
    },
    {
      element: '[data-tour="home-search"]',
      title: 'Akıllı Arama',
      description:
        'İl, ilçe, ada/parsel veya ilan numarası girerek anında arsa bulabilirsiniz.',
      side: 'bottom',
    },
    {
      element: '[data-tour="home-popular"]',
      title: 'Popüler Bölgeler',
      description: 'Yatırımcıların yoğun ilgi gösterdiği yerleri tek tıkla keşfedin.',
      side: 'top',
    },
    {
      element: '[data-tour="home-stats"]',
      title: 'Platform Rakamları',
      description:
        'Toplam ilan, aktif açık artırma ve güvenle tamamlanan işlem sayıları.',
      side: 'top',
    },
    {
      element: '[data-tour="header-auctions"]',
      title: 'Canlı Açık Artırmalar',
      description:
        'WebSocket tabanlı gerçek zamanlı ihalelere buradan ulaşın. Sniper protection, kaparo ile katılım, otomatik iade — hepsi hazır.',
      side: 'bottom',
    },
    {
      element: '[data-tour="header-login"]',
      title: 'Üye Olun veya Giriş Yapın',
      description:
        'Favoriler, kayıtlı aramalar, fiyat bildirimleri için üye olun. Kayıt sonrası "Davet & Kazanç" sayfasından arkadaş davet edip 250 TL indirim kuponu kazanabilirsiniz.',
      side: 'bottom',
    },
  ],
};

const PARCELS_LIST_TOUR: TourDefinition = {
  id: 'parcels-list',
  title: 'Arsalar Sayfası',
  steps: [
    {
      title: 'Arsa Kataloğu',
      description:
        'Tüm aktif arsa ilanlarını tek sayfada inceleyebilir, harita üzerinden de görüntüleyebilirsiniz.',
    },
    {
      element: '[data-tour="parcels-filter"]',
      title: 'Gelişmiş Filtreler',
      description:
        'İl/ilçe, fiyat aralığı, m² büyüklüğü, imar durumu — tek tıkla daraltın.',
      side: 'right',
    },
    {
      element: '[data-tour="parcels-map-toggle"]',
      title: 'Harita Görünümü',
      description:
        'Türkiye haritası üzerinde renkli durum etiketleriyle tüm parselleri görün.',
      side: 'bottom',
    },
    {
      element: '[data-tour="parcels-compare"]',
      title: 'Karşılaştırma',
      description:
        'Birden fazla parseli yan yana karşılaştırın — fiyat, m², özellikler.',
      side: 'left',
    },
  ],
};

const PARCEL_DETAIL_TOUR: TourDefinition = {
  id: 'parcel-detail',
  title: 'Parsel Detayı',
  steps: [
    {
      title: 'Parsel Detay Sayfası',
      description: 'Tek bir parsele dair tüm bilgi, görsel, evrak ve aksiyonlar burada.',
    },
    {
      element: '[data-tour="parcel-gallery"]',
      title: 'Görsel Galerisi',
      description:
        'Görseller watermark ile korunur, tam ekran galeri açılabilir.',
      side: 'right',
    },
    {
      element: '[data-tour="parcel-pdf"]',
      title: 'PDF / Yazdır',
      description:
        'Bu parsele özel logo ve watermark içeren resmi PDF\'i tek tıkla indirin.',
      side: 'left',
    },
    {
      element: '[data-tour="parcel-favorite"]',
      title: 'Favori & Bildirim',
      description:
        'Favoriye ekledikten sonra fiyat değişiminde otomatik SMS/push bildirimi alırsınız.',
      side: 'left',
    },
    {
      element: '[data-tour="parcel-offer"]',
      title: 'Teklif Ver',
      description:
        'Doğrudan teklif gönderebilir, yöneticiden karşı teklif alabilirsiniz.',
      side: 'top',
    },
    {
      element: '[data-tour="parcel-whatsapp"]',
      title: 'WhatsApp İletişim',
      description:
        'WhatsApp tıklamasında ilan bilgisi otomatik dolu mesaj olarak iletilir.',
      side: 'top',
    },
  ],
};

const AUCTIONS_LIST_TOUR: TourDefinition = {
  id: 'auctions-list',
  title: 'Açık Artırmalar',
  steps: [
    {
      title: 'Canlı E-İhale',
      description:
        'Tarihli açık artırmalar burada. Aktif ihalelere kaparo yatırarak katılabilirsiniz.',
    },
    {
      element: '[data-tour="auction-status"]',
      title: 'Durum Etiketleri',
      description:
        'Canlı / Planlanmış / Sonuçlandı durumları renklerle ayırt edilir.',
      side: 'right',
    },
  ],
};

const AUCTION_LIVE_TOUR: TourDefinition = {
  id: 'auction-live',
  title: 'Canlı İhale Ekranı',
  steps: [
    {
      title: 'Canlı İhale',
      description:
        'WebSocket üzerinden gerçek zamanlı teklifleri görür ve teklif verirsiniz. Sniper protection son dakika tekliflerinde süreyi otomatik uzatır.',
    },
    {
      element: '[data-tour="auction-current-bid"]',
      title: 'Anlık En Yüksek Teklif',
      description:
        'Pey iletildikçe burası anında güncellenir.',
      side: 'bottom',
    },
    {
      element: '[data-tour="auction-bid-form"]',
      title: 'Teklif Verme',
      description:
        'Kaparo yatırdıysanız buradan teklif verebilirsiniz. "Okudum, kabul ediyorum" onayı zorunludur.',
      side: 'top',
    },
    {
      element: '[data-tour="auction-timer"]',
      title: 'Süre & Sniper Protection',
      description:
        'Son saniyelerde teklif gelirse süre otomatik uzar — adil ve şeffaf yarışma.',
      side: 'bottom',
    },
  ],
};

const REGISTER_TOUR: TourDefinition = {
  id: 'register',
  title: 'Üye Ol',
  steps: [
    {
      title: 'Üye Olun',
      description:
        'Favoriler, kayıtlı aramalar, fiyat bildirimleri ve ihaleye katılım için üye olun.',
    },
    {
      element: '[data-tour="register-social"]',
      title: 'Hızlı Kayıt',
      description: 'Google ile tek tıkla kaydolabilirsiniz.',
      side: 'bottom',
    },
    {
      element: 'form[data-testid="register-form"]',
      title: 'Form ile Kayıt',
      description:
        'Eğer bir davet kodunuz varsa URL\'de "?ref=KOD" olarak gelirse otomatik tanınır.',
      side: 'top',
    },
  ],
};

// ── USER TOURS ────────────────────────────────────────────────

const PROFILE_TOUR: TourDefinition = {
  id: 'profile',
  title: 'Profil & Hesabım',
  steps: [
    {
      title: 'Profilinizdesiniz',
      description: 'Sol menüde tüm hesap fonksiyonlarınız var.',
    },
    {
      element: '[data-tour="profile-favorites"]',
      title: 'Favorilerim',
      description: 'Kaydettiğiniz parseller ve fiyat değişim bildirimleri.',
      side: 'right',
    },
    {
      element: '[data-tour="profile-installments"]',
      title: 'Taksitlerim',
      description:
        'Aktif taksit planlarınız, ödenmiş/kalan taksit sayısı, manuel ödeme.',
      side: 'right',
    },
    {
      element: '[data-tour="profile-referral"]',
      title: 'Davet & Kazanç',
      description:
        'Davet kodunuzu paylaşın, ilk depozit yapanın hem siz hem o 250 TL kupon kazansın.',
      side: 'right',
    },
  ],
};

const REFERRAL_TOUR: TourDefinition = {
  id: 'referral',
  title: 'Davet & Kazanç',
  steps: [
    {
      title: 'Paylaş ve Kazan',
      description:
        'Davet ettiğiniz arkadaşınız ilk depozit yaptığında her ikinize de 250 TL\'lik indirim kuponu otomatik tanımlanır.',
    },
    {
      element: '[data-tour="referral-code"]',
      title: 'Davet Kodunuz',
      description:
        '8 haneli benzersiz kodunuz. Kayıt formuna girilirse veya linkle gelirse tanınır.',
      side: 'bottom',
    },
    {
      element: '[data-tour="referral-share"]',
      title: 'Hızlı Paylaş',
      description:
        'WhatsApp, Twitter, mail — sistem mevcut paylaşım yöntemlerini otomatik tarar.',
      side: 'bottom',
    },
  ],
};

const INSTALLMENTS_USER_TOUR: TourDefinition = {
  id: 'installments-user',
  title: 'Taksitlerim',
  steps: [
    {
      title: 'Taksit Planlarınız',
      description:
        'Otomatik tahsilat aktif planlar her vade gününde otomatik kart çekimi yapar; manuel planlarda "Şimdi Öde" butonunu kullanın.',
    },
  ],
};

// ── ADMIN TOURS ───────────────────────────────────────────────

const ADMIN_DASHBOARD_TOUR: TourDefinition = {
  id: 'admin-dashboard',
  title: 'Admin Paneli',
  steps: [
    {
      title: 'NetTapu Yönetim Paneli',
      description:
        'Buradan platformun her köşesini yönetebilirsiniz. Hızlı tura başlayalım.',
    },
    {
      element: '[data-tour="admin-sidebar"]',
      title: 'Sol Menü',
      description:
        'Kullanıcılar, Arsalar, Açık Artırmalar, Finans, CRM, İçerik, Pazarlama, Sistem — gruplanmış erişim.',
      side: 'right',
    },
    {
      element: '[data-tour="admin-kpis"]',
      title: 'KPI Kartları',
      description: 'Aktif ilanlar, canlı ihaleler, kullanıcılar ve toplam tahsilat — anlık.',
      side: 'bottom',
    },
    {
      element: '[data-tour="admin-alerts"]',
      title: 'Dikkat Gerektiren İşlemler',
      description:
        'Bekleyen ödemeler, başarısız sonuçlandırmalar — buradan tek tıkla mutabakata.',
      side: 'bottom',
    },
  ],
};

const ADMIN_PARCELS_TOUR: TourDefinition = {
  id: 'admin-parcels',
  title: 'Admin → Arsalar',
  steps: [
    {
      title: 'Arsa Yönetimi',
      description:
        'Tüm parseller — taslaklar dahil. CSV/XLSX import-export, toplu fiyat güncellemeleri ve inline edit destekli.',
    },
    {
      element: '[data-tour="admin-parcels-export"]',
      title: 'Export',
      description:
        'XLSX (Excel native) veya BOM\'lu CSV (Türkçe karakter destekli) olarak indirin.',
      side: 'bottom',
    },
    {
      element: '[data-tour="admin-parcels-import"]',
      title: 'Import',
      description: 'Excel veya CSV ile toplu parsel ekleyin/güncelleyin.',
      side: 'bottom',
    },
    {
      element: '[data-tour="admin-parcels-bulk"]',
      title: 'Toplu Fiyat Güncelle',
      description:
        'Filtre uygulayıp seçili parsellerin fiyatlarını yüzde bazında topluca artırın/azaltın.',
      side: 'bottom',
    },
  ],
};

const ADMIN_INSTALLMENTS_TOUR: TourDefinition = {
  id: 'admin-installments',
  title: 'Admin → Taksitli Satış',
  steps: [
    {
      title: 'Taksit Yönetimi',
      description:
        'Aktif/tamamlanmış planlar. Her plan bireysel taksitleri ile takip edilir; cron worker her gün vade kontrolü yapar.',
    },
  ],
};

const ADMIN_MAIL_ORDER_TOUR: TourDefinition = {
  id: 'admin-mail-order',
  title: 'Admin → Mail Order',
  steps: [
    {
      title: 'Mail Order (MOTO)',
      description:
        'Telefonla alınan kart bilgisi ile 3DS bypass tahsilat. Operatör kimliği ledger\'a yazılır.',
    },
  ],
};

const ADMIN_AUCTIONS_TOUR: TourDefinition = {
  id: 'admin-auctions',
  title: 'Admin → Açık Artırmalar',
  steps: [
    {
      title: 'İhale Yönetimi',
      description:
        'İhaleleri zamanlayın, sniper protection ayarlarını yapın, settlement durumunu izleyin.',
    },
  ],
};

const ADMIN_USERS_TOUR: TourDefinition = {
  id: 'admin-users',
  title: 'Admin → Kullanıcılar',
  steps: [
    {
      title: 'Kullanıcı Yönetimi',
      description:
        'Roller (superadmin, admin, user, consultant, dealer), bans, aktivite logları.',
    },
  ],
};

const ADMIN_SETTINGS_TOUR: TourDefinition = {
  id: 'admin-settings',
  title: 'Admin → Ayarlar',
  steps: [
    {
      title: 'Site Ayarları',
      description:
        'Logo, iletişim bilgileri, sosyal medya linkleri ve sistem tanıtıcısı (tour) durumunu yönetin.',
    },
    {
      element: '[data-tour="settings-tour-toggle"]',
      title: 'Sistem Tanıtıcısı Anahtarı',
      description:
        'Bu turu tüm site genelinde kapatabilirsiniz. Sağ alttaki "?" butonu ve otomatik açılış da gizlenir.',
      side: 'bottom',
    },
  ],
};

const ADMIN_ANALYTICS_TOUR: TourDefinition = {
  id: 'admin-analytics',
  title: 'Admin → Analitik',
  steps: [
    {
      title: 'Analitik Dashboard',
      description:
        'Genel bakış, zaman serileri, gelir trendi, popüler parseller, CRM, aktivite akışı.',
    },
  ],
};

const ADMIN_EKENT_HINT_TOUR: TourDefinition = {
  id: 'admin-ekent',
  title: 'E-Kent Provider Yönetimi',
  steps: [
    {
      title: 'E-Kent Otomasyonu',
      description:
        'Belediye URL pattern\'lerini yönetebilirsiniz. POST /admin/ekent/providers — şehir/ilçe → URL şablonu.',
    },
  ],
};

// ── REGISTRY ──────────────────────────────────────────────────
// Path-prefix → tour. More specific paths must come first.

export const TOUR_CONFIGS: Array<{ pathPrefix: string; tour: TourDefinition }> = [
  // Admin (specific)
  { pathPrefix: '/admin/parcels', tour: ADMIN_PARCELS_TOUR },
  { pathPrefix: '/admin/auctions', tour: ADMIN_AUCTIONS_TOUR },
  { pathPrefix: '/admin/users', tour: ADMIN_USERS_TOUR },
  { pathPrefix: '/admin/installments', tour: ADMIN_INSTALLMENTS_TOUR },
  { pathPrefix: '/admin/mail-order', tour: ADMIN_MAIL_ORDER_TOUR },
  { pathPrefix: '/admin/settings', tour: ADMIN_SETTINGS_TOUR },
  { pathPrefix: '/admin/analytics', tour: ADMIN_ANALYTICS_TOUR },
  { pathPrefix: '/admin/ekent', tour: ADMIN_EKENT_HINT_TOUR },
  // Admin dashboard fallback (matches /admin exactly via list-order)
  { pathPrefix: '/admin', tour: ADMIN_DASHBOARD_TOUR },

  // User (specific)
  { pathPrefix: '/profile/installments', tour: INSTALLMENTS_USER_TOUR },
  { pathPrefix: '/profile/referral', tour: REFERRAL_TOUR },
  { pathPrefix: '/profile', tour: PROFILE_TOUR },

  // Public auctions
  { pathPrefix: '/auctions/', tour: AUCTION_LIVE_TOUR },
  { pathPrefix: '/auctions', tour: AUCTIONS_LIST_TOUR },

  // Public parcels
  { pathPrefix: '/parcels/', tour: PARCEL_DETAIL_TOUR },
  { pathPrefix: '/parcels', tour: PARCELS_LIST_TOUR },

  // Public auth
  { pathPrefix: '/register', tour: REGISTER_TOUR },

  // Public homepage (root)
  { pathPrefix: '/', tour: HOMEPAGE_TOUR },
];

/** Resolve a tour for a given pathname (longest matching prefix wins). */
export function resolveTour(pathname: string): TourDefinition | null {
  for (const { pathPrefix, tour } of TOUR_CONFIGS) {
    if (
      pathname === pathPrefix ||
      pathname.startsWith(pathPrefix === '/' ? '/' : pathPrefix + '/') ||
      pathname.startsWith(pathPrefix)
    ) {
      // For root, only match exactly to avoid catching everything
      if (pathPrefix === '/' && pathname !== '/') continue;
      return tour;
    }
  }
  return null;
}
