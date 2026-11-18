import { useState, type FormEvent } from 'react';
import type { Contact, Stage } from '../types';
import { DEFAULT_CONTACT_STATUSES, DEFAULT_STAGES } from '../defaults';
import type { CrmStore } from '../hooks/useCrmStore';
import { normalizeOptionalUrl } from '../lib/urls';
import { Field, inputClass, btnPrimary, btnGhost } from './ui';
import { ConversationPanel } from './ConversationPanel';
import { ContactCallLog } from './ContactCallLog';
import { needsWhatsApp } from '../lib/progress';

interface ContactFormProps {
  store: CrmStore;
  contactStatuses?: string[];
  stages?: string[];
  initial?: Contact | null;
  defaultCompanyId?: string | null;
  onDone: () => void;
}

export function ContactForm({
  store,
  contactStatuses = [...DEFAULT_CONTACT_STATUSES],
  stages = [...DEFAULT_STAGES],
  initial,
  defaultCompanyId,
  onDone,
}: ContactFormProps) {
  const [form, setForm] = useState({
    contactName: initial?.contactName ?? '',
    companyId: initial?.companyId ?? defaultCompanyId ?? '',
    role: initial?.role ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    linkedInProfile: initial?.linkedInProfile ?? '',
    contactStatus: initial?.contactStatus ?? contactStatuses[0] ?? 'Not Contacted',
    champion: initial?.champion ?? false,
    lastContacted: initial?.lastContacted ?? '',
    nextFollowUp: initial?.nextFollowUp ?? '',
    notes: initial?.notes ?? '',
    whatsappSent: !!initial?.whatsappSentAt,
  });
  const [stageBusy, setStageBusy] = useState(false);

  const set = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const linkedCompany = form.companyId
    ? store.companies.find((c) => c.id === form.companyId)
    : undefined;

  const onCompanyStageChange = async (stage: string) => {
    if (!form.companyId || !linkedCompany || stage === linkedCompany.stage) return;
    setStageBusy(true);
    try {
      await store.moveCompanyStage(form.companyId, stage as Stage, {
        stageChangeSource: 'contact_form',
      });
    } finally {
      setStageBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.contactName.trim()) return;

    const payload = {
      contactName: form.contactName.trim(),
      companyId: form.companyId || null,
      role: form.role,
      phone: form.phone,
      email: form.email,
      linkedInProfile: normalizeOptionalUrl(form.linkedInProfile),
      contactStatus: form.contactStatus,
      champion: form.champion,
      lastContacted: form.lastContacted || null,
      nextFollowUp: form.nextFollowUp || null,
      notes: form.notes,
      ...(initial ? { whatsappSent: form.whatsappSent } : {}),
    };

    if (initial) {
      await store.updateContact(initial.id, payload);
    } else {
      await store.addContact(payload);
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
              {initial ? 'Client Contact' : 'New Contact Registration'}
            </span>
            <h2 className="text-xl font-extrabold text-slate-900">
              {form.contactName || 'Untitled Contact'}
            </h2>
            {linkedCompany ? (
              <p className="mt-0.5 text-xs text-slate-500">
                Associated with: <strong className="text-slate-800">{linkedCompany.companyName}</strong>
              </p>
            ) : null}
          </div>
          <span className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
            {form.contactStatus}
          </span>
        </div>
      </div>

      {/* Contact Details Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="border-b border-slate-100 pb-2.5">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>👤</span> Contact Information
          </h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact Name *" className="sm:col-span-2">
            <input
              className={inputClass}
              value={form.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              required
              placeholder="Full name"
            />
          </Field>

          <Field label="Client Business">
            <select
              className={inputClass}
              value={form.companyId}
              onChange={(e) => set('companyId', e.target.value)}
            >
              <option value="">— None —</option>
              {store.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </Field>

          {form.companyId ? (
            <Field label="Lead Stage">
              <select
                className={inputClass}
                value={linkedCompany?.stage ?? stages[0] ?? ''}
                disabled={!linkedCompany || stageBusy}
                onChange={(e) => void onCompanyStageChange(e.target.value)}
                aria-label="Lead stage"
              >
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label="Role / Designation">
            <input
              className={inputClass}
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              placeholder="e.g. Founder, CTO, Operations Head"
            />
          </Field>

          <Field label="Phone Number">
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+91 …"
            />
          </Field>

          <Field label="Email Address">
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="name@business.com"
            />
          </Field>

          <Field label="Contact Status">
            <select
              className={inputClass}
              value={form.contactStatus}
              onChange={(e) => set('contactStatus', e.target.value)}
            >
              {contactStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Last Contacted">
            <input
              type="date"
              className={inputClass}
              value={form.lastContacted}
              onChange={(e) => set('lastContacted', e.target.value)}
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

          <Field label="LinkedIn Profile" className="sm:col-span-2">
            <input
              type="text"
              inputMode="url"
              autoComplete="url"
              className={inputClass}
              value={form.linkedInProfile}
              onChange={(e) => set('linkedInProfile', e.target.value)}
              placeholder="linkedin.com/in/… or https://…"
            />
          </Field>

          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Client conversation summary, specific preferences, schedule notes…"
            />
          </Field>

          {/* Badges / Checkboxes */}
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5">
            <label className="flex items-center gap-2.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={form.champion}
                onChange={(e) => set('champion', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
              <span className="font-bold text-slate-800">
                Key Contact / Champion{' '}
                <span className="font-normal text-slate-500">
                  (primary decision maker / project sponsor)
                </span>
              </span>
            </label>

            {initial ? (
              <label className="flex flex-wrap items-center gap-2.5 text-xs cursor-pointer border-t border-slate-200/60 pt-2.5">
                <input
                  type="checkbox"
                  data-testid="contact-whatsapp-sent"
                  checked={form.whatsappSent}
                  onChange={(e) => set('whatsappSent', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="font-bold text-slate-800">WhatsApp message sent</span>
                {form.whatsappSent && initial.whatsappSentAt ? (
                  <span className="text-[11px] text-slate-500">
                    on{' '}
                    {new Date(initial.whatsappSentAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                ) : !form.whatsappSent &&
                  needsWhatsApp({ ...initial, contactStatus: form.contactStatus }) ? (
                  <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-bold text-rose-700" data-testid="whatsapp-hint">
                    Dialed — send WhatsApp message
                  </span>
                ) : null}
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {initial ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <ContactCallLog
            contactId={initial.id}
            contactPhone={initial.phone}
            contactStatuses={contactStatuses}
            onCallLogged={(outcome, followUp) => {
              const today = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
              }).format(new Date());
              set('contactStatus', outcome);
              set('lastContacted', today);
              set('nextFollowUp', followUp);
              void store.refresh();
            }}
          />
        </div>
      ) : null}

      {initial ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <ConversationPanel
            store={store}
            contactId={initial.id}
            companyId={form.companyId || initial.companyId}
            stages={stages}
          />
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-xs text-slate-500">
          Save this contact first to log calls and upload call audio recordings.
        </p>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
        {initial && store.canDelete ? (
          <button
            type="button"
            className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
            onClick={async () => {
              if (confirm(`Delete ${initial.contactName}?`)) {
                await store.deleteContact(initial.id);
                onDone();
              }
            }}
          >
            Delete contact
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary}>
            {initial ? 'Save Changes' : 'Add Contact'}
          </button>
        </div>
      </div>
    </form>
  );
}
