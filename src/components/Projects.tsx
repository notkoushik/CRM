import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Company, CrmUser } from '../types';
import { api } from '../lib/api';
import {
  downloadProjectDocument,
  uploadProjectDocument,
  type Handoff,
  type Project,
  type ProjectDocument,
  type ProjectEvaluation,
  type ProjectUpdate,
  type Settlement,
} from '../lib/projects';
import type { CrmStore } from '../hooks/useCrmStore';
import { btnGhost, btnPrimary, Field, inputClass } from './ui';
import { DocumentViewerModal } from './DocumentViewerModal';

const HANDOFF_TYPES = ['Website', 'Mobile application', 'Software', 'Design', 'Marketing', 'Other'];
const PROJECT_STATUSES = [
  'awaiting_assignment',
  'assigned',
  'in_evaluation',
  'awaiting_admin_review',
  'clarification_required',
  'approved',
  'declined',
  'in_progress',
  'completed',
];

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function dateText(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
}

function alertText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export interface DocumentPanelProps {
  parent: { projectId?: string; handoffId?: string; leadId?: string };
  userRole: string;
}

export function DocumentPanel({ parent, userRole }: DocumentPanelProps) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);
  const [type, setType] = useState(parent.leadId ? 'quotation' : 'client_reference');
  const [file, setFile] = useState<File | null>(null);
  const [developerVisible, setDeveloperVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const parentId = parent.projectId ?? parent.handoffId ?? parent.leadId ?? '';
  const parentKey = parent.projectId ? 'projectId' : parent.handoffId ? 'handoffId' : 'leadId';

  const load = useCallback(async () => {
    if (!parentId) return;
    const query = new URLSearchParams({ [parentKey]: parentId });
    const result = await api<{ documents: ProjectDocument[] }>(`/api/project-documents?${query}`);
    setDocuments(result.documents);
  }, [parentId, parentKey]);

  useEffect(() => {
    void load().catch((e) => setError(alertText(e)));
  }, [load]);

  const upload = async (e?: FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await uploadProjectDocument(parent, type, file, developerVisible);
      setFile(null);
      await load();
    } catch (e) {
      setError(alertText(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleVisibility = async (doc: ProjectDocument) => {
    try {
      await api(`/api/project-documents/${doc.id}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ developerVisible: !doc.developerVisible }),
      });
      await load();
    } catch (e) {
      setError(alertText(e));
    }
  };

  const kinds = userRole === 'developer'
    ? ['technical', 'deliverable', 'other']
    : ['quotation', 'project_brief', 'client_reference', 'technical', 'deliverable', 'other'];

  return (
    <section className="space-y-4 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <svg className="h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Attachments & Project Specifications
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Client requirement documents, quotation briefs, technical specifications, and deliverables for this project.
          </p>
        </div>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p> : null}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-[14rem_1fr_auto]">
          <select aria-label="Document type" className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            {kinds.map((kind) => <option key={kind} value={kind}>{kind === 'quotation' ? 'Client Scope / Quotation' : titleCase(kind)}</option>)}
          </select>
          <input
            aria-label="Choose document"
            className={inputClass}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button className={`${btnPrimary} py-2`} type="button" onClick={(e) => void upload(e)} disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload Document'}</button>
        </div>
        {userRole === 'admin' || userRole === 'founder' ? (
          <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
            <input type="checkbox" checked={developerVisible} onChange={(e) => setDeveloperVisible(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
            Allow assigned Developer to view and download this file
          </label>
        ) : null}
      </div>
      {documents.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-4 text-xs text-slate-400 text-center">No documents uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/60 transition">
              <div className="min-w-0 flex-1 flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-[10px] font-bold text-slate-600">
                  {doc.type === 'quotation' ? 'RFC' : 'DOC'}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900">{doc.filename}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                      {doc.type === 'quotation' ? 'Client Scope & Requirements' : titleCase(doc.type)}
                    </span>
                    {doc.type === 'quotation' ? (
                      <span className="rounded bg-teal-50 border border-teal-200 text-teal-800 px-1.5 py-0.2 text-[10px] font-bold">
                        Requirement Doc
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                {userRole === 'admin' || userRole === 'founder' ? (
                  <button
                    type="button"
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      doc.developerVisible
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    onClick={() => void toggleVisibility(doc)}
                  >
                    {doc.developerVisible ? 'Visible to Dev' : 'Hidden from Dev'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg border border-teal-600 bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-teal-700 transition cursor-pointer flex items-center gap-1.5"
                  onClick={() => setViewingDoc(doc)}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Document
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition cursor-pointer flex items-center gap-1.5"
                  onClick={() => void downloadProjectDocument(doc).catch((e) => setError(alertText(e)))}
                  title="Download file directly"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DocumentViewerModal
        document={viewingDoc}
        open={Boolean(viewingDoc)}
        onClose={() => setViewingDoc(null)}
      />
    </section>
  );
}

interface HandoffDraft {
  leadId: string;
  title: string;
  projectType: string;
  description: string;
  functionalRequirements: string;
  preferredTechnology: string;
  expectedBudget: string;
  expectedTimeline: string;
  additionalComments: string;
}

const emptyDraft = (leadId = ''): HandoffDraft => ({
  leadId, title: '', projectType: 'Website', description: '', functionalRequirements: '',
  preferredTechnology: '', expectedBudget: '', expectedTimeline: '', additionalComments: '',
});

function draftFromHandoff(h: Handoff): HandoffDraft {
  return {
    leadId: h.leadId, title: h.title, projectType: h.projectType,
    description: h.description, functionalRequirements: h.functionalRequirements,
    preferredTechnology: h.preferredTechnology, expectedBudget: h.expectedBudget,
    expectedTimeline: h.expectedTimeline, additionalComments: h.additionalComments,
  };
}

export function HandoffsPage({
  store,
  userRole,
  onOpenProject,
}: {
  store: CrmStore;
  userRole: string;
  onOpenProject: () => void;
}) {
  const isAdmin = userRole === 'admin' || userRole === 'founder';
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [developers, setDevelopers] = useState<CrmUser[]>([]);
  const [draft, setDraft] = useState<HandoffDraft>(() => emptyDraft(store.companies[0]?.id ?? ''));
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('quotation');
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [review, setReview] = useState<Record<string, { developerId: string; reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ handoffs: Handoff[] }>('/api/handoffs');
      setHandoffs(result.handoffs);
    } catch (e) {
      setError(alertText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!isAdmin) return;
    void api<{ users: CrmUser[] }>('/api/users')
      .then((result) => setDevelopers(result.users.filter((u) => u.role === 'developer')))
      .catch((e) => setError(alertText(e)));
  }, [isAdmin]);
  useEffect(() => {
    if (!draft.leadId && store.companies[0]) setDraft((d) => ({ ...d, leadId: store.companies[0].id }));
  }, [draft.leadId, store.companies]);

  const setDraftField = (key: keyof HandoffDraft, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      let createdId = editing;
      if (editing) {
        await api(`/api/handoffs/${editing}`, { method: 'PATCH', body: JSON.stringify(draft) });
        setSuccess('Handoff updated and resubmitted to Admin.');
      } else {
        const res = await api<{ handoff: Handoff }>('/api/handoffs', { method: 'POST', body: JSON.stringify(draft) });
        createdId = res.handoff.id;
        setSuccess('Project handoff submitted to Admin for review.');
      }
      if (quoteFile && createdId) {
        await uploadProjectDocument({ handoffId: createdId }, docType, quoteFile, false);
        setQuoteFile(null);
      }
      setDraft(emptyDraft(store.companies[0]?.id ?? ''));
      setEditing(null);
      await load();
    } catch (e) { setError(alertText(e)); }
    finally { setBusy(false); }
  };

  const reviewHandoff = async (handoff: Handoff, decision: 'approve' | 'reject' | 'needs_clarification') => {
    const data = review[handoff.id] ?? { developerId: developers[0]?.id ?? '', reason: '' };
    setBusy(true); setError(''); setSuccess('');
    try {
      const result = await api<{ project?: Project }>(`/api/handoffs/${handoff.id}/review`, {
        method: 'PATCH', body: JSON.stringify({ decision, developerId: data.developerId, reason: data.reason }),
      });
      setSuccess(decision === 'approve' ? 'Project created and assigned to the selected Developer.' : `Handoff ${titleCase(decision)}.`);
      await load();
      if (result.project) onOpenProject();
    } catch (e) { setError(alertText(e)); }
    finally { setBusy(false); }
  };

  const hasLeads = store.companies.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-teal-700 uppercase">Lead to project</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-stone-900 sm:text-5xl">{isAdmin ? 'Handoff review' : 'My handoffs'}</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-500">Submit qualified client requirements for Admin review, attach quotations and references, and track each decision.</p>
      </header>

      {!isAdmin ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-extrabold text-slate-900">{editing ? 'Add the requested details' : 'Submit Lead for Project Review'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Provide client requirements and upload quotations. Founder reviews and assigns a technical developer.</p>
          </div>
          {hasLeads ? (
            <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Lead / client business"><select className={inputClass} value={draft.leadId} onChange={(e) => setDraftField('leadId', e.target.value)} required>{store.companies.map((c: Company) => <option key={c.id} value={c.id}>{c.companyName}</option>)}</select></Field>
              <Field label="Project title"><input className={inputClass} value={draft.title} onChange={(e) => setDraftField('title', e.target.value)} required maxLength={240} /></Field>
              <Field label="Project type"><select className={inputClass} value={draft.projectType} onChange={(e) => setDraftField('projectType', e.target.value)}>{HANDOFF_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Expected timeline"><input className={inputClass} value={draft.expectedTimeline} onChange={(e) => setDraftField('expectedTimeline', e.target.value)} placeholder="e.g. 6 weeks" /></Field>
              <Field label="Expected budget (internal; hidden from Developers)"><input className={inputClass} value={draft.expectedBudget} onChange={(e) => setDraftField('expectedBudget', e.target.value)} placeholder="Optional" /></Field>
              <Field label="Preferred technology"><input className={inputClass} value={draft.preferredTechnology} onChange={(e) => setDraftField('preferredTechnology', e.target.value)} /></Field>
              <Field label="Quotation or Brief Attachment (optional)" className="sm:col-span-2">
                <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
                  <select
                    className={inputClass}
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                  >
                    <option value="quotation">Quotation (Strictly Private)</option>
                    <option value="project_brief">Project Brief</option>
                    <option value="client_reference">Client Reference</option>
                    <option value="other">Other Document</option>
                  </select>
                  <input
                    type="file"
                    className={inputClass}
                    onChange={(e) => setQuoteFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Quotations are kept strictly private to Admin and Caller (never shown to Developers).
                </p>
              </Field>
              <Field label="Project description" className="sm:col-span-2"><textarea className={`${inputClass} min-h-20`} value={draft.description} onChange={(e) => setDraftField('description', e.target.value)} /></Field>
              <Field label="Functional requirements" className="sm:col-span-2"><textarea className={`${inputClass} min-h-24`} value={draft.functionalRequirements} onChange={(e) => setDraftField('functionalRequirements', e.target.value)} required /></Field>
              <Field label="Additional comments" className="sm:col-span-2"><textarea className={`${inputClass} min-h-16`} value={draft.additionalComments} onChange={(e) => setDraftField('additionalComments', e.target.value)} /></Field>
              <div className="flex gap-2 sm:col-span-2 pt-2"><button className={btnPrimary} type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Resubmit handoff' : 'Submit handoff'}</button>{editing ? <button type="button" className={btnGhost} onClick={() => { setEditing(null); setDraft(emptyDraft(store.companies[0]?.id ?? '')); }}>Cancel</button> : null}</div>
            </form>
          ) : <p className="mt-3 text-sm text-slate-500">Create a lead and client contact before submitting a project handoff.</p>}
        </section>
      ) : null}

      {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">{error}</p> : null}
      {success ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3.5 text-xs font-semibold text-teal-800">{success}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading handoffs…</p> : handoffs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-medium text-slate-400 shadow-2xs">No handoffs to show yet.</p>
      ) : (
        <div className="space-y-4">
          {handoffs.map((h) => (
            <article key={h.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900">{h.title}</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">{h.clientBusiness} · {h.clientContact || 'No contact recorded'}</p>
                  <p className="mt-1 text-xs text-slate-400">Submitted by {h.submitterName} · {dateText(h.createdAt)} · {h.projectType}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  h.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                  h.status === 'needs_clarification' ? 'bg-purple-100 text-purple-800' :
                  h.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                  'bg-amber-100 text-amber-800'
                }`}>{titleCase(h.status)}</span>
              </div>
              {h.decisionReason ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Admin note: {h.decisionReason}</p> : null}
              {h.status === 'needs_clarification' && !isAdmin && h.submittedBy ? (
                <button type="button" className="mt-3 text-sm font-semibold text-teal-700 hover:underline cursor-pointer" onClick={() => { setEditing(h.id); setDraft(draftFromHandoff(h)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Update details →</button>
              ) : null}
              {isAdmin && ['submitted', 'needs_clarification'].includes(h.status) ? (
                <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[1fr_2fr]">
                  <Field label="Assign Developer"><select className={inputClass} value={review[h.id]?.developerId ?? developers[0]?.id ?? ''} onChange={(e) => setReview((r) => ({ ...r, [h.id]: { ...r[h.id], developerId: e.target.value, reason: r[h.id]?.reason ?? '' } }))}><option value="">Choose Developer</option>{developers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
                  <Field label="Decision note"><input className={inputClass} value={review[h.id]?.reason ?? ''} onChange={(e) => setReview((r) => ({ ...r, [h.id]: { developerId: r[h.id]?.developerId ?? developers[0]?.id ?? '', reason: e.target.value } }))} placeholder="Required for clarification or rejection" /></Field>
                  <div className="flex flex-wrap gap-2 sm:col-span-2 pt-1">
                    <button type="button" className={btnPrimary} disabled={busy || !developers.length} onClick={() => void reviewHandoff(h, 'approve')}>Approve & Assign Developer</button>
                    <button type="button" className={btnGhost} disabled={busy} onClick={() => void reviewHandoff(h, 'needs_clarification')}>Request clarification</button>
                    <button type="button" className={btnGhost} disabled={busy} onClick={() => void reviewHandoff(h, 'reject')}>Reject</button>
                  </div>
                </div>
              ) : null}
              <button type="button" className="mt-4 text-xs font-semibold text-teal-700 hover:underline cursor-pointer" onClick={() => setExpanded(expanded === h.id ? null : h.id)}>{expanded === h.id ? '▲ Hide details and documents' : '▼ View details and documents'}</button>
              {expanded === h.id ? (
                <div className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm">
                  <p><b>Requirements:</b> {h.functionalRequirements || '—'}</p>
                  <p><b>Description:</b> {h.description || '—'}</p>
                  <p><b>Timeline:</b> {h.expectedTimeline || '—'}{userRole !== 'developer' && h.expectedBudget ? ` · Budget: ${h.expectedBudget}` : ''}</p>
                  {isAdmin || h.submittedBy ? <DocumentPanel parent={{ handoffId: h.id }} userRole={userRole} /> : null}
                </div>
              ) : null}
              {h.projectId && isAdmin ? <button type="button" className="mt-3 block text-xs font-semibold text-teal-700 hover:underline cursor-pointer" onClick={onOpenProject}>Open converted project →</button> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const COMMON_DATABASES = [
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Supabase',
  'Firebase',
  'Redis',
  'SQLite',
] as const;

const COMMON_TECH_STACK = [
  'React',
  'Next.js',
  'Vue.js',
  'Node.js',
  'Express',
  'TypeScript',
  'Python',
  'FastAPI',
  'Tailwind CSS',
  'Docker',
  'AWS',
  'REST API',
] as const;

const EFFORT_PRESETS = [
  '1–2 Weeks',
  '2–4 Weeks',
  '1–2 Months',
  '2–3 Months',
  '3–6 Months',
] as const;

const MILESTONES = [
  { id: 'planning', label: '1. Scope & Planning' },
  { id: 'architecture', label: '2. DB & Architecture' },
  { id: 'in_development', label: '3. In Development' },
  { id: 'testing', label: '4. QA & Testing' },
  { id: 'deployed', label: '5. Production / Live' },
] as const;

export function ProjectsPage({ store, userRole }: { store: CrmStore; userRole: string }) {
  const isAdmin = userRole === 'admin' || userRole === 'founder';
  const [projects, setProjects] = useState<Project[]>([]);
  const [developers, setDevelopers] = useState<CrmUser[]>([]);
  const [activeId, setActiveId] = useState('');
  const [details, setDetails] = useState<{ project: Project; updates: ProjectUpdate[]; evaluations: ProjectEvaluation[] } | null>(null);
  const [settlement, setSettlement] = useState<Settlement>({ agreedAmount: 0, amountReceived: 0, currency: 'INR', paymentStatus: 'unpaid', notes: '' });
  const [pendingHandoffs, setPendingHandoffs] = useState(0);
  const [updateText, setUpdateText] = useState('');
  const [progress, setProgress] = useState('');
  const [editingTechSpecs, setEditingTechSpecs] = useState(false);
  const [techSpecsDraft, setTechSpecsDraft] = useState({
    githubRepoUrl: '',
    liveUrl: '',
    databaseEngine: 'PostgreSQL',
    techStack: '',
    architectureNotes: '',
    developmentMilestone: 'planning',
  });
  const [evaluation, setEvaluation] = useState({
    feasibility: 'feasible',
    suggestedTechnology: '',
    databaseEngine: 'PostgreSQL',
    githubRepoUrl: '',
    liveUrl: '',
    techStack: '',
    estimatedEffort: '2–4 Weeks',
    technicalRequirements: '',
    clarificationQuestions: '',
    notes: '',
  });
  const [create, setCreate] = useState({ leadId: '', developerId: '', title: '', projectType: 'Other', description: '', functionalRequirements: '', preferredTechnology: '', expectedTimeline: '', dueAt: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ projects: Project[] }>('/api/projects');
      setProjects(result.projects);
      setActiveId((current) => result.projects.some((p) => p.id === current) ? current : result.projects[0]?.id ?? '');
    } catch (e) { setError(alertText(e)); }
    finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) { setDetails(null); return; }
    try {
      setDetails(await api(`/api/projects/${id}`));
    } catch (e) { setError(alertText(e)); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadDetail(activeId); }, [activeId, loadDetail]);
  useEffect(() => {
    if (!isAdmin) return;
    void Promise.all([
      api<{ users: CrmUser[] }>('/api/users'),
      activeId
        ? api<{ settlement: Settlement | null }>(`/api/projects/${activeId}/settlement`)
        : Promise.resolve({ settlement: null }),
      api<{ handoffs: Handoff[] }>('/api/handoffs'),
    ]).then(([users, settlementResult, handoffResult]) => {
      setDevelopers(users.users.filter((u) => u.role === 'developer'));
      if (settlementResult.settlement) setSettlement(settlementResult.settlement);
      else setSettlement({ agreedAmount: 0, amountReceived: 0, currency: 'INR', paymentStatus: 'unpaid', notes: '' });
      setPendingHandoffs(handoffResult.handoffs.filter((h) => ['submitted', 'needs_clarification'].includes(h.status)).length);
    }).catch((e) => setError(alertText(e)));
  }, [isAdmin, activeId]);
  const active = details?.project;

  useEffect(() => {
    if (active) {
      setTechSpecsDraft({
        githubRepoUrl: active.githubRepoUrl || '',
        liveUrl: active.liveUrl || '',
        databaseEngine: active.databaseEngine || 'PostgreSQL',
        techStack: active.techStack || active.preferredTechnology || '',
        architectureNotes: active.architectureNotes || '',
        developmentMilestone: active.developmentMilestone || 'planning',
      });
      setEvaluation((prev) => ({
        ...prev,
        databaseEngine: active.databaseEngine || 'PostgreSQL',
        githubRepoUrl: active.githubRepoUrl || '',
        liveUrl: active.liveUrl || '',
        techStack: active.techStack || active.preferredTechnology || '',
        suggestedTechnology: active.techStack || active.preferredTechnology || '',
      }));
    }
  }, [active?.id]);

  const saveTechSpecs = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!activeId) return;
    void run(async () => {
      await api(`/api/projects/${activeId}/tech-specs`, {
        method: 'PATCH',
        body: JSON.stringify(techSpecsDraft),
      });
      setEditingTechSpecs(false);
    }, 'Project tech specs and links updated.');
  };

  const updateMilestone = (milestone: string) => {
    if (!activeId) return;
    void run(async () => {
      await api(`/api/projects/${activeId}/tech-specs`, {
        method: 'PATCH',
        body: JSON.stringify({
          githubRepoUrl: active?.githubRepoUrl ?? '',
          liveUrl: active?.liveUrl ?? '',
          databaseEngine: active?.databaseEngine ?? '',
          techStack: active?.techStack ?? '',
          architectureNotes: active?.architectureNotes ?? '',
          developmentMilestone: milestone,
        }),
      });
    }, `Development milestone changed to ${titleCase(milestone)}.`);
  };
  const counts = useMemo(() => ({
    active: projects.filter((p) => !['completed', 'declined'].includes(p.status)).length,
    review: projects.filter((p) => p.status === 'awaiting_admin_review').length,
    awaitingAssignment: projects.filter((p) => p.status === 'awaiting_assignment' || !p.developerId).length,
  }), [projects]);

  const unassignedProjects = useMemo(
    () => projects.filter((p) => p.status === 'awaiting_assignment' || !p.developerId),
    [projects]
  );
  const [quickAssignDev, setQuickAssignDev] = useState<Record<string, string>>({});

  const assignDeveloper = (projectId: string, developerId: string) => {
    if (!developerId) return;
    void run(async () => {
      await api(`/api/projects/${projectId}/assignment`, {
        method: 'PATCH',
        body: JSON.stringify({ developerId }),
      });
      await load();
      if (activeId === projectId) await loadDetail(projectId);
    }, 'Project assigned to Developer successfully.');
  };

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); setSuccess(message); await load(); if (activeId) await loadDetail(activeId); }
    catch (e) { setError(alertText(e)); }
    finally { setBusy(false); }
  };

  const updateStatus = (status: string) => run(() => api(`/api/projects/${activeId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }), `Project marked ${titleCase(status)}.`);
  const submitUpdate = (e: FormEvent) => {
    e.preventDefault();
    if (!updateText.trim()) return;
    void run(async () => {
      await api(`/api/projects/${activeId}/updates`, { method: 'POST', body: JSON.stringify({ body: updateText, progressPercent: progress === '' ? null : Number(progress) }) });
      setUpdateText(''); setProgress('');
    }, 'Project update added.');
  };
  const submitEvaluation = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api(`/api/projects/${activeId}/evaluations`, {
        method: 'POST',
        body: JSON.stringify(evaluation),
      });
      if (evaluation.githubRepoUrl || evaluation.liveUrl || evaluation.databaseEngine || evaluation.techStack) {
        await api(`/api/projects/${activeId}/tech-specs`, {
          method: 'PATCH',
          body: JSON.stringify({
            githubRepoUrl: evaluation.githubRepoUrl || active?.githubRepoUrl || '',
            liveUrl: evaluation.liveUrl || active?.liveUrl || '',
            databaseEngine: evaluation.databaseEngine || active?.databaseEngine || 'PostgreSQL',
            techStack: evaluation.techStack || active?.techStack || '',
            architectureNotes: evaluation.notes || active?.architectureNotes || '',
            developmentMilestone: active?.developmentMilestone || 'planning',
          }),
        });
      }
    }, 'Technical evaluation submitted to Admin for review.');
  };
  const [evalReviewDraft, setEvalReviewDraft] = useState<{ id: string; decision: string; reason: string } | null>(null);
  const confirmEvalReview = () => {
    if (!evalReviewDraft) return;
    void run(
      () =>
        api(`/api/projects/${activeId}/evaluations/${evalReviewDraft.id}/review`, {
          method: 'PATCH',
          body: JSON.stringify({ decision: evalReviewDraft.decision, reason: evalReviewDraft.reason }),
        }),
      `Evaluation ${titleCase(evalReviewDraft.decision)}.`
    );
    setEvalReviewDraft(null);
  };
  const createProject = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await api<{ project: Project }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...create,
          leadId: create.leadId || store.companies[0]?.id || '',
          developerId: create.developerId || developers[0]?.id || '',
        }),
      });
      setCreate((d) => ({ ...d, title: '', description: '', functionalRequirements: '', expectedTimeline: '', dueAt: '' }));
      setActiveId(result.project.id);
    }, 'Project created and assigned.');
  };
  const saveSettlement = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api(`/api/projects/${activeId}/settlement`, { method: 'PUT', body: JSON.stringify(settlement) }), 'Admin settlement saved.');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-bold uppercase tracking-wider text-teal-700">Delivery Lifecycle</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{userRole === 'developer' ? 'Assigned Projects' : 'Projects'}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Track assignments, technical reviews, progress updates, specifications, and project settlements.</p>
      </header>
      {isAdmin ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Total Leads', store.companies.length, 'border-l-sky-500'], ['Pending Handoffs', pendingHandoffs, 'border-l-purple-500'], ['Active Projects', counts.active, 'border-l-teal-500'], ['Awaiting Review', counts.review, 'border-l-amber-500']].map(([label, value, tone]) => (
            <div key={label} className={`rounded-xl border border-slate-200 border-l-4 bg-white px-4 py-3 shadow-xs ${tone}`}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
            </div>
          ))}
        </section>
      ) : null}
      {error ? <p role="alert" className="rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-sm text-rose-700">{error}</p> : null}
      {success ? <p role="status" className="rounded-lg bg-teal-50 border border-teal-200 p-3.5 text-sm text-teal-800">{success}</p> : null}

      {/* Converted Leads Pending Developer Assignment Banner */}
      {isAdmin && unassignedProjects.length > 0 ? (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-sm font-bold text-white shadow-xs">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-amber-950">
                  Pending Developer Distribution ({unassignedProjects.length})
                </h2>
                <p className="text-xs text-amber-800">
                  Leads converted by Callers awaiting distribution to an available developer.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-amber-200/90 px-3 py-1 text-xs font-bold text-amber-950">
              Distribution Required
            </span>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-1 md:grid-cols-2">
            {unassignedProjects.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-amber-200 bg-white p-4 shadow-xs flex flex-col justify-between gap-3 transition hover:shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-[11px] font-bold text-teal-800">
                      {p.clientBusiness || 'Converted Lead'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {dateText(p.createdAt)}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-slate-900">{p.title}</h3>
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-950 font-medium">
                    <strong className="text-amber-950">{p.callerName || 'A caller'}</strong> has converted this project. Assign this project to an available developer.
                  </div>
                  {p.description ? (
                    <p className="mt-2 text-xs text-slate-600 line-clamp-2">{p.description}</p>
                  ) : null}
                </div>

                <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Select developer for ${p.title}`}
                    className={`${inputClass} flex-1 text-xs`}
                    value={quickAssignDev[p.id] ?? ''}
                    onChange={(e) => setQuickAssignDev((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  >
                    <option value="">Choose available Developer…</option>
                    {developers.map((dev) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.name} ({dev.email})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`${btnPrimary} text-xs py-2 whitespace-nowrap`}
                    disabled={!quickAssignDev[p.id] || busy}
                    onClick={() => void assignDeveloper(p.id, quickAssignDev[p.id])}
                  >
                    Assign to Developer →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isAdmin ? (
        <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <summary className="cursor-pointer font-bold text-slate-900 hover:text-teal-700 transition">Create an Admin-managed project</summary>
          <p className="mt-1.5 text-xs text-slate-500">Use this for larger projects managed directly by Admin without an inbound caller handoff.</p>
          <form onSubmit={createProject} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Client lead"><select className={inputClass} value={create.leadId || store.companies[0]?.id || ''} onChange={(e) => setCreate((d) => ({ ...d, leadId: e.target.value }))} required><option value="">Choose a lead</option>{store.companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}</select></Field>
            <Field label="Assign Developer"><select className={inputClass} value={create.developerId || developers[0]?.id || ''} onChange={(e) => setCreate((d) => ({ ...d, developerId: e.target.value }))} required><option value="">Choose Developer</option>{developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Project title"><input className={inputClass} value={create.title} onChange={(e) => setCreate((d) => ({ ...d, title: e.target.value }))} required /></Field>
            <Field label="Project type"><input className={inputClass} value={create.projectType} onChange={(e) => setCreate((d) => ({ ...d, projectType: e.target.value }))} /></Field>
            <Field label="Requirements" className="sm:col-span-2"><textarea className={`${inputClass} min-h-20`} value={create.functionalRequirements} onChange={(e) => setCreate((d) => ({ ...d, functionalRequirements: e.target.value }))} /></Field>
            <Field label="Description" className="sm:col-span-2"><textarea className={`${inputClass} min-h-20`} value={create.description} onChange={(e) => setCreate((d) => ({ ...d, description: e.target.value }))} /></Field>
            <Field label="Technology"><input className={inputClass} value={create.preferredTechnology} onChange={(e) => setCreate((d) => ({ ...d, preferredTechnology: e.target.value }))} /></Field>
            <Field label="Expected timeline"><input className={inputClass} value={create.expectedTimeline} onChange={(e) => setCreate((d) => ({ ...d, expectedTimeline: e.target.value }))} /></Field>
            <div className="sm:col-span-2"><button className={btnPrimary} type="submit" disabled={busy}>Create project</button></div>
          </form>
        </details>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
        <section className="space-y-2.5">
          {loading ? <p className="text-sm text-slate-400">Loading projects…</p> : projects.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No assigned projects yet.</p> : projects.map((p) => (
            <button type="button" key={p.id} onClick={() => setActiveId(p.id)} className={`block w-full rounded-xl border p-4 text-left shadow-2xs transition cursor-pointer ${activeId === p.id ? 'border-teal-600 bg-teal-50/70 ring-2 ring-teal-500/20' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold text-slate-900 leading-snug">{p.title}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{titleCase(p.status)}</span>
              </div>
              <span className="mt-1 block text-xs font-medium text-slate-500">{p.clientBusiness}</span>
              <span className="mt-1 block text-[11px] text-slate-400">{isAdmin ? `Developer: ${p.developerName}` : `Updated ${dateText(p.updatedAt)}`}</span>
            </button>
          ))}
        </section>

        {active ? (
          <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-teal-700">{active.projectType} · {active.clientBusiness}</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">{active.title}</h2>
                <p className="mt-1 text-xs text-slate-500">{active.clientContact} · {active.clientPhone} · {active.clientEmail}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {userRole === 'developer' && active.status === 'assigned' ? (
                  <button
                    className={`${btnPrimary} py-1.5 px-3 text-xs`}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => api(`/api/projects/${active.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'in_evaluation' }) }), 'Project evaluation started.')}
                  >
                    Start Evaluation →
                  </button>
                ) : null}
                {userRole === 'developer' && active.status === 'approved' ? (
                  <button
                    className={`${btnPrimary} py-1.5 px-3 text-xs`}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => api(`/api/projects/${active.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'in_progress' }) }), 'Project development started.')}
                  >
                    Start Development Sprint →
                  </button>
                ) : null}
                {userRole === 'developer' && active.status === 'in_progress' ? (
                  <button
                    className={`${btnPrimary} py-1.5 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white`}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => api(`/api/projects/${active.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }), 'Project marked as completed.')}
                  >
                    Mark as Completed
                  </button>
                ) : null}
                <span className="rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-bold text-teal-800">{titleCase(active.status)}</span>
              </div>
            </header>

            {isAdmin && (active.status === 'awaiting_assignment' || !active.developerId) ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs font-medium text-amber-950 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div>
                  <p className="font-bold text-sm text-amber-950 flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-amber-800 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {active.callerName || 'A caller'} has converted this project.
                  </p>
                  <p className="mt-0.5 text-amber-800">Assign this project to an available developer below to begin technical evaluation.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Assign developer now"
                    className={`${inputClass} text-xs`}
                    value={active.developerId ?? ''}
                    onChange={(e) => void assignDeveloper(active.id, e.target.value)}
                  >
                    <option value="">Select Developer…</option>
                    {developers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.email})</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {/* Client Scope & Requirements Overview */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Client Requirement Scope & Outcomes
                </span>
                <span className="text-xs text-slate-500">
                  Timeline: <strong className="text-slate-800">{active.expectedTimeline || 'Not specified'}</strong>
                  {active.dueAt ? ` · Due: ${dateText(active.dueAt)}` : ''}
                </span>
              </div>
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Functional Deliverables</p>
                  <p className="text-slate-800 whitespace-pre-wrap rounded-lg bg-white p-2.5 border border-slate-200/70">
                    {active.functionalRequirements || 'Functional specifications detailed in client handoff.'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Project Description & Scope</p>
                  <p className="text-slate-800 whitespace-pre-wrap rounded-lg bg-white p-2.5 border border-slate-200/70">
                    {active.description || 'Deliverables and scope agreed with the client.'}
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-teal-50/80 border border-teal-200/80 px-3 py-2 text-xs text-teal-900 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-teal-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span>
                    <strong>Requirement & Quotation Brief:</strong> The original outcomes and deliverables document uploaded by the caller is available in the <strong>Attachments & Documents</strong> section below.
                  </span>
                </p>
              </div>
            </div>

            {/* Technical Specifications & Repository Links Hub */}
            <section className="rounded-xl border-2 border-teal-500/30 bg-gradient-to-br from-slate-50 via-white to-teal-50/20 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white font-bold text-base shadow-2xs">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Technical Development Hub</h3>
                    <p className="text-xs text-slate-500">GitHub repositories, live deployments, active database, and technical stack.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTechSpecs((v) => !v)}
                  className="rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 shadow-2xs hover:bg-teal-50 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>{editingTechSpecs ? '✕ Close Editor' : 'Edit Tech Specs & Links'}</span>
                </button>
              </div>

              {editingTechSpecs ? (
                <form onSubmit={saveTechSpecs} className="space-y-4 rounded-xl border border-teal-200 bg-white p-4.5 shadow-2xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-teal-800">Update Project Tech Stack & Links</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="GitHub Project Repository Link">
                      <input
                        className={inputClass}
                        value={techSpecsDraft.githubRepoUrl}
                        onChange={(e) => setTechSpecsDraft((d) => ({ ...d, githubRepoUrl: e.target.value }))}
                        placeholder="https://github.com/organization/repo-name"
                      />
                    </Field>
                    <Field label="Live Application / Staging Link">
                      <input
                        className={inputClass}
                        value={techSpecsDraft.liveUrl}
                        onChange={(e) => setTechSpecsDraft((d) => ({ ...d, liveUrl: e.target.value }))}
                        placeholder="https://staging.project.com"
                      />
                    </Field>
                    <Field label="Database Engine">
                      <div className="space-y-2">
                        <select
                          className={inputClass}
                          value={techSpecsDraft.databaseEngine}
                          onChange={(e) => setTechSpecsDraft((d) => ({ ...d, databaseEngine: e.target.value }))}
                        >
                          {COMMON_DATABASES.map((db) => (
                            <option key={db} value={db}>{db}</option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-1.5">
                          {COMMON_DATABASES.map((db) => (
                            <button
                              key={db}
                              type="button"
                              onClick={() => setTechSpecsDraft((d) => ({ ...d, databaseEngine: db }))}
                              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                                techSpecsDraft.databaseEngine === db
                                  ? 'bg-teal-600 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {db}
                            </button>
                          ))}
                        </div>
                      </div>
                    </Field>
                    <Field label="Development Milestone">
                      <select
                        className={inputClass}
                        value={techSpecsDraft.developmentMilestone}
                        onChange={(e) => setTechSpecsDraft((d) => ({ ...d, developmentMilestone: e.target.value }))}
                      >
                        {MILESTONES.map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="sm:col-span-2 space-y-2">
                      <p className="text-xs font-bold text-slate-700">Tech Stack & Frameworks</p>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_TECH_STACK.map((tech) => {
                          const current = techSpecsDraft.techStack.split(',').map((s) => s.trim()).filter(Boolean);
                          const active = current.includes(tech);
                          return (
                            <button
                              key={tech}
                              type="button"
                              onClick={() => {
                                const next = active
                                  ? current.filter((t) => t !== tech)
                                  : [...current, tech];
                                setTechSpecsDraft((d) => ({ ...d, techStack: next.join(', ') }));
                              }}
                              className={`rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                                active
                                  ? 'bg-teal-600 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {active ? `✓ ${tech}` : `+ ${tech}`}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        className={inputClass}
                        value={techSpecsDraft.techStack}
                        onChange={(e) => setTechSpecsDraft((d) => ({ ...d, techStack: e.target.value }))}
                        placeholder="e.g. React, Next.js, Node.js, Express, Docker"
                      />
                    </div>
                    <Field label="Architecture & Technical Notes" className="sm:col-span-2">
                      <textarea
                        className={`${inputClass} min-h-16`}
                        value={techSpecsDraft.architectureNotes}
                        onChange={(e) => setTechSpecsDraft((d) => ({ ...d, architectureNotes: e.target.value }))}
                        placeholder="Database relations, microservices, auth flow, deployment environment…"
                      />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy} className={btnPrimary}>
                      Save Technical Specs
                    </button>
                    <button type="button" onClick={() => setEditingTechSpecs(false)} className={btnGhost}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Two Key Links: GitHub & Live App */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">GitHub Project Repository</span>
                        {active.githubRepoUrl ? (
                          <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.2 text-[10px] font-bold">Connected</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-0.2 text-[10px] font-bold">Not Set</span>
                        )}
                      </div>
                      {active.githubRepoUrl ? (
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-mono font-medium text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 flex-1">
                            {active.githubRepoUrl}
                          </p>
                          <a
                            href={active.githubRepoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 transition flex items-center gap-1.5"
                          >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                            </svg>
                            <span>Open Repo ↗</span>
                          </a>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-400 italic">No GitHub repo linked yet.</p>
                          <button
                            type="button"
                            onClick={() => setEditingTechSpecs(true)}
                            className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                          >
                            + Add GitHub Link
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Live Application / Staging</span>
                        {active.liveUrl ? (
                          <span className="rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.2 text-[10px] font-bold">Live</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-0.2 text-[10px] font-bold">Not Deployed</span>
                        )}
                      </div>
                      {active.liveUrl ? (
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-mono font-medium text-emerald-800 bg-emerald-50/50 px-2.5 py-1.5 rounded-lg border border-emerald-200 flex-1">
                            {active.liveUrl}
                          </p>
                          <a
                            href={active.liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-teal-700 transition flex items-center gap-1.5"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            <span>Visit App ↗</span>
                          </a>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-400 italic">No live / staging URL linked yet.</p>
                          <button
                            type="button"
                            onClick={() => setEditingTechSpecs(true)}
                            className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                          >
                            + Add Live URL
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Database & Tech Stack Pill Display */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">Database Engine:</span>
                        <span className="rounded-md border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-mono font-bold text-purple-900">
                          {active.databaseEngine || 'PostgreSQL'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-700">Development Technologies:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(active.techStack || active.preferredTechnology || 'Full Stack Web')
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean)
                          .map((tech) => (
                            <span key={tech} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {tech}
                            </span>
                          ))}
                      </div>
                    </div>
                    {active.architectureNotes ? (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Architecture Notes:</p>
                        <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                          {active.architectureNotes}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* Development Milestones Stepper */}
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Development Lifecycle Progress</p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {MILESTONES.map((m, idx) => {
                        const isCurrent = (active.developmentMilestone || 'planning') === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => void updateMilestone(m.id)}
                            className={`rounded-lg p-2.5 text-left border transition cursor-pointer ${
                              isCurrent
                                ? 'border-teal-600 bg-teal-50/90 text-teal-950 font-bold shadow-xs ring-1 ring-teal-500'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                              0{idx + 1}
                            </span>
                            <p className="mt-1 text-[11px] font-bold leading-tight">{m.label}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {isAdmin ? (
              <div className="grid gap-3 border-t border-[var(--color-line)] pt-4 sm:grid-cols-2">
                <Field label="Project status"><select aria-label="Project status" className={inputClass} value={active.status} onChange={(e) => void updateStatus(e.target.value)} disabled={busy}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
                <Field label="Assigned Developer"><select aria-label="Assigned Developer" className={inputClass} value={active.developerId ?? ''} disabled={busy} onChange={(e) => void run(() => api(`/api/projects/${active.id}/assignment`, { method: 'PATCH', body: JSON.stringify({ developerId: e.target.value }) }), 'Developer assignment updated.')}><option value="">Choose Developer</option>{developers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
              </div>
            ) : null}

            {userRole === 'developer' && ['assigned', 'in_evaluation', 'clarification_required'].includes(active.status) ? (
              <form onSubmit={submitEvaluation} className="rounded-2xl border-2 border-teal-500/30 bg-gradient-to-br from-white via-teal-50/10 to-slate-50/50 p-6 shadow-sm space-y-5">
                <div className="border-b border-slate-200/80 pb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <svg className="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Developer Technical Feasibility & Evaluation
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Assess technical feasibility, select stack & database, and submit your evaluation to Admin for review.
                    </p>
                  </div>
                  <span className="rounded-full bg-teal-100 text-teal-800 px-3 py-1 font-mono text-[11px] font-bold">
                    Phase: Evaluation
                  </span>
                </div>

                {/* Feasibility Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Technical Feasibility</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { id: 'feasible', label: 'Feasible', note: 'Project scope & architecture ready to develop', dot: 'bg-emerald-500', color: 'border-emerald-300 bg-emerald-50/80 text-emerald-950' },
                      { id: 'needs_clarification', label: 'Need Clarification', note: 'Scope, APIs, or credentials require confirmation', dot: 'bg-amber-500', color: 'border-amber-300 bg-amber-50/80 text-amber-950' },
                      { id: 'not_feasible', label: 'Not Feasible', note: 'Technical limitations or incompatible stack', dot: 'bg-rose-500', color: 'border-rose-300 bg-rose-50/80 text-rose-950' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEvaluation((v) => ({ ...v, feasibility: opt.id }))}
                        className={`rounded-xl border-2 p-3.5 text-left transition cursor-pointer ${
                          evaluation.feasibility === opt.id
                            ? `${opt.color} ring-2 ring-teal-500/20 font-bold shadow-xs`
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm">{opt.label}</span>
                          <span className={`h-2.5 w-2.5 rounded-full ${opt.dot}`} />
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{opt.note}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Database Engine Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Database Engine</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {COMMON_DATABASES.map((db) => (
                        <button
                          key={db}
                          type="button"
                          onClick={() => setEvaluation((v) => ({ ...v, databaseEngine: db }))}
                          className={`rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                            evaluation.databaseEngine === db
                              ? 'bg-purple-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {db}
                        </button>
                      ))}
                    </div>
                    <input
                      className={inputClass}
                      value={evaluation.databaseEngine}
                      onChange={(e) => setEvaluation((v) => ({ ...v, databaseEngine: e.target.value }))}
                      placeholder="e.g. PostgreSQL, MongoDB, Supabase"
                    />
                  </div>

                  {/* Estimated Effort Presets */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Estimated Effort / Timeline</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {EFFORT_PRESETS.map((eff) => (
                        <button
                          key={eff}
                          type="button"
                          onClick={() => setEvaluation((v) => ({ ...v, estimatedEffort: eff }))}
                          className={`rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                            evaluation.estimatedEffort === eff
                              ? 'bg-teal-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {eff}
                        </button>
                      ))}
                    </div>
                    <input
                      className={inputClass}
                      value={evaluation.estimatedEffort}
                      onChange={(e) => setEvaluation((v) => ({ ...v, estimatedEffort: e.target.value }))}
                      placeholder="e.g. 2–4 weeks"
                    />
                  </div>

                  {/* Tech Stack Chips Selector */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Select Technologies & Frameworks</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {COMMON_TECH_STACK.map((tech) => {
                        const current = evaluation.techStack.split(',').map((s) => s.trim()).filter(Boolean);
                        const isSelected = current.includes(tech);
                        return (
                          <button
                            key={tech}
                            type="button"
                            onClick={() => {
                              const next = isSelected
                                ? current.filter((t) => t !== tech)
                                : [...current, tech];
                              setEvaluation((v) => ({
                                ...v,
                                techStack: next.join(', '),
                                suggestedTechnology: next.join(', '),
                              }));
                            }}
                            className={`rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                              isSelected
                                ? 'bg-teal-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {isSelected ? `✓ ${tech}` : `+ ${tech}`}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      className={inputClass}
                      value={evaluation.techStack}
                      onChange={(e) => setEvaluation((v) => ({ ...v, techStack: e.target.value, suggestedTechnology: e.target.value }))}
                      placeholder="e.g. React, Next.js, Node.js, Express, Docker"
                    />
                  </div>

                  {/* GitHub Repo & Live URLs */}
                  <Field label="GitHub Project Repository Link (optional)">
                    <input
                      className={inputClass}
                      value={evaluation.githubRepoUrl}
                      onChange={(e) => setEvaluation((v) => ({ ...v, githubRepoUrl: e.target.value }))}
                      placeholder="https://github.com/organization/repo-name"
                    />
                  </Field>
                  <Field label="Live / Staging Preview URL (optional)">
                    <input
                      className={inputClass}
                      value={evaluation.liveUrl}
                      onChange={(e) => setEvaluation((v) => ({ ...v, liveUrl: e.target.value }))}
                      placeholder="https://staging.project.com"
                    />
                  </Field>

                  {/* Additional Technical Requirements */}
                  <Field label="Technical Architecture Requirements" className="sm:col-span-2">
                    <input
                      className={inputClass}
                      value={evaluation.technicalRequirements}
                      onChange={(e) => setEvaluation((v) => ({ ...v, technicalRequirements: e.target.value }))}
                      placeholder="e.g. PostgreSQL migrations, JWT auth with RBAC, Stripe integration"
                    />
                  </Field>

                  {/* Questions for Client/Admin */}
                  <Field label="Clarification Questions (optional)" className="sm:col-span-2">
                    <textarea
                      className={`${inputClass} min-h-16`}
                      value={evaluation.clarificationQuestions}
                      onChange={(e) => setEvaluation((v) => ({ ...v, clarificationQuestions: e.target.value }))}
                      placeholder="Any ambiguities in client scope or API credentials needed…"
                    />
                  </Field>

                  {/* Developer Technical Notes */}
                  <Field label="Developer Notes & Evaluation Summary" className="sm:col-span-2">
                    <textarea
                      className={`${inputClass} min-h-16`}
                      value={evaluation.notes}
                      onChange={(e) => setEvaluation((v) => ({ ...v, notes: e.target.value }))}
                      placeholder="Architecture recommendations, potential performance considerations, milestone breakdown…"
                    />
                  </Field>
                </div>

                <div className="pt-2">
                  <button className={`${btnPrimary} py-2.5 px-6 font-bold`} disabled={busy} type="submit">
                    {busy ? 'Submitting…' : 'Submit Technical Evaluation to Admin →'}
                  </button>
                </div>
              </form>
            ) : null}

            {details?.evaluations.length ? (
              <section className="space-y-3 border-t border-[var(--color-line)] pt-4">
                <h3 className="font-semibold text-stone-800">Technical reviews</h3>
                {details.evaluations.map((ev) => (
                  <article key={ev.id} className="rounded border border-[var(--color-line)] p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <b>{ev.developerName}: {titleCase(ev.feasibility)}</b>
                      <span className="text-xs text-stone-500">{titleCase(ev.reviewStatus)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-700">
                      <strong>Effort:</strong> {ev.estimatedEffort || '—'} · <strong>Database:</strong> {ev.databaseEngine || 'PostgreSQL'} · <strong>Tech:</strong> {ev.techStack || ev.suggestedTechnology || '—'}
                    </p>
                    {ev.githubRepoUrl ? (
                      <p className="mt-1 text-xs">
                        <strong>Repository:</strong>{' '}
                        <a href={ev.githubRepoUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-teal-700 hover:underline">
                          {ev.githubRepoUrl} ↗
                        </a>
                      </p>
                    ) : null}
                    {ev.liveUrl ? (
                      <p className="mt-1 text-xs">
                        <strong>Live Demo:</strong>{' '}
                        <a href={ev.liveUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-emerald-700 hover:underline">
                          {ev.liveUrl} ↗
                        </a>
                      </p>
                    ) : null}
                    {ev.technicalRequirements ? <p className="mt-1">Requirements: {ev.technicalRequirements}</p> : null}
                    {ev.clarificationQuestions ? <p className="mt-1">Questions: {ev.clarificationQuestions}</p> : null}
                    {ev.notes ? <p className="mt-1">Notes: {ev.notes}</p> : null}
                    {isAdmin && ev.reviewStatus === 'pending' ? (
                      <div className="mt-3 border-t border-[var(--color-line)] pt-3">
                        {evalReviewDraft?.id === ev.id ? (
                          <div className="space-y-2 rounded bg-stone-50 p-3">
                            <p className="font-medium text-stone-800">Review evaluation: {titleCase(evalReviewDraft.decision)}</p>
                            <input
                              className={inputClass}
                              value={evalReviewDraft.reason}
                              onChange={(e) => setEvalReviewDraft({ ...evalReviewDraft, reason: e.target.value })}
                              placeholder={evalReviewDraft.decision === 'approved' ? 'Optional review note…' : 'Reason or guidance for developer (required)…'}
                            />
                            <div className="flex gap-2">
                              <button
                                className={btnPrimary}
                                type="button"
                                disabled={busy || (evalReviewDraft.decision !== 'approved' && !evalReviewDraft.reason.trim())}
                                onClick={confirmEvalReview}
                              >
                                Confirm {titleCase(evalReviewDraft.decision)}
                              </button>
                              <button className={btnGhost} type="button" onClick={() => setEvalReviewDraft(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              className={btnPrimary}
                              type="button"
                              onClick={() => setEvalReviewDraft({ id: ev.id, decision: 'approved', reason: '' })}
                            >
                              Approve evaluation
                            </button>
                            <button
                              className={btnGhost}
                              type="button"
                              onClick={() => setEvalReviewDraft({ id: ev.id, decision: 'needs_clarification', reason: '' })}
                            >
                              Request clarification
                            </button>
                            <button
                              className={btnGhost}
                              type="button"
                              onClick={() => setEvalReviewDraft({ id: ev.id, decision: 'rejected', reason: '' })}
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    ) : ev.reviewReason ? (
                      <p className="mt-2 text-amber-800">Admin note: {ev.reviewReason}</p>
                    ) : null}
                  </article>
                ))}
              </section>
            ) : null}

            <DocumentPanel parent={{ projectId: active.id }} userRole={userRole} />

            {isAdmin ? (
              <form onSubmit={saveSettlement} className="grid gap-4 rounded-2xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/70 via-amber-50/30 to-white p-6 shadow-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white font-bold text-sm shadow-xs">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900">Founder Final Settlement</h3>
                        <p className="text-xs text-slate-500">Strictly private to Admin/Founder. Never visible to Developers or Callers.</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold shadow-2xs ${
                      settlement.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                      settlement.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                      'bg-slate-200 text-slate-700 border border-slate-300'
                    }`}>
                      Payment: {titleCase(settlement.paymentStatus)}
                    </span>
                  </div>
                  {settlement.agreedAmount > 0 ? (
                    <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-amber-200/90 bg-white p-4 text-center shadow-xs">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Agreed Budget</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{settlement.currency} {settlement.agreedAmount.toLocaleString()}</p>
                      </div>
                      <div className="border-x border-slate-100 px-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Advance Received</p>
                        <p className="mt-1 text-lg font-black text-emerald-600">{settlement.currency} {settlement.amountReceived.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Outstanding Balance</p>
                        <p className="mt-1 text-lg font-black text-rose-600">{settlement.currency} {Math.max(0, settlement.agreedAmount - settlement.amountReceived).toLocaleString()}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
                <Field label="Agreed amount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={settlement.agreedAmount === 0 ? '' : settlement.agreedAmount}
                    placeholder="0.00"
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                      setSettlement((s) => ({
                        ...s,
                        agreedAmount: val,
                        paymentStatus: s.amountReceived >= val && val > 0 ? 'paid' : s.amountReceived > 0 ? 'partial' : 'unpaid',
                      }));
                    }}
                  />
                </Field>
                <Field label="Amount received">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={settlement.amountReceived === 0 ? '' : settlement.amountReceived}
                    placeholder="0.00"
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                      setSettlement((s) => ({
                        ...s,
                        amountReceived: val,
                        paymentStatus: val >= s.agreedAmount && s.agreedAmount > 0 ? 'paid' : val > 0 ? 'partial' : 'unpaid',
                      }));
                    }}
                  />
                </Field>
                <Field label="Currency">
                  <input
                    className={inputClass}
                    maxLength={3}
                    value={settlement.currency}
                    onChange={(e) => setSettlement((s) => ({ ...s, currency: e.target.value.toUpperCase() }))}
                  />
                </Field>
                <Field label="Payment status">
                  <select
                    className={inputClass}
                    value={settlement.paymentStatus}
                    onChange={(e) => setSettlement((s) => ({ ...s, paymentStatus: e.target.value as Settlement['paymentStatus'] }))}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                  </select>
                </Field>
                <Field label="Admin notes" className="sm:col-span-2">
                  <textarea
                    className={`${inputClass} min-h-16`}
                    value={settlement.notes}
                    onChange={(e) => setSettlement((s) => ({ ...s, notes: e.target.value }))}
                    placeholder="Milestone details, payment reference, bank invoice number…"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <button className={`${btnPrimary} bg-amber-600 hover:bg-amber-700 text-white`} type="submit" disabled={busy}>Save Settlement Records</button>
                </div>
              </form>
            ) : null}

            <form onSubmit={submitUpdate} className="grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-[1fr_10rem_auto]">
              <Field label="Project Update Note"><input className={inputClass} value={updateText} onChange={(e) => setUpdateText(e.target.value)} placeholder="Milestone reached, blocker, client feedback…" required /></Field>
              <Field label="Progress %"><input type="number" min="0" max="100" className={inputClass} value={progress} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setProgress(e.target.value)} placeholder="0 - 100" /></Field>
              <div className="flex items-end"><button className={btnPrimary} type="submit" disabled={busy || !updateText.trim()}>Post Update</button></div>
            </form>
            <section className="border-t border-slate-200 pt-5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <svg className="h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Project Timeline & Progress Updates
              </h3>
              {details?.updates.length ? (
                <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4 ml-2">
                  {details.updates.map((u) => (
                    <li key={u.id} className="relative text-xs">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-600 shadow-2xs" />
                      <p className="font-bold text-slate-900">
                        {u.authorName}{' '}
                        <span className="font-normal text-slate-400">· {dateText(u.createdAt)}</span>
                        {u.progressPercent != null ? (
                          <span className="ml-2 rounded-md bg-teal-50 border border-teal-200 px-1.5 py-0.2 font-bold text-teal-800">
                            {u.progressPercent}% Completed
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{u.body}</p>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-2 text-xs text-slate-400">No project updates posted yet.</p>}
            </section>
          </section>
        ) : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-medium text-slate-400 shadow-2xs">{loading ? 'Loading project details…' : 'Select a project from the left to view specifications and lifecycle history.'}</section>}
      </div>
    </div>
  );
}
