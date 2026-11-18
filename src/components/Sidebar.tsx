import type { Page } from '../types';
import { navItemsForRole } from '../lib/nav';

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  userName: string;
  userRole?: string;
  brandName?: string;
  logoUrl?: string;
  className?: string;
}

function PageIcon({ page }: { page: Page }) {
  switch (page) {
    case 'dashboard':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case 'calls':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case 'pipeline':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="5" height="16" rx="1" />
          <rect x="10" y="4" width="5" height="11" rx="1" />
          <rect x="17" y="4" width="5" height="14" rx="1" />
        </svg>
      );
    case 'handoffs':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="m9 15 2 2 4-4" />
        </svg>
      );
    case 'projects':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <polygon points="12 11 12 17 17 14" />
        </svg>
      );
    case 'contacts':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    case 'import':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    case 'activity':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case 'users':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      );
    case 'settings':
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar({
  page,
  onNavigate,
  onLogout,
  userName,
  userRole,
  brandName = 'Skylance CRM',
  logoUrl = '',
  className = '',
}: SidebarProps) {
  const items = navItemsForRole(userRole);
  const displayRole = userRole === 'sdr' ? 'Caller' : userRole === 'developer' ? 'Developer' : 'Admin';
  const roleBadgeStyle =
    userRole === 'admin' || userRole === 'founder'
      ? 'bg-purple-100 text-purple-800 border-purple-200'
      : userRole === 'developer'
        ? 'bg-blue-100 text-blue-800 border-blue-200'
        : 'bg-teal-100 text-teal-800 border-teal-200';

  return (
    <aside
      className={`flex min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white ${className}`}
    >
      {/* Brand Header */}
      <div className="shrink-0 border-b border-slate-200 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-xs">
            <img
              src={logoUrl || '/skylance-icon.png'}
              alt={brandName}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-slate-900 tracking-tight text-sm leading-tight truncate">
              {brandName || 'Skylance Tek'}
            </p>
            <p className="text-[10px] font-bold tracking-wider text-teal-700 mt-0.5 truncate uppercase">
              Work. The Smarter Way.
            </p>
          </div>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3 kanban-scroll">
        <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Navigation
        </p>
        {items.map((item) => {
          const active = page === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition cursor-pointer ${
                active
                  ? 'bg-teal-600 text-white shadow-xs font-semibold'
                  : 'text-slate-700 hover:bg-slate-100/90 hover:text-slate-900'
              }`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                  active ? 'text-white' : 'text-slate-500 group-hover:text-slate-800'
                }`}
              >
                <PageIcon page={item.id} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-sm leading-tight">{item.label}</span>
                <span
                  className={`mt-0.5 block truncate text-[11px] leading-tight transition ${
                    active ? 'text-teal-100 font-normal' : 'text-slate-400 group-hover:text-slate-500'
                  }`}
                >
                  {item.hint}
                </span>
              </div>
              {active ? (
                <div className="h-1.5 w-1.5 rounded-full bg-white" />
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* User Footer Profile */}
      <div className="shrink-0 border-t border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 font-bold text-xs text-teal-800 shadow-2xs">
            {userName ? userName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-900">{userName}</p>
            <span
              className={`inline-block rounded-md border px-1.5 py-0.2 text-[10px] font-bold ${roleBadgeStyle}`}
            >
              {displayRole}
            </span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Log out"
            className="rounded-lg p-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-200/60 hover:text-rose-600 cursor-pointer"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
