'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import {
  User, Heart, FileText, Gavel, CreditCard, Search, Bell, Gift,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const profileNavItems: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/profile', label: 'Profilim', icon: User },
  { href: '/profile/favorites', label: 'Favorilerim', icon: Heart },
  { href: '/profile/offers', label: 'Tekliflerim', icon: FileText },
  { href: '/profile/auctions', label: 'İhale Geçmişim', icon: Gavel },
  { href: '/profile/payments', label: 'Ödeme Geçmişim', icon: CreditCard },
  { href: '/profile/installments', label: 'Taksitlerim', icon: CreditCard },
  { href: '/profile/referral', label: 'Davet & Kazanç', icon: Gift },
  { href: '/profile/saved-searches', label: 'Kayıtlı Aramalar', icon: Search },
  { href: '/profile/notifications', label: 'Bildirim Ayarları', icon: Bell },
];

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login?returnTo=/profile');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Yükleniyor...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  return (
    <div className="bg-white min-h-screen">
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <h1 className="text-xl font-bold text-gray-900">Hesabım</h1>
          <p className="mt-1 text-sm text-gray-500">{user.email}</p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Sidebar */}
          <aside className="lg:w-56 shrink-0">
            <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 border-b lg:border-b-0 border-gray-200">
              {profileNavItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/profile'
                    ? pathname === '/profile'
                    : pathname.startsWith(item.href);
                const tourKey = item.href === '/profile/favorites'
                  ? 'profile-favorites'
                  : item.href === '/profile/installments'
                  ? 'profile-installments'
                  : item.href === '/profile/referral'
                  ? 'profile-referral'
                  : undefined;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tour={tourKey}
                    className={`flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm cursor-pointer transition-colors duration-150 ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
