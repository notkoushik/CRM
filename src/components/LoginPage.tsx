import { useState, type FormEvent } from 'react';
import { Field, inputClass, btnPrimary } from './ui';
import { DEFAULT_BRAND_NAME, DEFAULT_BRAND_TAGLINE, DEFAULT_LOGO_URL } from '../defaults';

interface LoginPageProps {
  error: string | null;
  onLogin: (email: string, password: string) => Promise<boolean>;
  allowedEmailDomain?: string | null;
  allowAnyEmailDomain?: boolean;
  brandName?: string;
  brandTagline?: string;
  logoUrl?: string;
}

export function LoginPage({
  error,
  onLogin,
  allowedEmailDomain = null,
  allowAnyEmailDomain = true,
  brandName = DEFAULT_BRAND_NAME,
  brandTagline = DEFAULT_BRAND_TAGLINE,
  logoUrl = DEFAULT_LOGO_URL,
}: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = (quickEmail: string) => {
    setEmail(quickEmail);
    setPassword('TestSeed123!');
  };

  const emailHint = allowAnyEmailDomain
    ? 'Work email'
    : allowedEmailDomain
      ? `@${allowedEmailDomain} email`
      : 'Work email';

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-100/70 px-4 py-8">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-3xl border border-slate-200/90 bg-white p-3 shadow-sm">
            <img
              src={logoUrl || '/skylance-icon.png'}
              alt={brandName}
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {brandName}
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-teal-700">
            {brandTagline || 'Work. The Smarter Way.'}
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900">Sign in to your account</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Select your role or enter your credentials below.
            </p>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Work Email">
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder={emailHint}
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter password"
              />
            </Field>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className={`${btnPrimary} w-full py-2.5 text-sm font-bold shadow-sm cursor-pointer`}
              disabled={submitting}
            >
              {submitting ? 'Signing in…' : 'Sign in to Skylance'}
            </button>
          </form>

          {/* Quick Role Fillers for testing */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Quick Role Sign-in (Seed Demo)
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('founder.seed@skylance.local')}
                className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-2 text-center transition hover:border-teal-500 hover:bg-teal-50/50 cursor-pointer"
              >
                <span className="text-base">👑</span>
                <span className="mt-1 text-[11px] font-bold text-slate-800">Founder</span>
                <span className="text-[9px] text-slate-400">Full Access</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('rahul.seed@skylance.local')}
                className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-2 text-center transition hover:border-teal-500 hover:bg-teal-50/50 cursor-pointer"
              >
                <span className="text-base">📞</span>
                <span className="mt-1 text-[11px] font-bold text-slate-800">Caller</span>
                <span className="text-[9px] text-slate-400">Inbound Leads</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('developer.seed@skylance.local')}
                className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-2 text-center transition hover:border-teal-500 hover:bg-teal-50/50 cursor-pointer"
              >
                <span className="text-base">💻</span>
                <span className="mt-1 text-[11px] font-bold text-slate-800">Developer</span>
                <span className="text-[9px] text-slate-400">Tech & Scope</span>
              </button>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Skylance CRM · Professional Three-Role Agency Management
        </p>
      </div>
    </div>
  );
}
