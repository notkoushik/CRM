import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { Page } from './types';
import { canManageUsers } from './types';
import { useAuth } from './hooks/useAuth';
import { useCrmStore } from './hooks/useCrmStore';
import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { Dashboard } from './components/Dashboard';
import { Pipeline } from './components/Pipeline';
import { Contacts } from './components/Contacts';
import { ImportLeads } from './components/ImportLeads';
import { Users } from './components/Users';
import { SettingsPage } from './components/SettingsPage';
import { HandoffsPage, ProjectsPage } from './components/Projects';
import { LoginPage } from './components/LoginPage';
import { CallDesk } from './components/CallDesk';
import { Skeleton, SkeletonRows } from './components/ui';
import { PAGE_TITLE } from './lib/nav';

/** Admin-only — not in the SDR initial bundle. */
const SdrActivity = lazy(() =>
  import('./components/SdrActivity').then((m) => ({ default: m.SdrActivity }))
);

const ADMIN_ONLY_PAGES: Page[] = ['activity', 'users', 'settings'];
const DEVELOPER_HIDDEN_PAGES: Page[] = ['calls', 'handoffs', 'import', 'pipeline', 'contacts', 'activity', 'users', 'settings'];
const ALL_PAGES: Page[] = [
  'dashboard',
  'calls',
  'import',
  'pipeline',
  'handoffs',
  'projects',
  'contacts',
  'activity',
  'users',
  'settings',
];

function readQuery(): { page: Page | null; companyId: string | null } {
  const params = new URLSearchParams(window.location.search);
  const rawPage = params.get('page');
  const page = rawPage && (ALL_PAGES as string[]).includes(rawPage) ? (rawPage as Page) : null;
  const companyId = params.get('companyId');
  return { page, companyId: companyId || null };
}

function writeQuery(page: Page, companyId: string | null) {
  const params = new URLSearchParams();
  params.set('page', page);
  if (companyId) params.set('companyId', companyId);
  const next = `${window.location.pathname}?${params.toString()}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next !== current) {
    window.history.replaceState(null, '', next);
  }
}

// Page-shaped skeletons. Each mirrors the real page's layout so that when the
// store resolves the placeholder is filled in rather than swapped out (issue
// #116). They live here, not in ui.tsx, because each one is specific to a page
// that App owns — ui.tsx stays a generic toolbox.
function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="space-y-2 border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="space-y-2 border border-[var(--color-line)] bg-[var(--color-panel)] p-5"
          >
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
        ))}
      </div>
      <div className="space-y-3 border border-[var(--color-line)] bg-[var(--color-panel)] p-5">
        <Skeleton className="h-6 w-56" />
        <SkeletonRows rows={3} />
      </div>
    </div>
  );
}

function ContactsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Skeleton className="h-10 w-full sm:max-w-xs" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-40" />
      </div>
      <Skeleton className="h-4 w-40" />
      <div className="space-y-2 border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineSkeleton({ stages }: { stages: string[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="space-y-3 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-10 w-full sm:max-w-xs" />
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 kanban-scroll">
        {stages.map((stage) => (
          <div
            key={stage}
            className="flex w-[min(72vw,16rem)] shrink-0 flex-col rounded-none border border-[var(--color-line)] border-t-4 border-stone-200 bg-[var(--color-panel)]/70 sm:w-64"
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-6" />
            </div>
            <div className="flex flex-col gap-2 px-2.5 pb-3">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="space-y-2 border border-[var(--color-line)] bg-white p-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fallback for pages with no bespoke placeholder (import, users, settings…). */
function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-full max-w-md" />
      <SkeletonRows rows={6} />
    </div>
  );
}

function PageLoadingSkeleton({ page, stages }: { page: Page; stages: string[] }) {
  if (page === 'dashboard') return <DashboardSkeleton />;
  if (page === 'pipeline') return <PipelineSkeleton stages={stages} />;
  if (page === 'contacts' || page === 'calls') return <ContactsSkeleton />;
  return <PageSkeleton />;
}

export default function App() {
  const auth = useAuth();
  const store = useCrmStore(!!auth.user, auth.user?.role);
  const initialQuery = readQuery();
  const [page, setPage] = useState<Page>(initialQuery.page ?? 'dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(initialQuery.companyId);

  // Prevent accidental number input increment/decrement when scrolling with the mouse wheel
  useEffect(() => {
    const handleWheel = () => {
      const active = document.activeElement;
      if (active && active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'number') {
        (active as HTMLInputElement).blur();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  const manageUsers = canManageUsers(auth.user?.role);
  const config = auth.config;

  useEffect(() => {
    document.title = config.brandName;
  }, [config.brandName]);

  const navigate = useCallback(
    (next: Page) => {
      if (ADMIN_ONLY_PAGES.includes(next) && !canManageUsers(auth.user?.role)) {
        setPage('dashboard');
        setMenuOpen(false);
        writeQuery('dashboard', null);
        return;
      }
      if (auth.user?.role === 'developer' && DEVELOPER_HIDDEN_PAGES.includes(next)) {
        setPage('projects');
        setMenuOpen(false);
        writeQuery('projects', null);
        return;
      }
      if (next === 'handoffs' && auth.user?.role === 'developer') {
        setPage('projects');
        setMenuOpen(false);
        writeQuery('projects', null);
        return;
      }
      setPage(next);
      setMenuOpen(false);
      writeQuery(next, next === 'pipeline' ? openCompanyId : null);
    },
    [auth.user?.role, openCompanyId]
  );

  useEffect(() => {
    if (!auth.user) return;
    if (auth.user.role === 'developer' && page === 'dashboard') {
      setPage('projects');
      writeQuery('projects', null);
      return;
    }
    if (ADMIN_ONLY_PAGES.includes(page) && !canManageUsers(auth.user.role)) {
      setPage('dashboard');
      writeQuery('dashboard', null);
    }
  }, [auth.user, page]);

  // Deep-link: ?page=pipeline&companyId=... (new tab from contact Open company)
  useEffect(() => {
    if (!auth.user || store.loading) return;
    const { page: qPage, companyId } = readQuery();
    if (qPage) {
      if (ADMIN_ONLY_PAGES.includes(qPage) && !canManageUsers(auth.user.role)) {
        setPage('dashboard');
        return;
      }
      if (auth.user.role === 'developer' && DEVELOPER_HIDDEN_PAGES.includes(qPage)) {
        setPage('projects');
        writeQuery('projects', null);
        return;
      }
      setPage(qPage);
    }
    if (companyId) {
      setPage('pipeline');
      setOpenCompanyId(companyId);
    }
  }, [auth.user, store.loading]);

  useEffect(() => {
    const onPop = () => {
      const { page: qPage, companyId } = readQuery();
      if (qPage) setPage(qPage);
      setOpenCompanyId(companyId);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (!auth.ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-sm text-stone-500">
        Loading…
      </div>
    );
  }

  if (!auth.user) {
    return (
      <LoginPage
        error={auth.error}
        onLogin={auth.login}
        allowedEmailDomain={auth.allowedEmailDomain}
        allowAnyEmailDomain={auth.allowAnyEmailDomain}
        brandName={config.brandName}
        brandTagline={config.brandTagline}
        logoUrl={config.logoUrl}
      />
    );
  }

  // NOTE: no `if (store.loading) return …` gate here. Blocking the whole app
  // while the store loads is what produced the blank flash described in issue
  // #116; the shell (sidebar, header, nav) now paints immediately and only the
  // data area below is swapped for a page-shaped skeleton.
  return (
    <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      {auth.idleWarnSeconds != null ? (
        <div className="fixed inset-x-0 top-0 z-[60] bg-amber-600 px-4 py-2 text-center text-sm font-medium text-white">
          You will be signed out soon due to inactivity — move the mouse or press a key to stay
          signed in ({auth.idleWarnSeconds}s)
        </div>
      ) : null}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          aria-label="Open menu"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-900 text-base">
            {page === 'dashboard' && auth.user.role === 'developer' ? 'Assigned Projects' : PAGE_TITLE[page]}
          </p>
          <p className="truncate text-[11px] font-medium text-slate-500">{auth.user.name}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-xs font-bold text-white shadow-xs">
          SL
        </span>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-stone-900/40"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(85vw,14rem)] overflow-hidden border-r border-[var(--color-line)]">
            <Sidebar
              page={page}
              onNavigate={navigate}
              userName={auth.user.name}
              userRole={auth.user.role}
              onLogout={() => void auth.logout()}
              brandName={config.brandName}
              logoUrl={config.logoUrl}
              className="h-full w-full"
            />
          </div>
        </div>
      ) : null}

      <Sidebar
        page={page}
        onNavigate={navigate}
        userName={auth.user.name}
        userRole={auth.user.role}
        onLogout={() => void auth.logout()}
        brandName={config.brandName}
        logoUrl={config.logoUrl}
        className="sticky top-0 hidden h-[100dvh] lg:flex"
      />

      <main
        aria-busy={store.loading}
        className="min-w-0 flex-1 overflow-auto p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8"
      >
        {/* Mobile Top Brand Bar (Visible on mobile/tablet screens < lg) */}
        <div className="flex lg:hidden items-center justify-between pb-3.5 mb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-xs">
              <img
                src={config.logoUrl || '/skylance-icon.png'}
                alt={config.brandName || 'Skylance Tek'}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="font-extrabold text-slate-900 text-sm leading-tight">
                {config.brandName || 'Skylance Tek'}
              </p>
              <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                Work. The Smarter Way.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void auth.logout()}
            className="text-xs text-rose-600 font-bold px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
          >
            Logout
          </button>
        </div>

        <div className="hidden lg:flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Agency Workspace</span>
            <span>/</span>
            <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60">
              {page === 'dashboard' && auth.user.role === 'developer' ? 'Assigned Projects' : PAGE_TITLE[page]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80 font-semibold shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Skylance Engine Active
            </span>
            <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 font-medium">
              Signed in as: <strong className="text-slate-900">{auth.user.name}</strong> ({auth.user.role === 'sdr' ? 'Caller' : auth.user.role === 'developer' ? 'Developer' : 'Admin'})
            </span>
          </div>
        </div>
        {store.loading ? (
          <p role="status" className="sr-only">
            Loading your CRM…
          </p>
        ) : null}
        {store.error ? (
          <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-2xs">
            {store.error}
          </p>
        ) : null}
        {store.loading ? (
          <div data-testid="page-skeleton">
            <PageLoadingSkeleton page={page} stages={config.stages} />
          </div>
        ) : (
          <>
            {page === 'dashboard' && auth.user.role === 'developer' ? (
              <section className="max-w-2xl space-y-3 border border-[var(--color-line)] bg-[var(--color-panel)] p-6">
                <p className="text-xs font-semibold tracking-[0.14em] text-teal-700 uppercase">
                  Developer workspace
                </p>
                <h1 className="font-[family-name:var(--font-display)] text-3xl text-stone-900">
                  Assigned projects
                </h1>
                <p className="text-sm leading-6 text-stone-600">
                  Project assignments and technical reviews will appear here. Client leads and
                  pricing are not available in the Developer workspace.
                </p>
              </section>
            ) : null}
            {page === 'dashboard' && auth.user.role !== 'developer' ? (
              <Dashboard
                store={store}
                onNavigate={navigate}
                canManageUsers={manageUsers}
                brandName={config.brandName}
                userRole={auth.user.role}
              />
            ) : null}
            {page === 'calls' ? (
              <CallDesk
                store={store}
                userRole={auth.user.role}
                userName={auth.user.name}
              />
            ) : null}
            {page === 'import' ? <ImportLeads store={store} /> : null}
            {page === 'pipeline' ? (
              <Pipeline
                store={store}
                stages={config.stages}
                contactStatuses={config.contactStatuses}
                discoveryQuestions={config.discoveryQuestions}
                openCompanyId={openCompanyId}
                onOpenCompanyIdConsumed={() => setOpenCompanyId(null)}
                onEditingCompanyChange={(companyId) => {
                  writeQuery('pipeline', companyId);
                }}
              />
            ) : null}
            {page === 'contacts' ? (
              <Contacts
                store={store}
                contactStatuses={config.contactStatuses}
                stages={config.stages}
              />
            ) : null}
            {page === 'handoffs' && auth.user.role !== 'developer' ? (
              <HandoffsPage store={store} userRole={String(auth.user.role ?? '')} onOpenProject={() => navigate('projects')} />
            ) : null}
            {page === 'projects' ? (
              <ProjectsPage store={store} userRole={String(auth.user.role ?? '')} />
            ) : null}
            {page === 'activity' && manageUsers ? (
              <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
                <SdrActivity />
              </Suspense>
            ) : null}
            {page === 'users' && manageUsers ? <Users /> : null}
            {page === 'settings' && manageUsers ? (
              <SettingsPage config={config} onSaved={auth.refreshConfig} />
            ) : null}
          </>
        )}
      </main>

      <MobileNav page={page} onNavigate={navigate} userRole={auth.user.role} />
    </div>
  );
}
