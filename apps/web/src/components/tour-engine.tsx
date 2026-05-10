'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { resolveTour } from '@/lib/tour-configs';
import { HelpCircle, X } from 'lucide-react';

const STORAGE_PREFIX = 'nt_tour_';
const DISMISS_FOREVER_KEY = 'nt_tour_dismissed_global';

/**
 * Site-wide interactive tour engine. Reads `tour_enabled` and
 * `tour_auto_start` from site_settings to globally toggle the
 * floating launcher and auto-start behaviour.
 *
 * Per-user state lives in localStorage:
 *   - nt_tour_<tourId> = '1' once seen → suppresses auto-start
 *   - nt_tour_dismissed_global = '1' → user opted out for whole site
 */
export function TourEngine() {
  const pathname = usePathname();
  const settings = useSiteSettings();
  const driverRef = useRef<Driver | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissedGlobal, setDismissedGlobal] = useState(false);

  const tourEnabled = (settings.tour_enabled ?? 'true') !== 'false';
  const autoStart = (settings.tour_auto_start ?? 'true') !== 'false';
  const tour = resolveTour(pathname || '/');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissedGlobal(localStorage.getItem(DISMISS_FOREVER_KEY) === '1');
  }, []);

  const startTour = useCallback(() => {
    if (!tour) return;
    if (driverRef.current) {
      driverRef.current.destroy();
    }
    const d = driver({
      showProgress: true,
      progressText: 'Adım {{current}} / {{total}}',
      nextBtnText: 'İleri →',
      prevBtnText: '← Geri',
      doneBtnText: 'Bitir',
      smoothScroll: true,
      animate: true,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: 'nettapu-tour-popover',
      overlayOpacity: 0.55,
      steps: tour.steps.map((s) => ({
        element: s.element,
        popover: {
          title: s.title,
          description: s.description,
          side: s.side ?? 'bottom',
          align: s.align ?? 'center',
        },
      })),
    });
    driverRef.current = d;
    d.drive();
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${STORAGE_PREFIX}${tour.id}`, '1');
    }
  }, [tour]);

  // Auto-start on first visit to a path
  useEffect(() => {
    if (!tourEnabled || !autoStart || !tour) return;
    if (dismissedGlobal) return;
    if (typeof window === 'undefined') return;
    const seen = localStorage.getItem(`${STORAGE_PREFIX}${tour.id}`);
    if (seen) return;
    // Wait a tick so the page has rendered targets
    const t = setTimeout(() => startTour(), 800);
    return () => clearTimeout(t);
  }, [pathname, tour, tourEnabled, autoStart, dismissedGlobal, startTour]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  if (!tourEnabled || !tour || dismissedGlobal) return null;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-2">
        {open && (
          <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-2xl w-72">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-semibold text-sm text-slate-900">{tour.title}</h4>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mb-3">
              {tour.steps.length} adımda bu sayfayı tanıtalım.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  startTour();
                }}
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Turu Başlat
              </button>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.setItem(DISMISS_FOREVER_KEY, '1');
                  }
                  setDismissedGlobal(true);
                  setOpen(false);
                }}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
              >
                Bir daha gösterme
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl ring-4 ring-emerald-200 hover:bg-emerald-700 transition-all"
          aria-label="Sistem tanıtıcısı"
          title="Sistem tanıtıcısı — sayfa rehberi"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>
    </>
  );
}
