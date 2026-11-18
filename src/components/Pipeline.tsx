import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  rectIntersection,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type {
  Company,
  CompanyProgress,
  Contact,
  PipelineFilters,
  PipelineView,
  Stage,
} from '../types';
import type { CrmStore } from '../hooks/useCrmStore';
import {
  DEFAULT_PIPELINE_FILTERS,
  PIPELINE_DATE_RANGE_OPTIONS,
  PIPELINE_VIEWS,
  applyPipelineFilters,
  buildPipelineInsights,
  intentColor,
  loadPipelineState,
  pipelineFiltersAreActive,
  savePipelineState,
  stageAccent,
  statusColor,
} from '../lib/views';
import {
  COMPANY_PROGRESS_OPTIONS,
  companyContactSummary,
  companyProgress,
  companyProgressLabel,
  countCompanyProgress,
  groupContactsByCompany,
  whatsAppPending,
} from '../lib/progress';
import { buildCardBadges, buildChampionTrail, findChampion, istToday } from '../lib/championCard';
import { logViewEvent } from '../lib/activity';
import { api } from '../lib/api';
import type { ProjectDocument } from '../lib/projects';
import { CompanyForm } from './CompanyForm';
import { ContactForm } from './ContactForm';
import { SubmitHandoffModal } from './SubmitHandoffModal';
import { DocumentViewerModal } from './DocumentViewerModal';
import {
  EmptyState,
  FilterChip,
  FilterDropdown,
  Modal,
  RelativeTimestamp,
  SearchInput,
  btnPrimary,
  inputClass,
} from './ui';

interface PipelineProps {
  store: CrmStore;
  stages: string[];
  contactStatuses?: string[];
  discoveryQuestions?: import('../types').DiscoveryQuestion[];
  openCompanyId?: string | null;
  onOpenCompanyIdConsumed?: () => void;
  onEditingCompanyChange?: (companyId: string | null) => void;
}

function resolveDropStage(
  overId: string | number,
  companies: Company[],
  stages: readonly string[]
): Stage | null {
  const id = String(overId);
  if (stages.includes(id)) return id;
  const target = companies.find((c) => c.id === id);
  return target?.stage ?? null;
}

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const PROGRESS_TONE: Record<CompanyProgress, string> = {
  not_started: 'bg-stone-100 text-stone-600',
  didnt_pick: 'bg-stone-200 text-stone-700',
  connected: 'bg-sky-50 text-sky-800',
  follow_up: 'bg-amber-50 text-amber-800',
  demo_scheduled: 'bg-teal-50 text-teal-800',
  demo_delivered: 'bg-teal-100 text-teal-900',
  later: 'bg-violet-50 text-violet-800',
};

/** `contacts` are this company's contacts only. */
function CompanyCard({
  company,
  contacts,
  stages,
  today,
  dragging,
  onOpen,
  onSubmitHandoff,
  onViewDoc,
}: {
  company: Company;
  contacts: Contact[];
  stages: readonly string[];
  today: string;
  dragging?: boolean;
  onOpen?: () => void;
  onSubmitHandoff?: (company: Company) => void;
  onViewDoc?: (company: Company) => void;
}) {
  const badges = buildCardBadges(company, contacts, today);
  const trail = buildChampionTrail(findChampion(contacts, company.id));
  const progress = companyProgress(company, contacts, stages);
  const summary = companyContactSummary(contacts);

  return (
    <div
      data-testid="company-card"
      data-company-id={company.id}
      className={`rounded-xl border border-slate-200/90 bg-white p-3.5 text-left shadow-2xs transition hover:border-slate-300 hover:shadow-md ${
        dragging ? 'opacity-40 scale-[0.98]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 text-left cursor-pointer"
        >
          <p className="text-sm font-bold text-slate-900 leading-snug hover:text-teal-700 transition">{company.companyName}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {[company.industry, company.location].filter(Boolean).join(' · ') || '—'}
          </p>
          <div
            data-testid="card-badges"
            data-company-id={company.id}
            className="mt-2 flex flex-wrap items-center gap-1.5"
          >
            {company.sourceLink ? (
              <span className="rounded-md bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700" title={`Lead Source: ${company.sourceLink}`}>
                📢 {company.sourceLink}
              </span>
            ) : null}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {badges.contactCount} {badges.contactCount === 1 ? 'contact' : 'contacts'}
            </span>
            {badges.hasChampion ? (
              <span
                className="rounded-md bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[10px] font-bold text-teal-800"
                title="Has key contact"
              >
                ★ Champion
              </span>
            ) : null}
            {badges.followUpDueToday ? (
              <span className="rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 animate-pulse">
                Due today
              </span>
            ) : null}
          </div>
          <p
            data-testid="card-progress"
            data-company-id={company.id}
            className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-500"
          >
            <span className={`rounded-md px-1.5 py-0.5 font-bold ${PROGRESS_TONE[progress]}`}>
              {companyProgressLabel(progress)}
            </span>
            {summary.total > 0 ? (
              <span className="font-medium text-slate-600">
                {summary.dialed}/{summary.total} dialed
              </span>
            ) : null}
            {summary.whatsappDue > 0 ? (
              <span
                className={summary.whatsappPending > 0 ? 'font-bold text-rose-700' : 'text-slate-500'}
                title="WhatsApp sent / dialed contacts that should get it"
              >
                · WA {summary.whatsappSent}/{summary.whatsappDue}
              </span>
            ) : null}
          </p>
          {trail ? (
            <div
              data-testid="champion-trail"
              data-company-id={company.id}
              className="mt-2 rounded-md bg-slate-50 border border-slate-100 p-2 space-y-0.5"
            >
              <p className="text-[11px] font-bold text-teal-800">{trail.header}</p>
              {trail.note ? <p className="text-[10px] text-slate-600 leading-tight line-clamp-2">{trail.note}</p> : null}
              {trail.followUp ? (
                <p className="text-[10px] text-slate-500">{trail.followUp}</p>
              ) : null}
            </div>
          ) : null}
          {company.nextFollowUp ? (
            <p className="mt-1.5 text-[10px] font-medium text-slate-500">Follow-up: <span className="font-semibold text-slate-700">{company.nextFollowUp}</span></p>
          ) : null}
          {company.createdAt ? (
            <p className="mt-1 text-[10px] text-slate-400">
              <RelativeTimestamp value={company.createdAt} prefix="Added " />
            </p>
          ) : null}

          {company.hasDocument || company.hasQuotation ? (
            <div className="mt-2 flex items-center justify-between rounded-md bg-teal-50 border border-teal-200/90 px-2 py-1 text-[10px] font-bold text-teal-900 shadow-2xs">
              <span className="truncate max-w-[130px] flex items-center gap-1" title={company.primaryDocumentName || 'Quotation Attached'}>
                <span>📎</span> {company.primaryDocumentName || 'Quotation Attached'}
              </span>
              <button
                type="button"
                className="text-[10px] text-teal-700 underline font-bold hover:text-teal-950 cursor-pointer ml-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDoc?.(company);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                👁️ View
              </button>
            </div>
          ) : null}
          {company.stage === 'Qualified' ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSubmitHandoff?.(company);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 py-1.5 text-[11px] font-bold text-teal-800 transition hover:bg-teal-100 cursor-pointer shadow-2xs"
            >
              <span>📄</span> Submit Quotation & Scope →
            </button>
          ) : null}
          {company.stage === 'Handoff Submitted' ? (
            <div className="mt-2 flex items-center justify-between rounded-md bg-purple-50 border border-purple-200 px-2 py-1 text-[10px] font-bold text-purple-800">
              <span>📄 Quotation & Scope Submitted</span>
              <span className="text-[9px] font-semibold text-purple-600">Awaiting Client/Admin</span>
            </div>
          ) : null}
          {company.stage === 'Converted' ? (
            <div className="mt-2 flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-800">
              <span>✓ Converted to Project</span>
              <span className="text-[9px] font-semibold text-emerald-600">Active</span>
            </div>
          ) : null}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {company.intent ? (
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${intentColor(company.intent)}`}
            >
              {company.intent}
            </span>
          ) : null}
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            title="Drag card to move stage"
          >
            ⠿
          </span>
        </div>
      </div>
    </div>
  );
}

function DraggableCard({
  company,
  contacts,
  stages,
  today,
  onOpen,
  onSubmitHandoff,
  onViewDoc,
}: {
  company: Company;
  contacts: Contact[];
  stages: readonly string[];
  today: string;
  onOpen: () => void;
  onSubmitHandoff?: (company: Company) => void;
  onViewDoc?: (company: Company) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: company.id,
    data: { type: 'company', company },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="touch-manipulation cursor-grab active:cursor-grabbing"
      {...listeners}
      {...attributes}
    >
      <CompanyCard
        company={company}
        contacts={contacts}
        stages={stages}
        today={today}
        dragging={isDragging}
        onOpen={onOpen}
        onSubmitHandoff={onSubmitHandoff}
        onViewDoc={onViewDoc}
      />
    </div>
  );
}

function KanbanColumn({
  stage,
  companies,
  byCompany,
  stages,
  today,
  onOpen,
  onSubmitHandoff,
  onViewDoc,
}: {
  stage: Stage;
  companies: Company[];
  byCompany: Map<string, Contact[]>;
  stages: readonly string[];
  today: string;
  onOpen: (c: Company) => void;
  onSubmitHandoff?: (company: Company) => void;
  onViewDoc?: (company: Company) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage, data: { type: 'column', stage } });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[min(76vw,17.5rem)] shrink-0 flex-col rounded-2xl border border-slate-200/90 bg-slate-100/60 p-2 sm:w-72 shadow-2xs ${stageAccent(stage)} ${
        isOver ? 'ring-2 ring-teal-600/40 bg-teal-50/20' : ''
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <h3 className="text-xs font-bold tracking-wider text-slate-700 uppercase">{stage}</h3>
        <span className="rounded-full bg-slate-200/90 px-2.5 py-0.5 text-xs font-bold text-slate-700">
          {companies.length}
        </span>
      </div>
      <div className="flex min-h-[10rem] max-h-[min(54dvh,32rem)] flex-col gap-2.5 overflow-y-auto p-1 kanban-scroll sm:max-h-[calc(100vh-14rem)]">
        {companies.map((c) => (
          <DraggableCard
            key={c.id}
            company={c}
            contacts={byCompany.get(c.id) ?? []}
            stages={stages}
            today={today}
            onOpen={() => onOpen(c)}
            onSubmitHandoff={onSubmitHandoff}
            onViewDoc={onViewDoc}
          />
        ))}
        {companies.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300/80 py-10">
            <p className="text-xs font-medium text-slate-400">Drop leads here</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Pipeline({
  store,
  stages,
  contactStatuses,
  discoveryQuestions = [],
  openCompanyId = null,
  onOpenCompanyIdConsumed,
  onEditingCompanyChange,
}: PipelineProps) {
  const [saved] = useState(() => loadPipelineState(sessionStorageOrNull()));
  const [view, setView] = useState<PipelineView>(
    saved.view === 'All Companies' ? 'All Leads' : saved.view
  );
  const [filters, setFilters] = useState<PipelineFilters>(saved.filters);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [editing, setEditing] = useState<Company | null>(null);
  // A contact opened from the company modal; the company modal comes back when it closes.
  const [openContact, setOpenContact] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [handoffModalCompany, setHandoffModalCompany] = useState<Company | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [pipelineSuccess, setPipelineSuccess] = useState<string | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const openCompany = (c: Company) => {
    setEditing(c);
    onEditingCompanyChange?.(c.id);
    logViewEvent('company.opened', c.id, c.companyName);
    setSuggestOpen(false);
    setSearchDraft('');
    setSearchQuery('');
  };

  const closeEditing = () => {
    setEditing(null);
    onEditingCompanyChange?.(null);
  };

  const onCompanySaved = () => {
    closeEditing();
    if (view !== 'All Leads' && view !== 'All Companies') {
      setView('All Leads');
    }
  };

  useEffect(() => {
    if (!openCompanyId) return;
    const company = store.companies.find((c) => c.id === openCompanyId);
    if (company) {
      setEditing(company);
      logViewEvent('company.opened', company.id, company.companyName);
    }
    onOpenCompanyIdConsumed?.();
  }, [openCompanyId, store.companies, onOpenCompanyIdConsumed]);

  useEffect(() => {
    savePipelineState(sessionStorageOrNull(), { view, filters });
  }, [view, filters]);

  useEffect(() => {
    const id = window.setTimeout(() => setSearchQuery(searchDraft), 200);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) setSuggestOpen(false);
    };
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [suggestOpen]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  const byCompany = useMemo(() => groupContactsByCompany(store.contacts), [store.contacts]);
  const progressCtx = useMemo(
    () => ({ contacts: store.contacts, stages, byCompany }),
    [store.contacts, stages, byCompany]
  );

  const filtered = useMemo(
    () => applyPipelineFilters(store.companies, view, filters, undefined, progressCtx),
    [store.companies, view, filters, progressCtx]
  );

  // Chip counts ignore their own filter so each chip shows what clicking it would give.
  const progressCounts = useMemo(() => {
    const base = applyPipelineFilters(
      store.companies,
      view,
      { ...filters, progress: 'all' },
      undefined,
      progressCtx
    );
    return { all: base.length, ...countCompanyProgress(base, byCompany, stages) };
  }, [store.companies, view, filters, progressCtx, byCompany, stages]);

  const whatsappPendingCompanies = useMemo(
    () =>
      applyPipelineFilters(
        store.companies,
        view,
        { ...filters, whatsappPending: true },
        undefined,
        progressCtx
      ).length,
    [store.companies, view, filters, progressCtx]
  );

  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return filtered
      .filter((c) => c.companyName.toLowerCase().includes(q))
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
      .slice(0, 12);
  }, [filtered, searchQuery]);

  useEffect(() => {
    setHighlight(0);
  }, [searchQuery]);

  const byStage = useMemo(() => {
    const map = new Map<Stage, Company[]>();
    for (const s of stages) map.set(s, []);
    for (const c of filtered) {
      const list = map.get(c.stage);
      if (list) list.push(c);
      else {
        map.set(c.stage, [c]);
      }
    }
    return map;
  }, [filtered, stages]);

  const boardStages = useMemo(() => {
    const extra = [...byStage.keys()].filter((s) => !stages.includes(s));
    return [...stages, ...extra];
  }, [byStage, stages]);

  const insights = useMemo(
    () => buildPipelineInsights(filtered, store.contacts, stages),
    [filtered, store.contacts, stages]
  );

  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);

  const openCompanyDoc = async (company: Company) => {
    try {
      const res = await api<{ documents: ProjectDocument[] }>(`/api/project-documents?leadId=${company.id}`);
      if (res.documents && res.documents.length > 0) {
        setViewingDoc(res.documents[0]);
      } else if (company.primaryDocumentId) {
        setViewingDoc({
          id: company.primaryDocumentId,
          filename: company.primaryDocumentName || 'Quotation Document',
          type: company.primaryDocumentType || 'quotation',
          contentType: company.primaryDocumentName?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
          sizeBytes: 0,
          developerVisible: false,
          uploadedAt: new Date().toISOString(),
          uploadedBy: '',
        });
      }
    } catch {
      if (company.primaryDocumentId) {
        setViewingDoc({
          id: company.primaryDocumentId,
          filename: company.primaryDocumentName || 'Quotation Document',
          type: company.primaryDocumentType || 'quotation',
          contentType: company.primaryDocumentName?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
          sizeBytes: 0,
          developerVisible: false,
          uploadedAt: new Date().toISOString(),
          uploadedBy: '',
        });
      }
    }
  };

  const whatsappPendingContacts = useMemo(
    () =>
      filtered.reduce((n, c) => n + (byCompany.get(c.id) ?? []).filter(whatsAppPending).length, 0),
    [filtered, byCompany]
  );

  const activeCompany = activeId ? (store.companies.find((c) => c.id === activeId) ?? null) : null;

  const today = istToday();
  const filtersActive = pipelineFiltersAreActive(filters);
  const isNarrowedDown = filtersActive || (view !== 'All Companies' && view !== 'All Leads');
  const dateLabel =
    PIPELINE_DATE_RANGE_OPTIONS.find((o) => o.value === filters.dateRange)?.label ?? 'All Time';

  const viewCounts = useMemo(() => {
    const map = new Map<PipelineView, number>();
    for (const v of PIPELINE_VIEWS) {
      map.set(v, applyPipelineFilters(store.companies, v, filters, undefined, progressCtx).length);
    }
    return map;
  }, [store.companies, filters, progressCtx]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const companyId = String(active.id);
    const stage = resolveDropStage(over.id, store.companies, boardStages);
    if (!stage) return;

    const company = store.companies.find((c) => c.id === companyId);
    if (company && company.stage !== stage) {
      if (stage === 'Handoff Submitted') {
        // Document Verification Checkpoint:
        // Only require modal/upload if this lead does NOT already have a verified quotation or scope document!
        if (!company.hasDocument && !company.hasQuotation) {
          setHandoffModalCompany(company);
          return;
        }
      }
      // If we were filtered to a single stage, automatically switch to All Leads so the moved card remains visible!
      if (view !== 'All Leads' && view !== 'All Companies') {
        setView('All Leads');
      }
      setPipelineError(null);
      setPipelineSuccess(null);
      try {
        await store.moveCompanyStage(companyId, stage);
        if (stage === 'Converted' || stage === 'Closed Won') {
          setPipelineSuccess(`Converted "${company.companyName}"! Added to Admin project distribution queue.`);
        } else if (stage === 'Handoff Submitted') {
          setPipelineSuccess(`Moved "${company.companyName}" to Handoff Submitted (Verified Document: ${company.primaryDocumentName || 'Quotation Attached'}).`);
        } else {
          setPipelineSuccess(`Moved "${company.companyName}" to ${stage}.`);
        }
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : 'Failed to move lead stage');
      }
    }
  };

  const pickSuggestion = (company: Company) => {
    openCompany(company);
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSuggestOpen(false);
      setSearchDraft('');
      setSearchQuery('');
      return;
    }
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = suggestions[highlight];
      if (pick) pickSuggestion(pick);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-teal-700 uppercase">
            Pipeline
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-stone-900 sm:text-4xl">
            Lead Pipeline
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Track each client lead from first contact through qualification and handoff.
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
          + Add Lead
        </button>
      </header>

      {pipelineError ? (
        <div role="alert" className="flex items-center justify-between rounded bg-rose-50 p-3 text-sm text-rose-700">
          <span>{pipelineError}</span>
          <button type="button" onClick={() => setPipelineError(null)} className="ml-2 font-bold text-rose-800">✕</button>
        </div>
      ) : null}
      {pipelineSuccess ? (
        <div role="status" className="flex items-center justify-between rounded bg-teal-50 p-3 text-sm text-teal-800">
          <span>{pipelineSuccess}</span>
          <button type="button" onClick={() => setPipelineSuccess(null)} className="ml-2 font-bold text-teal-900">✕</button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div ref={searchWrapRef} className="relative min-w-0 flex-1">
          <SearchInput
            data-testid="pipeline-search"
            value={searchDraft}
            onChange={(v) => {
              setSearchDraft(v);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search leads…"
          />
          {suggestOpen && searchQuery.trim() ? (
            <div
              data-testid="pipeline-search-suggestions"
              className="absolute top-full right-0 left-0 z-40 mt-1.5 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl kanban-scroll"
            >
              {suggestions.length === 0 ? (
                <p className="px-3.5 py-3 text-xs text-slate-400">No matching leads found</p>
              ) : (
                suggestions.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    data-testid="pipeline-search-suggestion"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pickSuggestion(c)}
                    className={`flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left text-xs transition cursor-pointer ${
                      i === highlight ? 'bg-teal-50 text-teal-900' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="font-bold text-slate-900">{c.companyName}</span>
                    <span className="text-slate-500 text-[11px]">
                      <span className="font-semibold text-teal-800">{c.stage}</span>
                      {c.sourceLink ? ` · 📢 ${c.sourceLink}` : ''}
                      {c.createdAt ? (
                        <>
                          {' · Added '}
                          <RelativeTimestamp value={c.createdAt} />
                        </>
                      ) : (
                        ''
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            data-testid="pipeline-date-range"
            label="Added"
            value={filters.dateRange}
            options={PIPELINE_DATE_RANGE_OPTIONS}
            active={filters.dateRange !== 'all'}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                dateRange: v as PipelineFilters['dateRange'],
                ...(v !== 'custom' ? { customFrom: null, customTo: null } : {}),
              }))
            }
          />
          {filters.dateRange === 'custom' ? (
            <>
              <label className="flex items-center gap-1.5 text-xs text-stone-600">
                From
                <input
                  data-testid="pipeline-custom-from"
                  type="date"
                  value={filters.customFrom ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      customFrom: e.target.value || null,
                    }))
                  }
                  className={`${inputClass} w-auto py-1.5 text-xs`}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-stone-600">
                To
                <input
                  data-testid="pipeline-custom-to"
                  type="date"
                  value={filters.customTo ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      customTo: e.target.value || null,
                    }))
                  }
                  className={`${inputClass} w-auto py-1.5 text-xs`}
                />
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div
        data-testid="pipeline-progress"
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Calling progress"
      >
        <span className="mr-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Calling progress
        </span>
        {[
          { value: 'all' as const, label: 'All', hint: 'Every lead' },
          ...COMPANY_PROGRESS_OPTIONS,
        ].map((o) => {
          const selected = filters.progress === o.value;
          return (
            <button
              key={o.value}
              type="button"
              data-testid={`pipeline-progress-${o.value}`}
              aria-pressed={selected}
              title={o.hint}
              onClick={() => setFilters((f) => ({ ...f, progress: o.value }))}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer shadow-2xs ${
                selected
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {o.label}
              <span className="ml-1.5 opacity-75 font-mono" data-testid="pipeline-progress-count">
                {progressCounts[o.value]}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          data-testid="pipeline-whatsapp-pending"
          aria-pressed={filters.whatsappPending}
          title="Leads with a dialed contact who has not received the WhatsApp message"
          onClick={() => setFilters((f) => ({ ...f, whatsappPending: !f.whatsappPending }))}
          className={`ml-1 shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer shadow-2xs ${
            filters.whatsappPending
              ? 'bg-emerald-700 text-white'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          WhatsApp pending
          <span className="ml-1.5 opacity-80 font-mono">{whatsappPendingCompanies}</span>
        </button>
      </div>

      {filtersActive ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters.progress !== 'all' ? (
            <FilterChip
              label={`Progress: ${companyProgressLabel(filters.progress)}`}
              onClear={() => setFilters((f) => ({ ...f, progress: 'all' }))}
            />
          ) : null}
          {filters.whatsappPending ? (
            <FilterChip
              label="WhatsApp pending"
              onClear={() => setFilters((f) => ({ ...f, whatsappPending: false }))}
            />
          ) : null}
          {filters.dateRange !== 'all' ? (
            <FilterChip
              label={`Added: ${dateLabel}${
                filters.dateRange === 'custom'
                  ? ` ${filters.customFrom ?? '…'} → ${filters.customTo ?? '…'}`
                  : ''
              }`}
              onClear={() =>
                setFilters((f) => ({ ...f, dateRange: 'all', customFrom: null, customTo: null }))
              }
            />
          ) : null}
          <button
            type="button"
            data-testid="pipeline-clear-filters"
            onClick={() => setFilters(DEFAULT_PIPELINE_FILTERS)}
            className="text-xs font-bold text-teal-800 underline-offset-2 hover:underline cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 pb-1">
        {PIPELINE_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer shadow-2xs ${
              view === v
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {v === 'All Companies' ? 'All Leads' : v}
            <span className="ml-1.5 opacity-80 font-mono">({viewCounts.get(v) ?? 0})</span>
          </button>
        ))}
      </div>

      {view !== 'All Leads' && view !== 'All Companies' ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2 text-xs text-amber-900 shadow-2xs">
          <span>
            Filtered to <b>{view}</b> leads. Dragging or changing a lead&apos;s stage will automatically switch to <b>All Leads</b> so it remains visible.
          </span>
          <button
            type="button"
            onClick={() => setView('All Leads')}
            className="ml-3 shrink-0 font-bold text-teal-800 underline hover:text-teal-950 cursor-pointer"
          >
            Show All Leads
          </button>
        </div>
      ) : null}

      <section
        data-testid="pipeline-insights"
        className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 bg-slate-50/60">
          <div>
            <p className="text-[10px] font-bold tracking-wider text-teal-800 uppercase">
              Pipeline Stage Metrics
            </p>
            <p className="text-xs text-slate-600 font-medium">
              {dateLabel}
              {view !== 'All Companies' ? ` · ${view}` : ''}
              {' · '}
              <strong className="text-slate-900">{insights.total}</strong> total lead{insights.total === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            data-testid="pipeline-insights-toggle"
            onClick={() => setInsightsOpen((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
          >
            {insightsOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {insightsOpen ? (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <span
                data-testid="pipeline-insight-total"
                className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800"
              >
                {insights.total} total
              </span>
              <span className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">
                {insights.contacted} contacted
              </span>
              {insights.stageCounts.map((sc) => (
                <span
                  key={sc.stage}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs"
                >
                  <strong className="text-teal-700">{sc.count}</strong> {sc.stage}
                </span>
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-stone-400 uppercase">
                Conversion
              </p>
              <p className="text-xs text-stone-600">
                Discovery {insights.conversion.toDiscovery}% · Demo {insights.conversion.toDemo}% ·
                Won {insights.conversion.toWon}%
              </p>
            </div>

            {insights.stageCounts.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-stone-400 uppercase">
                  Stage funnel
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {insights.stageCounts.map(({ stage, count }) => (
                    <span
                      key={stage}
                      className="rounded-none bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700 ring-1 ring-[var(--color-line)]"
                    >
                      {count} {stage}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-stone-400 uppercase">
                Client contacts on these leads
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-none bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                  {insights.contactTotal} contacts
                </span>
                <span className="rounded-none bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  {insights.champions} key contacts
                </span>
                <span
                  data-testid="pipeline-insight-whatsapp-pending"
                  className="rounded-none bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                >
                  {whatsappPendingContacts} WhatsApp pending
                </span>
                {insights.statusCounts.slice(0, 5).map(({ status, count }) => (
                  <span
                    key={status}
                    className={`rounded-none px-2 py-0.5 text-[11px] font-medium ${statusColor(status)}`}
                  >
                    {count} {status}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          title={isNarrowedDown ? 'No leads match this view' : 'No leads yet'}
          message={
            isNarrowedDown
              ? 'Try a different view or clear the filters to see more leads.'
              : 'Add your first lead to start tracking client conversations.'
          }
          ctaLabel={isNarrowedDown ? 'Show all leads' : '+ Add Lead'}
          onCta={
            isNarrowedDown
              ? () => {
                  setView('All Leads');
                  setFilters(DEFAULT_PIPELINE_FILTERS);
                }
              : () => setCreating(true)
          }
        />
      ) : null}

      {filtered.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 kanban-scroll">
            {boardStages.map((stage) => (
              <KanbanColumn
                key={stage}
                stage={stage}
                companies={byStage.get(stage) ?? []}
                byCompany={byCompany}
                stages={stages}
                today={today}
                onOpen={openCompany}
                onSubmitHandoff={(c) => setHandoffModalCompany(c)}
                onViewDoc={openCompanyDoc}
              />
            ))}
          </div>
          <DragOverlay>
            {activeCompany ? (
              <div className="w-[min(72vw,16rem)] rotate-1 sm:w-64">
                <CompanyCard
                  company={activeCompany}
                  contacts={byCompany.get(activeCompany.id) ?? []}
                  stages={stages}
                  today={today}
                  onSubmitHandoff={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}

      {handoffModalCompany ? (
        <SubmitHandoffModal
          company={handoffModalCompany}
          open={Boolean(handoffModalCompany)}
          onClose={() => setHandoffModalCompany(null)}
          onSuccess={async () => {
            await store.moveCompanyStage(handoffModalCompany.id, 'Handoff Submitted');
            setPipelineSuccess(`Handoff submitted to Admin for "${handoffModalCompany.companyName}" with quotation document.`);
            setHandoffModalCompany(null);
          }}
        />
      ) : null}

      <Modal open={creating} title="Add Lead" onClose={() => setCreating(false)} wide>
        <CompanyForm
          store={store}
          stages={stages}
          discoveryQuestions={discoveryQuestions}
          onDone={() => setCreating(false)}
        />
      </Modal>

      <Modal
        open={!!editing && !openContact}
        title={editing?.companyName ?? 'Edit lead'}
        onClose={closeEditing}
        wide
      >
        {editing ? (
          <CompanyForm
            key={editing.id}
            store={store}
            stages={stages}
            discoveryQuestions={discoveryQuestions}
            initial={editing}
            onDone={onCompanySaved}
            onOpenContact={(contact) => {
              setOpenContact(contact);
              logViewEvent('contact.opened', contact.id, contact.contactName);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={!!openContact}
        title={openContact?.contactName ?? 'Contact'}
        onClose={() => setOpenContact(null)}
        wide
      >
        {openContact ? (
          <ContactForm
            key={openContact.id}
            store={store}
            contactStatuses={contactStatuses}
            stages={stages}
            initial={store.contacts.find((t) => t.id === openContact.id) ?? openContact}
            onDone={() => setOpenContact(null)}
          />
        ) : null}
      </Modal>

      <DocumentViewerModal
        document={viewingDoc}
        open={Boolean(viewingDoc)}
        onClose={() => setViewingDoc(null)}
      />
    </div>
  );
}
