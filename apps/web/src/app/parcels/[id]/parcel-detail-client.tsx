'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import { formatPrice, resolveImageUrl } from '@/lib/format';
import { Badge, LoadingState } from '@/components/ui';
import { parcelStatusConfig } from '@/components/ui/badge';
import { ShareButtons } from '@/components/share-buttons';
import { CallMeForm } from '@/components/call-me-form';
import { AppointmentForm } from '@/components/appointment-form';
import { TkgmParselMap } from '@/components/tkgm-parsel-map';
import { useViewerTracking } from '@/hooks/use-viewer-tracking';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { getWatermarkedUrl } from '@/lib/watermark';
import { ParcelImageGallery } from '@/components/parcel/ParcelImageGallery';
import type { Parcel, ParcelImage } from '@/types';
import {
  Heart, Search as SearchIcon, ExternalLink, MapPin, Maximize2,
  Calendar, Clock, FileText, ChevronLeft, ChevronRight, X,
  Download, Printer, Share2, Phone, Bell, ImageIcon, Loader2,
  Landmark, TreePine, Ruler, Tag, Eye, Building2, MessageCircle, User,
} from 'lucide-react';

/* ─────────────────────── PDF Export ─────────────────────── */
async function loadFontAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function getImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 800, h: 600 });
    img.src = dataUrl;
  });
}

async function generatePDF(parcel: Parcel, images: ParcelImage[], siteSettings: Record<string, string>) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = 210;
  const ph = 297;
  const margin = 18;
  const cw = pw - margin * 2;

  const siteName = siteSettings.site_title || 'NetTapu';
  const siteDesc = siteSettings.site_description || 'Gayrimenkul ve Arsa Platformu';

  let fontFamily = 'helvetica';
  try {
    const [regularB64, boldB64] = await Promise.all([
      loadFontAsBase64('/fonts/NotoSans-Regular.ttf'),
      loadFontAsBase64('/fonts/NotoSans-Bold.ttf'),
    ]);
    doc.addFileToVFS('NotoSans-Regular.ttf', regularB64);
    doc.addFileToVFS('NotoSans-Bold.ttf', boldB64);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
    fontFamily = 'NotoSans';
    doc.setFont('NotoSans', 'normal');
  } catch (e) {
    console.warn('Font loading failed, using helvetica:', e);
  }

  const dark: [number, number, number] = [30, 41, 59];
  const medium: [number, number, number] = [71, 85, 105];
  const light: [number, number, number] = [148, 163, 184];
  const veryLight: [number, number, number] = [241, 245, 249];
  const brand: [number, number, number] = [22, 163, 74];

  function addWatermark() {
    const gState = new (doc as any).GState({ opacity: 0.04 });
    doc.saveGraphicsState();
    (doc as any).setGState(gState);
    doc.setTextColor(150, 160, 170);
    doc.setFontSize(56);
    doc.setFont(fontFamily, 'bold');
    for (let wy = 40; wy < ph + 20; wy += 60) {
      for (let wx = -30; wx < pw + 30; wx += 120) {
        doc.text(siteName, wx, wy, { angle: 30 } as any);
      }
    }
    doc.restoreGraphicsState();
  }

  function addFooter(pageNum: number, totalPages: number) {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, 280, pw - margin, 280);
    doc.setFontSize(6.5);
    doc.setFont(fontFamily, 'normal');
    doc.setTextColor(...light);
    doc.text(`Bu belge ${siteName} platformu tarafından otomatik olarak oluşturulmuştur. Bilgilendirme amaçlıdır, hukuki bağlayıcılığı yoktur.`, margin, 284);
    const phone = siteSettings.contact_phone || '0850 XXX XX XX';
    const email = siteSettings.contact_email || '';
    doc.text([phone, email].filter(Boolean).join('  ·  '), margin, 288);
    doc.text(`Sayfa ${pageNum} / ${totalPages}`, pw - margin, 288, { align: 'right' });
  }

  let y = margin;

  doc.setTextColor(...dark);
  doc.setFontSize(16);
  doc.setFont(fontFamily, 'bold');
  doc.text(siteName, margin, y + 5);
  doc.setFontSize(7);
  doc.setFont(fontFamily, 'normal');
  doc.setTextColor(...medium);
  doc.text(siteDesc, margin, y + 10);
  doc.setFontSize(9);
  doc.setFont(fontFamily, 'bold');
  doc.setTextColor(...dark);
  doc.text(parcel.listingId || '', pw - margin, y + 5, { align: 'right' });
  doc.setFontSize(7);
  doc.setFont(fontFamily, 'normal');
  doc.setTextColor(...light);
  const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(dateStr, pw - margin, y + 10, { align: 'right' });

  y += 14;
  doc.setDrawColor(...brand);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pw - margin, y);
  y += 10;

  doc.setTextColor(...dark);
  doc.setFontSize(18);
  doc.setFont(fontFamily, 'bold');
  const titleLines = doc.splitTextToSize(parcel.title || '', cw);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7.5 + 2;

  doc.setFontSize(9.5);
  doc.setFont(fontFamily, 'normal');
  doc.setTextColor(...medium);
  doc.text([parcel.city, parcel.district, parcel.neighborhood].filter(Boolean).join(', '), margin, y);
  y += 10;

  doc.setFontSize(7.5);
  doc.setFont(fontFamily, 'normal');
  doc.setTextColor(...medium);
  doc.text('SATIŞ FİYATI', margin, y);
  y += 8;
  doc.setFontSize(20);
  doc.setFont(fontFamily, 'bold');
  doc.setTextColor(...brand);
  doc.text(formatPrice(parcel.price) || 'Fiyat Belirtilmemiş', margin, y);
  y += 6;
  if (parcel.price && parcel.areaM2) {
    const ppm2 = Math.round(parseFloat(parcel.price) / parseFloat(parcel.areaM2));
    doc.setFontSize(9);
    doc.setFont(fontFamily, 'normal');
    doc.setTextColor(...medium);
    doc.text(`m² Fiyatı: ${formatPrice(String(ppm2))} / m²`, margin, y);
    y += 5;
  }
  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pw - margin, y);
  y += 8;

  doc.setTextColor(...dark);
  doc.setFontSize(11);
  doc.setFont(fontFamily, 'bold');
  doc.text('Arsa Bilgileri', margin, y);
  y += 7;

  const details: [string, string][] = [];
  if (parcel.areaM2) details.push(['Alan', `${Number(parcel.areaM2).toLocaleString('tr-TR')} m²`]);
  if (parcel.ada) details.push(['Ada No', parcel.ada]);
  if (parcel.parsel) details.push(['Parsel No', parcel.parsel]);
  if (parcel.zoningStatus) details.push(['İmar Durumu', parcel.zoningStatus]);
  if (parcel.landType) details.push(['Arazi Türü', parcel.landType]);
  details.push(['İl', parcel.city || '']);
  details.push(['İlçe', parcel.district || '']);
  if (parcel.neighborhood) details.push(['Mahalle', parcel.neighborhood]);
  if (parcel.address) details.push(['Adres', parcel.address]);
  details.push(['Durum', parcel.status === 'active' ? 'Satışta' : parcel.status === 'sold' ? 'Satıldı' : parcel.status === 'draft' ? 'Taslak' : parcel.status]);
  if (parcel.isAuctionEligible) details.push(['Açık Artırma', 'Uygun']);
  if (parcel.isFeatured) details.push(['Öne Çıkan', 'Evet']);

  const colW = cw / 2;
  for (let i = 0; i < details.length; i += 2) {
    if (Math.floor(i / 2) % 2 === 0) {
      doc.setFillColor(...veryLight);
      doc.rect(margin, y - 4, cw, 7.5, 'F');
    }
    doc.setFontSize(8);
    doc.setFont(fontFamily, 'normal');
    doc.setTextColor(...medium);
    doc.text(details[i][0], margin + 3, y);
    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(...dark);
    doc.text(details[i][1], margin + 36, y);
    if (i + 1 < details.length) {
      doc.setFont(fontFamily, 'normal');
      doc.setTextColor(...medium);
      doc.text(details[i + 1][0], margin + colW + 3, y);
      doc.setFont(fontFamily, 'bold');
      doc.setTextColor(...dark);
      doc.text(details[i + 1][1], margin + colW + 36, y);
    }
    y += 7.5;
  }
  y += 6;

  if (parcel.description) {
    doc.setTextColor(...dark);
    doc.setFontSize(11);
    doc.setFont(fontFamily, 'bold');
    doc.text('Açıklama', margin, y);
    y += 6;
    doc.setFontSize(8.5);
    doc.setFont(fontFamily, 'normal');
    doc.setTextColor(...medium);
    const descLines = doc.splitTextToSize(parcel.description, cw);
    doc.text(descLines.slice(0, 10), margin, y);
    y += Math.min(descLines.length, 10) * 4 + 6;
  }

  const maxImgW = cw;
  const maxImgH = 55;
  const imagesToShow = images.slice(0, 3);

  for (let imgIdx = 0; imgIdx < imagesToShow.length; imgIdx++) {
    try {
      const imgUrl = resolveImageUrl(imagesToShow[imgIdx]);
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const dim = await getImageDimensions(dataUrl);
      let dispW = maxImgW;
      let dispH = (dim.h / dim.w) * dispW;
      if (dispH > maxImgH) {
        dispH = maxImgH;
        dispW = (dim.w / dim.h) * dispH;
      }

      if (y + dispH + 8 > 275) { doc.addPage(); y = margin; }
      if (imgIdx === 0) {
        doc.setTextColor(...dark);
        doc.setFontSize(11);
        doc.setFont(fontFamily, 'bold');
        doc.text('Görseller', margin, y);
        y += 5;
      }

      const imgX = margin + (cw - dispW) / 2;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(imgX - 0.5, y - 0.5, dispW + 1, dispH + 1, 'S');
      doc.addImage(dataUrl, 'JPEG', imgX, y, dispW, dispH, undefined, 'MEDIUM');
      y += dispH + 5;
    } catch {
      // skip
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addWatermark();
    addFooter(i, pageCount);
  }

  doc.save(`${siteName}_${parcel.listingId || parcel.id}_Arsa_Raporu.pdf`);
}

/* ─────────────────────── Consultant type ─────────────────────── */
interface ConsultantInfo {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

/* ─────────────────────── Component ─────────────────────── */
export default function ParcelDetailClient() {
  const params = useParams<{ id: string }>();
  const parcelId = params.id;
  const { isAuthenticated } = useAuthStore();
  const siteSettings = useSiteSettings();

  const siteName = siteSettings.site_title || 'NetTapu';

  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [images, setImages] = useState<ParcelImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCallMe, setShowCallMe] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favToggling, setFavToggling] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [wmImages, setWmImages] = useState<Record<number, string>>({});
  const [consultant, setConsultant] = useState<ConsultantInfo | null>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  const liveViewerCount = useViewerTracking(parcelId);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [parcelRes, imagesRes] = await Promise.all([
          apiClient.get<Parcel>(`/parcels/${parcelId}`),
          apiClient.get<ParcelImage[]>(`/parcels/${parcelId}/images`).catch(() => ({ data: [] as ParcelImage[] })),
        ]);
        if (!cancelled) {
          setParcel(parcelRes.data);
          setImages(imagesRes.data);
          setLoading(false);
          // Fetch consultant if assigned
          if (parcelRes.data.assignedConsultant) {
            apiClient.get<ConsultantInfo>(`/users/${parcelRes.data.assignedConsultant}/profile`)
              .then(({ data }) => { if (!cancelled) setConsultant(data); })
              .catch(() => {});
          }
        }
      } catch {
        if (!cancelled) { setError('Arsa bilgisi yüklenemedi.'); setLoading(false); }
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [parcelId]);

  useEffect(() => {
    if (!images.length || !siteName) return;
    let cancelled = false;
    // Generate stable 10-digit numeric listing number from parcel UUID
    const pid = parcel?.id || '';
    images.forEach((img, idx) => {
      const url = resolveImageUrl(img);
      getWatermarkedUrl(url, siteName).then((wmUrl) => {
        if (!cancelled) setWmImages((prev) => ({ ...prev, [idx]: wmUrl }));
      });
    });
    return () => { cancelled = true; };
  }, [images, siteName, parcel?.id]);

  useEffect(() => {
    if (!isAuthenticated) return;
    apiClient.get<{ id: string; parcelId: string }[]>('/favorites')
      .then(({ data }) => { if (data.find((f) => f.parcelId === parcelId)) setIsFavorited(true); })
      .catch(() => {});
  }, [isAuthenticated, parcelId]);

  useEffect(() => {
    if (parcel) {
      document.title = `${parcel.title} - ${parcel.city}, ${parcel.district} | ${siteName}`;
      const jsonLd = {
        '@context': 'https://schema.org', '@type': 'RealEstateListing',
        name: parcel.title,
        description: parcel.description || `${parcel.city}, ${parcel.district} konumunda arsa`,
        url: window.location.href,
        ...(parcel.price && { offers: { '@type': 'Offer', price: parseFloat(parcel.price), priceCurrency: parcel.currency || 'TRY' } }),
        ...(parcel.latitude && parcel.longitude && { geo: { '@type': 'GeoCoordinates', latitude: parseFloat(parcel.latitude), longitude: parseFloat(parcel.longitude) } }),
        address: { '@type': 'PostalAddress', addressLocality: parcel.district, addressRegion: parcel.city, addressCountry: 'TR' },
      };
      let script = document.getElementById('json-ld-parcel') as HTMLScriptElement;
      if (!script) { script = document.createElement('script'); script.id = 'json-ld-parcel'; script.type = 'application/ld+json'; document.head.appendChild(script); }
      script.textContent = JSON.stringify(jsonLd);
      return () => { script.remove(); };
    }
  }, [parcel, siteName]);

  const toggleFavorite = useCallback(async () => {
    if (!isAuthenticated || favToggling) return;
    setFavToggling(true);
    try {
      if (isFavorited) {
        const { data } = await apiClient.get<{ id: string; parcelId: string }[]>('/favorites');
        const fav = data.find((f) => f.parcelId === parcelId);
        if (fav) await apiClient.delete(`/favorites/${fav.id}`);
        setIsFavorited(false);
      } else {
        await apiClient.post('/favorites', { parcelId });
        setIsFavorited(true);
      }
    } catch {} finally { setFavToggling(false); }
  }, [isAuthenticated, isFavorited, favToggling, parcelId]);

  const handlePDF = async () => {
    if (!parcel || pdfLoading) return;
    setPdfLoading(true);
    try {
      // Backend-rendered PDF (logo + watermark + detail table + QR)
      const res = await apiClient.get<Blob>(`/parcels/${parcel.id}/pdf`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `parsel-${parcel.listingId || parcel.id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF generation error:', e);
      alert('PDF oluşturulurken bir hata oluştu.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleOfferSubmit = async () => {
    if (!offerAmount || offerSubmitting || !parcel) return;
    setOfferSubmitting(true);
    try {
      await apiClient.post('/crm/offers', {
        parcelId: parcel.id,
        amount: offerAmount.replace(/\./g, '').replace(',', '') || offerAmount,
        message: offerMessage || undefined,
      });
      alert('Teklifiniz başarıyla gönderildi!');
      setShowOffer(false);
      setOfferAmount('');
      setOfferMessage('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Teklif gönderilemedi. Lütfen giriş yapın.';
      alert(msg);
    } finally {
      setOfferSubmitting(false);
    }
  };

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><LoadingState centered={false} /></div>;
  if (error || !parcel) return <div className="flex min-h-[400px] flex-col items-center justify-center gap-4"><p className="text-red-600">{error || 'Arsa bulunamadı.'}</p><Link href="/parcels" className="text-sm text-brand-500 hover:underline">Arsalara dön</Link></div>;

  const status = parcelStatusConfig(parcel.status);
  const whatsappNumber = siteSettings.whatsapp_number || '905000000000';
  const parcelUrl = `https://nettapu-demo.tunasoft.tech/parcels/${parcel.id}`;
  const wpLines: string[] = [];
  wpLines.push('Merhaba,');
  wpLines.push('Aşağıdaki ilan hakkında detaylı bilgi almak istiyorum.');
  wpLines.push('');
  wpLines.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  if (parcel.listingId) wpLines.push('İlan No: ' + parcel.listingId);
  wpLines.push(parcel.title);
  if (parcel.city && parcel.district) wpLines.push('Konum: ' + parcel.city + ', ' + parcel.district);
  if (parcel.ada && parcel.parsel) wpLines.push('Ada / Parsel: ' + parcel.ada + ' / ' + parcel.parsel);
  if (parcel.areaM2) wpLines.push('Alan: ' + Number(parcel.areaM2).toLocaleString('tr-TR') + ' m²');
  if (parcel.price) wpLines.push('Fiyat: ' + parseFloat(parcel.price).toLocaleString('tr-TR') + ' \u20BA');
  wpLines.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  wpLines.push('');
  wpLines.push(parcelUrl);
  const whatsappMessage = encodeURIComponent(wpLines.join('\n'));
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
  const tkgmBaseUrl = 'https://parselsorgu.tkgm.gov.tr';
  const pricePerM2 = parcel.pricePerM2
    ? Math.round(parseFloat(parcel.pricePerM2))
    : (parcel.price && parcel.areaM2 ? Math.round(parseFloat(parcel.price) / parseFloat(parcel.areaM2)) : null);

  /* ─── Detail rows for the info table ─── */
  const detailRows: { label: string; value: string }[] = [];
  const ilanNo = (() => { const id = parcel.id || ''; const hash = id.split('').reduce((a: number, c: string) => ((a * 31 + c.charCodeAt(0)) >>> 0), 5381); return String(hash % 9000000000 + 1000000000); })();
  detailRows.push({ label: 'İlan No', value: ilanNo });
  if (parcel.listedAt && parcel.showListingDate !== false) detailRows.push({ label: 'İlan Tarihi', value: new Date(parcel.listedAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) });
  detailRows.push({ label: 'Emlak Tipi', value: 'Satılık Arsa' });
  if (parcel.zoningStatus) detailRows.push({ label: 'İmar Durumu', value: parcel.zoningStatus });
  if (parcel.areaM2) detailRows.push({ label: 'm²', value: Number(parcel.areaM2).toLocaleString('tr-TR') });
  if (pricePerM2) detailRows.push({ label: 'm² Fiyatı', value: formatPrice(String(pricePerM2)) });
  if (parcel.ada) detailRows.push({ label: 'Ada No', value: parcel.ada });
  if (parcel.parsel) detailRows.push({ label: 'Parsel No', value: parcel.parsel });
  if (parcel.landType) detailRows.push({ label: 'Arazi Türü', value: parcel.landType });
  if (parcel.isAuctionEligible) detailRows.push({ label: 'Açık Artırma', value: 'Uygun' });
  if (parcel.isFeatured) detailRows.push({ label: 'Öne Çıkan', value: 'Evet' });
  if (parcel.deedType) detailRows.push({ label: 'Tapu Türü', value: parcel.deedType });
  if (parcel.vatRate !== undefined && parcel.vatRate !== null) detailRows.push({ label: 'KDV Oranı', value: `%${parcel.vatRate}` });
  detailRows.push({ label: 'Tapu Harcı', value: 'Alıcı Öder' });

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 print:px-0 print:py-0">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 print:hidden mb-4 flex-wrap">
        <Link href="/" className="hover:text-emerald-600 transition-colors">Ana Sayfa</Link>
        <span className="text-slate-300">&gt;</span>
        <Link href="/parcels" className="hover:text-emerald-600 transition-colors">Arsalar</Link>
        <span className="text-slate-300">&gt;</span>
        <Link href={`/parcels?city=${parcel.city}`} className="hover:text-emerald-600 transition-colors">{parcel.city}</Link>
        {parcel.district && (
          <>
            <span className="text-slate-300">&gt;</span>
            <span className="text-slate-600">{parcel.district}</span>
          </>
        )}
        <span className="text-slate-300">&gt;</span>
        <span className="text-slate-900 font-medium truncate max-w-[260px]">{parcel.title}</span>
      </nav>

      {/* ─── MAIN TWO-COLUMN LAYOUT ─── */}
      <div className="grid gap-5 lg:grid-cols-12">

        {/* LEFT: Photo Gallery + TKGM Map */}
        <div className="lg:col-span-7">
          {/* Status badge above gallery */}
          <div className="mb-2 flex items-center gap-2">
            <Badge variant={status.variant} className="text-xs px-2.5 py-1 shadow-sm">{status.label}</Badge>
          </div>
          <div data-tour="parcel-gallery">
          <ParcelImageGallery
            images={images}
            wmImages={wmImages}
            title={parcel.title}
            listingNumber={(() => {
              const pid = parcel?.id || '';
              const h = pid.split('').reduce((a: number, c: string) => ((a * 31 + c.charCodeAt(0)) >>> 0), 5381);
              return String((h % 9000000000) + 1000000000);
            })()}
          />
          </div>

          {/* TKGM Kadastro Haritası — görsel altında, tam genişlik */}
          {parcel.ada && parcel.parsel && parcel.city && parcel.district && (
            <div className="mt-4 print:hidden">
              <TkgmParselMap
                city={parcel.city}
                district={parcel.district}
                ada={parcel.ada}
                parsel={parcel.parsel}
              />
            </div>
          )}
        </div>

        {/* RIGHT: Price + Info Table + Consultant */}
        <div className="lg:col-span-5">
          {/* Price + Actions Header */}
          <div className="rounded-t-lg border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{formatPrice(parcel.price)}</p>
                {pricePerM2 && (
                  <p className="text-sm text-slate-500 mt-0.5">m² fiyatı: <span className="font-semibold text-slate-700">{formatPrice(String(pricePerM2))} / m²</span></p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 print:hidden">
                {isAuthenticated && (
                  <button onClick={toggleFavorite} disabled={favToggling} title="Favorilerime Ekle"
                    data-tour="parcel-favorite"
                    className={`flex items-center justify-center h-9 w-9 rounded-lg border transition-all duration-150 cursor-pointer ${isFavorited ? 'border-rose-200 bg-rose-50 text-rose-500' : 'border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200'}`}
                  >
                    <Heart className="h-4 w-4" fill={isFavorited ? 'currentColor' : 'none'} />
                  </button>
                )}
                <button onClick={handlePDF} disabled={pdfLoading} title="Yazdır / PDF"
                  data-tour="parcel-pdf"
                  className="flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-900 transition-colors disabled:opacity-50"
                >
                  {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700 font-medium">
              <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{parcel.city} / {parcel.district}{parcel.neighborhood ? ` / ${parcel.neighborhood}` : ''}</span>
            </div>
            {/* Live viewer / favorites count */}
            {((parcel.favoriteCount ?? 0) > 0 || liveViewerCount > 0) && (
              <div className="mt-2.5 flex gap-2 text-xs">
                {(parcel.favoriteCount ?? 0) > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-rose-600 font-medium">
                    <Heart className="h-3 w-3" fill="currentColor" />
                    {parcel.favoriteCount} favori
                  </span>
                )}
                {liveViewerCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-blue-600 font-medium">
                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" /></span>
                    {liveViewerCount} kişi bakıyor
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Info Table - sahibinden style alternating rows */}
          <div className="border-x border-slate-200 bg-white overflow-hidden">
            <div className="bg-slate-100 border-y border-slate-200 px-4 py-2">
              <h2 className="text-sm font-bold text-slate-800">İlan Bilgileri</h2>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {detailRows.map((row, idx) => (
                  <tr key={row.label} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                    <td className="border-b border-slate-100 px-4 py-2.5 text-slate-500 font-medium w-[42%]">{row.label}</td>
                    <td className="border-b border-slate-100 px-4 py-2.5 text-slate-900 font-semibold">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TKGM Box */}
          {(parcel.ada || parcel.city) && (
            <div className="border-x border-b border-slate-200 bg-slate-50 px-4 py-3 print:hidden">
              {parcel.ada && parcel.parsel && (
                <div className="flex items-center gap-3 text-sm mb-2">
                  <span className="font-semibold text-slate-700">Ada: {parcel.ada} / Parsel: {parcel.parsel}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`Ada: ${parcel.ada}, Parsel: ${parcel.parsel}`); }}
                    className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 transition-colors"
                    title="Kopyala"
                  >
                    Kopyala
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <a href={tkgmBaseUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-all duration-150 cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  TKGM Parsel Sorgu
                </a>
                {parcel.city && (
                  <a href={`https://kentrehberi.${parcel.city.toLocaleLowerCase('tr').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ç/g,'c').replace(/ğ/g,'g')}.bel.tr`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-all duration-150 cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    E-Kent / Kent Rehberi
                  </a>
                )}
              </div>
              {parcel.ada && parcel.parsel && (
                <p className="mt-1.5 text-[10px] text-slate-400">TKGM'den otomatik olarak çekilen kadastro haritası aşağıda gösterilmektedir.</p>
              )}
            </div>
          )}

          {/* ─── Consultant / Contact Card ─── */}
          <div className="rounded-b-lg border-x border-b border-slate-200 bg-white p-5 print:hidden">
            {consultant ? (
              /* Assigned consultant card */
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3">
                  <Building2 className="h-3.5 w-3.5" />
                  Danışman
                </div>
                <div className="flex items-center gap-3 mb-4">
                  {consultant.avatarUrl ? (
                    <img src={consultant.avatarUrl} alt={`${consultant.firstName} ${consultant.lastName}`} className="h-14 w-14 rounded-full object-cover border-2 border-emerald-200" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-lg font-bold border-2 border-emerald-200">
                      {consultant.firstName?.[0]}{consultant.lastName?.[0]}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-900">{consultant.firstName} {consultant.lastName}</p>
                    <p className="text-xs text-slate-500">Gayrimenkul Danışmanı</p>
                  </div>
                </div>
                {consultant.phone && (
                  <a href={`tel:${consultant.phone}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors mb-2"
                  >
                    <Phone className="h-4 w-4" />
                    {consultant.phone}
                  </a>
                )}
                <button
                  onClick={() => setShowCallMe(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors mb-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  Mesaj Gönder
                </button>
                <Link
                  href={`/parcels?consultant=${consultant.id}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Tüm İlanları
                </Link>
              </div>
            ) : (
              /* Generic NetTapu contact card */
              <div>
                <div className="flex items-center justify-center mb-3">
                  {siteSettings.site_logo ? (
                    <img src={siteSettings.site_logo} alt={siteName} className="h-8 w-auto opacity-80" />
                  ) : (
                    <img src="/images/nettapu-logo.svg" alt={siteName} className="h-8 w-auto opacity-80" />
                  )}
                </div>
                <p className="text-center text-xs text-slate-500 mb-3">{siteName} Gayrimenkul</p>
                {siteSettings.contact_phone && (
                  <a href={`tel:${siteSettings.contact_phone}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors mb-2"
                  >
                    <Phone className="h-4 w-4" />
                    {siteSettings.contact_phone}
                  </a>
                )}
                {!siteSettings.contact_phone && (
                  <a href="tel:0850XXXXXXX"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors mb-2"
                  >
                    <Phone className="h-4 w-4" />
                    0850 XXX XX XX
                  </a>
                )}
                <button
                  onClick={() => setShowCallMe(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors mb-2"
                >
                  <Phone className="h-4 w-4" />
                  Sizi Arayalım
                </button>
              </div>
            )}

            {/* Shared action buttons */}
            <div className="mt-2 space-y-2">
              <button
                onClick={() => setShowAppointment(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Calendar className="h-4 w-4" />
                Online Randevu Al
              </button>

              {parcel.status === 'active' && (
                <button
                  onClick={() => isAuthenticated ? setShowOffer(true) : alert('Teklif vermek için giriş yapmanız gerekiyor.')}
                  data-tour="parcel-offer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition-colors shadow-sm"
                >
                  <Tag className="h-4 w-4" />
                  Teklif Ver
                </button>
              )}

              <button
                onClick={() => setShowWhatsAppModal(true)}
                data-tour="parcel-whatsapp"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1fb855] transition-colors shadow-sm"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                WhatsApp ile İletişim
              </button>

              {parcel.status === 'active' && (
                <button onClick={async () => { try { await apiClient.post(`/parcels/${parcel.id}/price-alert`, {}); alert('Fiyat düşüş bildirimi aktif edildi!'); } catch { alert('Giriş yapmanız gerekiyor.'); } }}
                  className="flex w-full items-center gap-2 justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Bell className="h-3.5 w-3.5 text-amber-500" />
                  Fiyat Düşünce Haber Ver
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Below: Description + Tags + Share ─── */}
      <div className="mt-6 space-y-5">
        {/* Description */}
        {parcel.description && (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="bg-slate-100 border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-bold text-slate-800">Açıklama</h2>
            </div>
            <div className="p-5">
              <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{parcel.description}</p>
            </div>
          </div>
        )}

        {/* Tags */}
        {(parcel.isAuctionEligible || parcel.isFeatured) && (
          <div className="flex gap-2 flex-wrap">
            {parcel.isAuctionEligible && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700">
                Açık Artırmaya Uygun
              </span>
            )}
            {parcel.isFeatured && (
              <span className="flex items-center gap-1.5 rounded-full bg-yellow-50 border border-yellow-200 px-4 py-2 text-sm font-medium text-yellow-700">
                Öne Çıkan İlan
              </span>
            )}
          </div>
        )}

        {/* Share */}
        <div className="print:hidden">
          <ShareButtons
            url={typeof window !== 'undefined' ? window.location.href : ''}
            title={`${parcel.title} - ${siteName}`}
            description={`${parcel.city}, ${parcel.district} - ${formatPrice(parcel.price)}`}
            extraInfo={[
              parcel.city && parcel.district ? `${parcel.city}, ${parcel.district}` : '',
              parcel.ada && parcel.parsel ? `Ada: ${parcel.ada} / Parsel: ${parcel.parsel}` : '',
              parcel.areaM2 ? `Alan: ${Number(parcel.areaM2).toLocaleString('tr-TR')} m²` : '',
              parcel.price ? `Fiyat: ${formatPrice(parcel.price)}` : '',
            ].filter(Boolean).join('\n')}
          />
        </div>
      </div>

      {/* Modals */}
      {showCallMe && (
        <CallMeForm parcelId={parcel.id} parcelTitle={parcel.title} parcelListingId={parcel.listingId} onClose={() => setShowCallMe(false)} />
      )}

      {showAppointment && (
        <AppointmentForm parcelId={parcel.id} parcelTitle={parcel.title} onClose={() => setShowAppointment(false)} />
      )}

      {/* WhatsApp Zaman Tercihi Modal */}
      {showWhatsAppModal && parcel && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowWhatsAppModal(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white overflow-hidden"
            style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>

            {/* Top section */}
            <div className="px-6 pt-4 pb-5 text-center">
              {/* WhatsApp icon */}
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, #25D366 0%, #128C5E 100%)' }}>
                <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900">Sizi ne zaman arayalım?</h3>
              <p className="mt-1 text-sm text-slate-400">Danışmanımız seçtiğiniz saatte sizi arasın</p>
            </div>

            {/* Options */}
            <div className="px-5 space-y-2 pb-4">
              {([
                {
                  key: 'morning',
                  icon: '☀️',
                  label: 'Sabah Arayın',
                  sub: '09:00 – 12:00 arası',
                  color: '#F59E0B',
                  bg: '#FFFBEB',
                  note: 'sabah saatlerinde (09:00–12:00) aranmak istiyorum',
                },
                {
                  key: 'evening',
                  icon: '🌙',
                  label: 'Akşam Arayın',
                  sub: '17:00 – 20:00 arası',
                  color: '#6366F1',
                  bg: '#EEF2FF',
                  note: 'akşam saatlerinde (17:00–20:00) aranmak istiyorum',
                },
                {
                  key: 'tomorrow',
                  icon: '📆',
                  label: 'Yarın Arayın',
                  sub: 'Bir sonraki iş günü',
                  color: '#0EA5E9',
                  bg: '#F0F9FF',
                  note: 'bir sonraki iş günü aranmak istiyorum',
                },
              ] as const).map(({ key, icon, label, sub, color, bg, note }) => {
                const buildUrl = () => {
                  const lines: string[] = [
                    'Merhaba NetTapu,',
                    '',
                    'Aşağıdaki arsa ilanı hakkında bilgi almak istiyorum.',
                    '─────────────────',
                    parcel.title,
                    ...(parcel.city && parcel.district ? [`📍 ${parcel.city}, ${parcel.district}`] : []),
                    ...(parcel.areaM2 ? [`📐 ${Number(parcel.areaM2).toLocaleString('tr-TR')} m²`] : []),
                    ...(parcel.price ? [`💰 ${parseFloat(parcel.price).toLocaleString('tr-TR')} ₺`] : []),
                    '─────────────────',
                    `🕐 ${note}.`,
                    '',
                    parcelUrl,
                  ];
                  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
                };
                return (
                  <a
                    key={key}
                    href={buildUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowWhatsAppModal(false)}
                    className="flex items-center gap-4 w-full rounded-2xl px-4 py-3.5 transition-all duration-150 active:scale-[0.98] cursor-pointer group"
                    style={{ background: bg, border: `1.5px solid ${color}20` }}
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                      style={{ background: `${color}18` }}
                    >
                      {icon}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-slate-800">{label}</p>
                      <p className="text-xs mt-0.5" style={{ color }}>{sub}</p>
                    </div>
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5"
                      style={{ background: `${color}18` }}
                    >
                      <ChevronRight className="h-4 w-4" style={{ color }} />
                    </div>
                  </a>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 pb-6 pt-1">
              <button
                onClick={() => setShowWhatsAppModal(false)}
                className="w-full rounded-xl py-2.5 text-sm text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offer Modal */}
      {showOffer && parcel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowOffer(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Teklif Ver</h3>
              <button onClick={() => setShowOffer(false)} className="text-slate-400 hover:text-slate-900 cursor-pointer transition-colors duration-150">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-slate-500 mb-1">
              <span className="font-medium text-slate-900">{parcel.title}</span>
            </p>
            {parcel.price && (
              <p className="text-sm text-slate-500 mb-4">
                İlan fiyatı: <span className="font-bold text-emerald-600">{formatPrice(parcel.price)}</span>
              </p>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-900">Teklif Tutarı (TL) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={offerAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setOfferAmount(raw ? Number(raw).toLocaleString('tr-TR') : '');
                  }}
                  placeholder="Örn: 5.000.000"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-900">Mesajınız (opsiyonel)</label>
                <textarea
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder="Teklifinizle ilgili bir not ekleyebilirsiniz..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm resize-none focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <button
                onClick={handleOfferSubmit}
                disabled={!offerAmount || offerSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {offerSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gönderiliyor...
                  </span>
                ) : (
                  'Teklif Gönder'
                )}
              </button>
            </div>

            <p className="mt-3 text-[10px] text-center text-slate-400">
              Teklifiniz değerlendirilecek ve size en kısa sürede dönüş yapılacaktır.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

