import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Company, Contact, DiscoveryQuestion } from '../types';
import { INDUSTRIES, INTENTS } from '../types';
import { DEFAULT_STAGES } from '../defaults';
import type { CrmStore } from '../hooks/useCrmStore';
import { Field, inputClass, btnPrimary, btnGhost } from './ui';
import {
  activityDetailLines,
  eventTypeLabel,
  fetchCompanyHistory,
  type CompanyHistoryEvent,
} from '../lib/activity';
import { normalizeOptionalUrl } from '../lib/urls';
import { CompanyContacts } from './CompanyContacts';
import { DocumentPanel } from './Projects';
import { SubmitHandoffModal } from './SubmitHandoffModal';

/** "Opened company/contact" view events are kept for SDR metrics but hidden here by default. */
const VIEW_EVENT_TYPES = new Set(['company.opened', 'contact.opened']);

interface CompanyFormProps {
  store: CrmStore;
  stages?: string[];
  discoveryQuestions?: DiscoveryQuestion[];
  initial?: Company | null;
  onDone: () => void;
  /** Opens one of this company's contacts (full contact form + call log). */
  onOpenContact?: (contact: Contact) => void;
}

function formatEventTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function groupQuestions(questions: DiscoveryQuestion[]) {
  const sections: Array<{ section: string; items: DiscoveryQuestion[] }> = [];
  const index = new Map<string, number>();
  for (const q of questions) {
    const existing = index.get(q.section);
    if (existing == null) {
      index.set(q.section, sections.length);
      sections.push({ section: q.section, items: [q] });
    } else {
      sections[existing]!.items.push(q);
    }
  }
  return sections;
}

export function CompanyForm({
  store,
  stages = [...DEFAULT_STAGES],
  discoveryQuestions = [],
  initial,
  onDone,
  onOpenContact,
}: CompanyFormProps) {
  const [clientContactName, setClientContactName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  const [form, setForm] = useState({
    companyName: initial?.companyName ?? '',
    stage: initial?.stage ?? stages[0] ?? 'Lead Added',
    industry: initial?.industry ?? '',
    location: initial?.location ?? '',
    estimatedCallVolume: initial?.estimatedCallVolume?.toString() ?? '',
    employeeCount: initial?.employeeCount?.toString() ?? '',
    intent: initial?.intent ?? '',
    offeredPrice: initial?.offeredPrice?.toString() ?? '',
    primaryContactId: initial?.primaryContactId ?? '',
    lastContacted: initial?.lastContacted ?? '',
    nextFollowUp: initial?.nextFollowUp ?? '',
    notes: initial?.notes ?? '',
    sourceLink: initial?.sourceLink ?? '',
    companyWebsite: initial?.companyWebsite ?? '',
    linkedInCompany: initial?.linkedInCompany ?? '',
  });
  const [discoveryAnswers, setDiscoveryAnswers] = useState<Record<string, string>>(() => ({
    ...(initial?.discoveryAnswers ?? {}),
  }));

  const [history, setHistory] = useState<CompanyHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showViews, setShowViews] = useState(false);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const hiddenViews = history.filter((ev) => VIEW_EVENT_TYPES.has(ev.eventType)).length;
  const visibleHistory = showViews
    ? history
    : history.filter((ev) => !VIEW_EVENT_TYPES.has(ev.eventType));
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  const discoverySections = useMemo(() => groupQuestions(discoveryQuestions), [discoveryQuestions]);

  useEffect(() => {
    if (!initial?.id) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    void fetchCompanyHistory(initial.id)
      .then((data) => {
        if (cancelled) return;
        setHistory(data.events);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHistoryError(err instanceof Error ? err.message : 'Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initial?.id]);

  useEffect(() => {
    if (!history.length) return;
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [history]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const setAnswer = (id: string, value: string) =>
    setDiscoveryAnswers((prev) => ({ ...prev, [id]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) return;

    const payload = {
      companyName: form.companyName.trim(),
      stage: form.stage,
      industry: form.industry as Company['industry'],
      location: form.location,
      estimatedCallVolume: form.estimatedCallVolume ? Number(form.estimatedCallVolume) : null,
      employeeCount: form.employeeCount ? Number(form.employeeCount) : null,
      intent: form.intent as Company['intent'],
      offeredPrice: form.offeredPrice ? Number(form.offeredPrice) : null,
      primaryContactId: form.primaryContactId || null,
      lastContacted: form.lastContacted || null,
      nextFollowUp: form.nextFollowUp || null,
      notes: form.notes,
      sourceLink: form.sourceLink.trim(),
      companyWebsite: normalizeOptionalUrl(form.companyWebsite),
      linkedInCompany: normalizeOptionalUrl(form.linkedInCompany),
      discoveryAnswers,
    };

    if (initial) {
      await store.updateCompany(initial.id, payload);
    } else {
      const lead = await store.addCompany(payload);
      if (clientContactName.trim() || clientPhone.trim() || clientEmail.trim()) {
        await store.addContact({
          contactName: clientContactName.trim() || form.companyName.trim(),
          phone: clientPhone.trim(),
          email: clientEmail.trim(),
          companyId: lead.id,
          champion: true,
        });
      }
    }
    onDone();
  };

  const assignedToDisplay = initial
    ? initial.assignedTo || 'Unassigned'
    : 'Will be assigned to you';

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Modal Top Card / Overview */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
              {initial ? 'Lead Record' : 'New Inbound Lead Intake'}
            </span>
            <h2 className="text-xl font-extrabold text-slate-900">
              {form.companyName || 'Untitled Client Lead'}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
              {form.stage}
            </span>
            {form.intent ? (
              <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                Intent: {form.intent}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Section 1: Lead Information */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="border-b border-slate-100 pb-2.5">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>📋</span> Lead & Business Details
          </h3>
          <p className="text-xs text-slate-500">
            Core client profile and caller assignment.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client or Business Name *" className="sm:col-span-2">
            <input
              className={inputClass}
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              required
              placeholder="e.g. Horizon Bank"
            />
          </Field>

          <Field label="Lead Stage">
            <select
              className={inputClass}
              value={form.stage}
              onChange={(e) => set('stage', e.target.value)}
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Intent">
            <select
              className={inputClass}
              value={form.intent}
              onChange={(e) => set('intent', e.target.value)}
            >
              <option value="">—</option>
              {INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Business Type">
            <select
              className={inputClass}
              value={form.industry}
              onChange={(e) => set('industry', e.target.value)}
            >
              <option value="">—</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Location">
            <input
              className={inputClass}
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="City / Region"
            />
          </Field>

          <Field label="Assigned Caller">
            <input
              className={`${inputClass} bg-slate-100 text-slate-500 cursor-not-allowed`}
              value={assignedToDisplay}
              readOnly
              disabled
            />
          </Field>

          <Field label="Next Follow-up">
            <input
              type="date"
              className={inputClass}
              value={form.nextFollowUp}
              onChange={(e) => set('nextFollowUp', e.target.value)}
            />
          </Field>

          <Field label="Lead Source (Ad / Channel)" className="sm:col-span-2">
            <input
              type="text"
              className={inputClass}
              value={form.sourceLink}
              onChange={(e) => set('sourceLink', e.target.value)}
              placeholder="e.g. Instagram ad, Facebook ad, Google search, referral"
            />
          </Field>

          {!initial ? (
            <>
              <Field label="Primary Contact Name">
                <input
                  className={inputClass}
                  value={clientContactName}
                  onChange={(e) => setClientContactName(e.target.value)}
                  placeholder="Full name"
                />
              </Field>
              <Field label="Phone Number">
                <input
                  type="tel"
                  className={inputClass}
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+91 …"
                />
              </Field>
              <Field label="Email Address" className="sm:col-span-2">
                <input
                  type="email"
                  className={inputClass}
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="contact@business.com"
                />
              </Field>
            </>
          ) : null}

          <Field label="Initial Requirements & Notes" className="sm:col-span-2">
            <textarea
              className={`${inputClass} min-h-[85px] resize-y`}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="What does the client want to build? Budget expectations, tech needs, call notes…"
            />
          </Field>
        </div>
      </div>

      {/* Section 2: Discovery Questions (if present) */}
      {discoverySections.length > 0 ? (
        <section
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4"
          aria-label="Discovery questions"
        >
          <div className="border-b border-slate-100 pb-2.5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>❓</span> Discovery & Handoff Questions
            </h3>
            <p className="text-xs text-slate-500">
              Client requirements and scope details for developer handoff.
            </p>
          </div>
          {discoverySections.map(({ section, items }) => (
            <div key={section} className="space-y-3">
              <h4 className="text-xs font-bold tracking-wider text-teal-800 uppercase">
                {section}
              </h4>
              <div className="grid gap-3">
                {items.map((q) => (
                  <Field key={q.id} label={q.prompt}>
                    {q.input === 'textarea' ? (
                      <textarea
                        className={`${inputClass} min-h-[72px] resize-y`}
                        value={discoveryAnswers[q.id] ?? ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      />
                    ) : (
                      <input
                        type={q.input === 'number' ? 'number' : 'text'}
                        className={inputClass}
                        value={discoveryAnswers[q.id] ?? ''}
                        onWheel={(e) => {
                          if (q.input === 'number') e.currentTarget.blur();
                        }}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Section 3: Client Contacts */}
      {initial ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <CompanyContacts store={store} companyId={initial.id} onOpenContact={onOpenContact} />
        </div>
      ) : null}

      {/* Section 4: Quotation & Commercial Documents */}
      {initial ? (
        <section
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3"
          aria-label="Quotations and documents"
        >
          <div className="border-b border-slate-100 pb-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>📄</span> Quotation & Supporting Documents
              </h3>
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                🔒 Strictly Confidential
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Upload the quotation document shared with the client or references. Quotations are strictly private to Admin and Caller and never visible to Developers.
            </p>
          </div>

          {(form.stage === 'Qualified' || form.stage === 'Handoff Submitted' || initial.stage === 'Qualified' || initial.stage === 'Handoff Submitted') ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                  <span>📄</span> Client Quotation & Scope Package
                </p>
                <p className="text-[11px] text-teal-800 mt-0.5">
                  Summarize client requirements, specify what will be developed, and attach the quotation shared with the client.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-teal-800 cursor-pointer"
                onClick={() => setShowHandoffModal(true)}
              >
                📄 Submit Quotation & Scope →
              </button>
            </div>
          ) : null}

          <div className="pt-2">
            <DocumentPanel parent={{ leadId: initial.id }} userRole="sdr" />
          </div>
        </section>
      ) : null}

      {/* Section 5: Progress History */}
      {initial ? (
        <section
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3"
          aria-label="Lead progress history"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>⏱️</span> Activity & Call History
              </h3>
              <p className="text-xs text-slate-500">
                Chronological timeline of calls, status transitions, and touchpoints.
              </p>
            </div>
            {hiddenViews > 0 || showViews ? (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                <input
                  type="checkbox"
                  data-testid="history-show-views"
                  checked={showViews}
                  onChange={(e) => setShowViews(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                />
                Show views ({hiddenViews})
              </label>
            ) : null}
          </div>

          {historyLoading ? (
            <p className="text-sm text-slate-500">Loading history…</p>
          ) : historyError ? (
            <p className="text-sm text-rose-600">{historyError}</p>
          ) : visibleHistory.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
              No activity logged yet.
            </p>
          ) : (
            <ol className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 kanban-scroll">
              {visibleHistory.map((ev) => {
                const details = activityDetailLines(ev);
                return (
                  <li key={ev.id} className="rounded-lg border border-slate-200/80 bg-white p-2.5 text-xs text-slate-700 shadow-2xs">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <time
                        className="shrink-0 font-mono text-[11px] font-medium text-slate-500"
                        dateTime={ev.createdAt}
                      >
                        {formatEventTime(ev.createdAt)}
                      </time>
                      <span className="font-bold text-slate-900">
                        {eventTypeLabel(ev.eventType)}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">by {ev.userName}</span>
                      {ev.contactName ? (
                        <span className="text-[11px] font-bold text-teal-800">· {ev.contactName}</span>
                      ) : null}
                    </div>
                    {details.length > 0 ? (
                      <div className="mt-1 space-y-0.5 text-[11px] text-slate-600 border-t border-slate-100 pt-1">
                        {details.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
              <div ref={historyEndRef} />
            </ol>
          )}
        </section>
      ) : null}

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
        {initial && store.canDelete ? (
          <button
            type="button"
            className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
            onClick={async () => {
              if (confirm(`Delete ${initial.companyName}?`)) {
                await store.deleteCompany(initial.id);
                onDone();
              }
            }}
          >
            Delete lead
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary}>
            {initial ? 'Save Changes' : 'Create Inbound Lead'}
          </button>
        </div>
      </div>

      {initial ? (
        <SubmitHandoffModal
          company={initial}
          open={showHandoffModal}
          onClose={() => setShowHandoffModal(false)}
          onSuccess={() => {
            void store.refresh();
            onDone();
          }}
        />
      ) : null}
    </form>
  );
}
