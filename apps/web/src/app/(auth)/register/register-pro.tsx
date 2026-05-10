'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { z } from 'zod';
import apiClient from '@/lib/api-client';
import { LoadingState } from '@/components/ui';
import { useSiteSettings } from '@/hooks/use-site-settings';
import type { ApiError } from '@/types';
import { AxiosError } from 'axios';
import { Mail, Lock, User, ArrowRight, AlertCircle, Eye, EyeOff, CheckCircle2, Shield, Zap, Phone } from 'lucide-react';

const registerSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
  confirmPassword: z.string(),
  firstName: z.string().min(2, 'Ad en az 2 karakter olmalıdır'),
  lastName: z.string().min(2, 'Soyad en az 2 karakter olmalıdır'),
  phone: z.string().optional(),
  acceptTerms: z.boolean().refine(val => val === true, 'Kullanım koşullarını kabul etmelisiniz'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Şifreler eşleşmiyor',
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPagePro() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RegisterContent />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 384 512" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.6 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const s = useSiteSettings();

  const refCode = (searchParams?.get('ref') || '').trim().toUpperCase();
  const [refValid, setRefValid] = useState<{ inviterName?: string } | null>(null);

  useEffect(() => {
    if (!refCode) return;
    apiClient
      .post<{ valid: boolean; inviterName?: string }>('/referral/validate', { code: refCode })
      .then((r) => {
        if (r.data.valid) setRefValid({ inviterName: r.data.inviterName });
      })
      .catch(() => {});
  }, [refCode]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    try {
      await apiClient.post('/auth/register', {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        ...(refCode ? { referralCode: refCode } : {}),
      });
      router.push('/login?registered=true');
    } catch (err) {
      if (err instanceof AxiosError) {
        const apiErr = err.response?.data as ApiError | undefined;
        const errorMsg = Array.isArray(apiErr?.message) ? apiErr.message[0] : apiErr?.message;
        setServerError(errorMsg || 'Kayıt başarısız. Lütfen bilgilerinizi kontrol edin.');
      } else {
        setServerError('Beklenmeyen bir hata oluştu.');
      }
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `/api/v1/auth/google`;
  };

  const handleAppleLogin = () => {
    alert('Apple ile Kayıt web için yakında eklenecektir.');
  };

  return (
    <div className="min-h-screen flex font-[Outfit,system-ui,sans-serif]" data-testid="register-page">
      {/* Left Side - Register Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-12 bg-gradient-to-br from-white to-slate-50 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-3 mb-6" data-testid="register-logo">
              {s.site_logo ? (
                <img src={s.site_logo} alt={s.site_title || 'NetTapu'} className="h-12 object-contain" />
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white text-base font-bold shadow-sm">
                    NT
                  </div>
                  <div className="flex flex-col leading-tight text-left">
                    <span className="text-xl font-extrabold text-slate-900 tracking-tight">{s.site_title || 'NetTapu'}</span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Arsa Platformu</span>
                  </div>
                </>
              )}
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Hesap Oluşturun</h1>
            <p className="text-slate-500">Ücretsiz üye olun, fırsatları kaçırmayın</p>
          </div>

          {/* Social Login */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleGoogleLogin}
              type="button"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 text-sm font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 shadow-sm"
              data-testid="google-register-btn"
            >
              <GoogleIcon />
              <span>Google</span>
            </button>
            <button
              onClick={handleAppleLogin}
              type="button"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 border border-slate-900 rounded-xl text-white text-sm font-semibold hover:bg-slate-800 hover:border-slate-800 transition-all duration-200 shadow-sm"
              data-testid="apple-register-btn"
            >
              <AppleIcon />
              <span>Apple</span>
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-sm text-slate-400 font-medium">veya</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          {/* Referral Banner */}
          {refValid && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-amber-50 p-4 flex items-center gap-3"
            >
              <span className="text-2xl">🎁</span>
              <div className="text-sm">
                <p className="font-semibold text-emerald-900">
                  {refValid.inviterName ? `${refValid.inviterName} sizi davet etti!` : 'Davet kodu geçerli'}
                </p>
                <p className="text-xs text-emerald-700">
                  Kayıt olup ilk depozit ödemesini yaptığınızda 250 TL'lik indirim kuponu kazanırsınız.
                </p>
              </div>
            </motion.div>
          )}

          {/* Error Alert */}
          {serverError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 rounded-xl flex items-start gap-3"
              data-testid="register-error"
            >
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{serverError}</p>
            </motion.div>
          )}

          {/* Register Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" data-testid="register-form">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-semibold text-slate-700 mb-2">
                  Ad
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    {...register('firstName')}
                    id="firstName"
                    type="text"
                    placeholder="Adınız"
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition-all duration-200"
                    data-testid="firstname-input"
                  />
                </div>
                {errors.firstName && (
                  <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-semibold text-slate-700 mb-2">
                  Soyad
                </label>
                <input
                  {...register('lastName')}
                  id="lastName"
                  type="text"
                  placeholder="Soyadınız"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition-all duration-200"
                  data-testid="lastname-input"
                />
                {errors.lastName && (
                  <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                E-posta Adresi
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  {...register('email')}
                  id="email"
                  type="email"
                  placeholder="ornek@email.com"
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition-all duration-200"
                  data-testid="email-input"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-slate-700 mb-2">
                Telefon <span className="text-slate-400 font-normal">(opsiyonel)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  {...register('phone')}
                  id="phone"
                  type="tel"
                  placeholder="05XX XXX XX XX"
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition-all duration-200"
                  data-testid="phone-input"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-2">
                Şifre
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  {...register('password')}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="En az 6 karakter"
                  className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition-all duration-200"
                  data-testid="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-700 mb-2">
                Şifre Tekrar
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  {...register('confirmPassword')}
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Şifrenizi tekrar girin"
                  className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition-all duration-200"
                  data-testid="confirm-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Terms Checkbox */}
            <div className="flex items-start gap-3">
              <input
                {...register('acceptTerms')}
                id="acceptTerms"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                data-testid="terms-checkbox"
              />
              <label htmlFor="acceptTerms" className="text-sm text-slate-600">
                <Link href="/legal" className="text-emerald-600 hover:text-emerald-700 font-medium">Kullanım Koşulları</Link>
                {' '}ve{' '}
                <Link href="/legal" className="text-emerald-600 hover:text-emerald-700 font-medium">Gizlilik Politikası</Link>
                'nı okudum ve kabul ediyorum.
              </label>
            </div>
            {errors.acceptTerms && (
              <p className="text-xs text-red-600">{errors.acceptTerms.message}</p>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-emerald hover:shadow-emerald-lg transition-all duration-200"
              data-testid="register-submit-btn"
            >
              {isSubmitting ? (
                <>
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Kayıt Yapılıyor...</span>
                </>
              ) : (
                <>
                  <span>Üye Ol</span>
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          {/* Sign In Link */}
          <p className="mt-6 text-center text-slate-500">
            Zaten hesabınız var mı?{' '}
            <Link href="/login" className="font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
              Giriş Yapın
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right Side - Hero Section */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.015)_1px,transparent_1px)] bg-[size:60px_60px]"></div>
        
        <div className="absolute top-20 right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative z-10 max-w-xl text-center"
        >
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-6 leading-[1.1] tracking-tight">
            Yatırımınıza{' '}
            <span className="text-emerald-400">
              Bugün Başlayın
            </span>
          </h2>
          <p className="text-lg text-slate-400 mb-12 leading-relaxed">
            Ücretsiz üye olun, binlerce arsa ilanına ve canlı açık artırmalara hemen erişin.
          </p>

          {/* Benefits */}
          <div className="grid grid-cols-1 gap-4 text-left">
            {[
              { icon: CheckCircle2, title: 'Ücretsiz Üyelik', desc: 'Hiçbir gizli ücret yok' },
              { icon: Shield, title: 'Güvenli Platform', desc: 'KVKK uyumlu, verileriniz güvende' },
              { icon: Zap, title: 'Anında Erişim', desc: 'Tüm ilanları hemen görüntüleyin' },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white/5 backdrop-blur-sm"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-0.5">{feature.title}</h3>
                    <p className="text-sm text-slate-400">{feature.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
