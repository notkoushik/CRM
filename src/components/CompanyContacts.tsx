import { useState } from 'react';
import type { Contact } from '../types';
import type { CrmStore } from '../hooks/useCrmStore';
import { statusColor } from '../lib/views';
import { companyContactSummary, isDialed, needsWhatsApp } from '../lib/progress';

/**
 * Every contact on a company with its latest state, so the company view answers
 * "who have we called, what happened, and did they get the WhatsApp message?" at a glance.
 */
export function CompanyContacts({
  store,
  companyId,
  onOpenContact,
}: {
  store: CrmStore;
  companyId: string;
  onOpenContact?: (contact: Contact) => void;
}) {
  const contacts = store.contacts.filter((t) => t.companyId === companyId);
  const summary = companyContactSummary(contacts);
  // The tick shows straight away; it reverts if the save fails.
  const [saving, setSaving] = useState<{ id: string; sent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleWhatsApp = async (contact: Contact, sent: boolean) => {
    setSaving({ id: contact.id, sent });
    setError(null);
    try {
      await store.updateContact(contact.id, { whatsappSent: sent });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update WhatsApp status');
    } finally {
      setSaving(null);
    }
  };

  return (
    <section
      className="space-y-3"
      aria-label="Lead contacts"
      data-testid="company-contacts"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <svg className="h-4 w-4 text-teal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 0 0 7.75" />
            </svg>
            Client Contacts ({contacts.length})
          </h3>
          <p className="text-xs text-slate-500">
            Decision makers and stakeholders for this lead.
          </p>
        </div>
        {contacts.length > 0 ? (
          <p className="text-xs text-slate-500 font-medium" data-testid="company-contacts-summary">
            {summary.dialed}/{summary.total} dialed · {summary.followUps} follow-up
            {summary.followUps === 1 ? '' : 's'} · WhatsApp {summary.whatsappSent}/
            {summary.whatsappDue} sent
            {summary.whatsappPending > 0 ? (
              <span className="font-bold text-rose-700">
                {' '}
                ({summary.whatsappPending} pending)
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-semibold text-rose-600">
          {error}
        </p>
      ) : null}
      {contacts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-xs text-slate-500">
          No client contacts on this lead yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold tracking-wider text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 font-bold">Contact</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Last Contacted</th>
                <th className="px-3 py-2 font-bold">Follow-up</th>
                <th className="px-3 py-2 font-bold">WhatsApp</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {contacts.map((t) => {
                const sent = saving?.id === t.id ? saving.sent : !!t.whatsappSentAt;
                const pending = needsWhatsApp(t) && !sent;
                return (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50/70 transition align-middle"
                    data-testid="company-contact-row"
                    data-contact-id={t.id}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-slate-900">
                        {t.champion ? <span className="text-amber-500">★ </span> : null}
                        {t.contactName}
                      </p>
                      {t.role ? <p className="text-[11px] text-slate-500">{t.role}</p> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${statusColor(t.contactStatus)}`}
                      >
                        {t.contactStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-medium">{t.lastContacted ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-medium">{t.nextFollowUp ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <label
                        className={`inline-flex items-center gap-1.5 cursor-pointer ${pending ? 'font-bold text-rose-700' : 'text-slate-600'}`}
                        title={
                          isDialed(t)
                            ? undefined
                            : 'Not dialed yet; the WhatsApp message is due once they are'
                        }
                      >
                        <input
                          type="checkbox"
                          data-testid="company-contact-whatsapp"
                          checked={sent}
                          disabled={saving?.id === t.id}
                          onChange={(e) => void toggleWhatsApp(t, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          aria-label={`WhatsApp sent to ${t.contactName}`}
                        />
                        <span className="text-[11px] font-semibold">{sent ? 'Sent' : pending ? 'Pending' : '—'}</span>
                      </label>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {onOpenContact ? (
                        <button
                          type="button"
                          data-testid="company-contact-open"
                          onClick={() => onOpenContact(t)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-teal-800 shadow-2xs hover:bg-teal-50 hover:border-teal-300 transition cursor-pointer"
                        >
                          View Contact
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
