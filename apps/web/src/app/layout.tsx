import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/providers/auth-provider';
import { SiteSettingsProvider } from '@/providers/site-settings-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { ApiErrorToastContainer } from '@/components/api-error-toast';
import { HeaderPro } from '@/components/layout/header-pro';
import { Footer } from '@/components/layout/footer';
import { FullBanGate } from '@/components/full-ban-gate';
import { fetchSiteSettingsServer } from '@/lib/server-api';
import { OrganizationJsonLd, WebSiteJsonLd, RealEstateAgentJsonLd } from '@/components/json-ld';
import { GoogleOneTap } from '@/components/google-one-tap';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { TourEngine } from '@/components/tour-engine';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { Toaster } from 'sonner';
import './globals.css';

// Professional Typography System - Inter
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchSiteSettingsServer();
  const siteName = settings.site_title || 'NetTapu';
  const siteDesc = settings.site_description || 'Arsa ve gayrimenkul satışı için Türkiye\'nin güvenilir canlı açık artırma platformu.';
  const fullTitle = `${siteName} — Gayrimenkul Açık Artırma Platformu`;

  return {
    title: {
      default: fullTitle,
      template: `%s | ${siteName}`,
    },
    description: siteDesc,
    keywords: [
      'arsa satışı',
      'gayrimenkul',
      'açık artırma',
      'online ihale',
      'arsa ilanları',
      siteName,
      'gayrimenkul portali',
      'arazi satış',
    ],
    authors: [{ name: siteName }],
    creator: siteName,
    publisher: siteName,
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://nettapu.com'),
    openGraph: {
      type: 'website',
      locale: 'tr_TR',
      url: '/',
      siteName,
      title: fullTitle,
      description: siteDesc,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: siteDesc,
    },
    icons: {
      icon: settings.site_favicon || '/icon.svg',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className={inter.variable}>
      <head>
        <OrganizationJsonLd />
        <WebSiteJsonLd />
        <RealEstateAgentJsonLd />
      </head>
      <body className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased font-sans">
        <ErrorBoundary>
          <AuthProvider>
            <SiteSettingsProvider>
              <div className="flex min-h-screen flex-col">
                <HeaderPro />
                <div className="flex-1">
                  <FullBanGate>{children}</FullBanGate>
                </div>
                <Footer />
              </div>
              <MobileBottomNav />
              <ApiErrorToastContainer />
              <Toaster position="top-right" richColors closeButton />
              <ScrollToTop />
              <GoogleOneTap />
              <TourEngine />
            </SiteSettingsProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
