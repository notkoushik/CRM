import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { formatFullDateTime, formatRelativeTime } from '../lib/dates';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, onClose, children, wide }: ModalProps) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto sm:items-start sm:p-6 lg:p-8">
      <button
        type="button"
        className="fixed inset-0 z-0 bg-slate-950/50 backdrop-blur-xs transition-opacity"
        aria-label="Dismiss dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 my-0 w-full overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:my-6 sm:rounded-2xl ${
          wide ? 'max-w-3xl' : 'max-w-xl'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-4">
          <h2
            id={titleId}
            className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 cursor-pointer"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[min(85dvh,42rem)] overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, children, className = '' }: FieldProps) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 shadow-2xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0';

export const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-700 active:scale-[0.99] disabled:opacity-50 cursor-pointer';

export const btnSecondary =
  'inline-flex items-center justify-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-[0.99] disabled:opacity-50 cursor-pointer';

export const btnDestructive =
  'inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-rose-700 active:scale-[0.99] disabled:opacity-50 cursor-pointer';

export const btnGhost =
  'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 cursor-pointer';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'data-testid'?: string;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  'data-testid': testId,
  onKeyDown,
  onFocus,
}: SearchInputProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <svg
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
          onKeyDown?.(e);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${inputClass} pl-9`}
      />
    </div>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  value: string | string[];
  options: FilterOption[];
  multi?: boolean;
  searchable?: boolean;
  active?: boolean;
  onChange: (value: string | string[]) => void;
  'data-testid'?: string;
}

export function FilterDropdown({
  label,
  value,
  options,
  multi = false,
  searchable = false,
  active = false,
  onChange,
  'data-testid': testId,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = Array.isArray(value) ? value : [String(value)];

  const updatePosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.max(rect.width, 256);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 280 && rect.top > spaceBelow;
    const maxHeight = Math.min(256, openUp ? rect.top - 12 : spaceBelow - 12);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setPanelStyle({
      position: 'fixed',
      left,
      width,
      maxHeight: Math.max(120, maxHeight),
      zIndex: 80,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, options.length, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => updatePosition();
    // Defer outside-close so the opening click never immediately closes the panel.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
    }, 0);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const summary = (() => {
    if (multi) {
      if (selected.length === 0) return 'All';
      if (selected.length === 1) {
        return options.find((o) => o.value === selected[0])?.label ?? '1 selected';
      }
      return `${selected.length} selected`;
    }
    return options.find((o) => o.value === (value as string))?.label ?? 'All';
  })();

  const toggle = (optValue: string) => {
    if (multi) {
      const next = selected.includes(optValue)
        ? selected.filter((v) => v !== optValue)
        : [...selected, optValue];
      onChange(next);
      return;
    }
    onChange(optValue);
    setOpen(false);
  };

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            data-testid={testId ? `${testId}-panel` : undefined}
            aria-multiselectable={multi || undefined}
            style={panelStyle}
            className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            {searchable ? (
              <div className="sticky top-0 border-b border-slate-200 bg-white p-2">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className={`${inputClass} py-1.5 text-xs`}
                  autoFocus
                />
              </div>
            ) : null}
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">No matches</p>
            ) : (
              filtered.map((opt) => {
                const isOn = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value || '__all__'}
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    onClick={() => toggle(opt.value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-teal-50 cursor-pointer ${
                      isOn ? 'bg-teal-50/80 font-semibold text-teal-900' : 'text-slate-700'
                    }`}
                  >
                    {multi ? (
                      <span
                        aria-hidden
                        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] ${
                          isOn
                            ? 'border-teal-600 bg-teal-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isOn ? '✓' : ''}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer ${
          active
            ? 'bg-teal-600 text-white shadow-xs'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <span className="opacity-70">{label}:</span>
        <span>{summary}</span>
        <span aria-hidden className="opacity-60 text-[10px]">
          ▼
        </span>
      </button>
      {panel}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  onClear: () => void;
}

export function FilterChip({ label, onClear }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 shadow-2xs">
      <span>{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="font-bold text-teal-700 hover:text-teal-950 cursor-pointer"
      >
        ✕
      </button>
    </span>
  );
}

// EmptyState: shown instead of a blank table/board when there's nothing to display.
// Reusable everywhere so every "no data" screen looks and behaves the same way.
interface EmptyStateProps {
  title: string; // short headline, e.g. "No companies yet"
  message: string; // one sentence explaining what to do next
  ctaLabel: string; // button text, e.g. "+ Add Lead"
  onCta: () => void; // function to run when button is clicked
}

export function EmptyState({ title, message, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center shadow-2xs">
      <p className="text-xl font-bold tracking-tight text-slate-800">{title}</p>
      <p className="max-w-sm text-sm text-slate-500">{message}</p>
      <button type="button" className={`${btnPrimary} mt-2`} onClick={onCta}>
        {ctaLabel}
      </button>
    </div>
  );
}

// Skeleton: a grey placeholder block shown while a page's data is still
// loading. Decorative only — the loading region carries the accessible
// "Loading…" text, so every bar here is hidden from assistive tech.
// `motion-safe:` keeps the pulse off for people who ask their OS to reduce
// motion, and stone/teal keep it in step with the app's palette.
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`motion-safe:animate-pulse rounded-lg bg-slate-200 ${className}`}
    />
  );
}

interface SkeletonRowsProps {
  rows?: number;
  className?: string;
}

// SkeletonRows: `rows` stacked bars, for list- and table-shaped placeholders.
export function SkeletonRows({ rows = 5, className = '' }: SkeletonRowsProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

interface RelativeTimestampProps {
  value: string | null | undefined;
  prefix?: string;
  fallback?: string;
  className?: string;
}

export function RelativeTimestamp({
  value,
  prefix = '',
  fallback = '—',
  className,
}: RelativeTimestampProps) {
  if (!value) {
    return <span className={className}>{fallback}</span>;
  }
  const relative = formatRelativeTime(value);
  if (relative === '—') {
    return <span className={className}>{fallback}</span>;
  }
  const full = formatFullDateTime(value);
  return (
    <time dateTime={value} title={full || undefined} className={className}>
      {prefix}
      {relative}
    </time>
  );
}
