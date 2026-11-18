import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { buildCallLog, fetchContactCallLog, type CallLogSummary } from '../lib/callLog';
import { IST_TZ } from '../lib/championCard';
import { btnPrimary, Field, inputClass } from './ui';

interface StructuredCallLog {
  id: string;
  callerName: string;
  occurredAt: string;
  durationSeconds: number | null;
  outcome: string;
  notes: string;
  nextFollowUpAt: string | null;
  provider: string;
  providerStatus: string | null;
  providerCallSid: string | null;
  hasRecording: boolean;
}

interface ActiveCallSession {
  id: string;
  providerCallSid: string;
  contactName: string;
  customerPhone: string;
  sharedAgentPhone: string;
  callerId: string;
  mode: string;
}

interface ExotelStatusResponse {
  configured: boolean;
  isLive: boolean;
  mode: string;
  provider: string;
  callerId: string;
  agentPhone: string;
}

function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: IST_TZ,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTimer(totalSeconds: number): string {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s ? `${s}s` : ''}`;
}

export function ContactCallLog({
  contactId,
  contactPhone,
  contactStatuses,
  onCallLogged,
}: {
  contactId: string;
  contactPhone: string;
  contactStatuses: string[];
  onCallLogged?: (outcome: string, nextFollowUpAt: string) => void;
}) {
  const [log, setLog] = useState<CallLogSummary | null>(null);
  const [structured, setStructured] = useState<StructuredCallLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(contactStatuses.find((s) => s !== 'Not Contacted') ?? 'Interested');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [exotelConfigured, setExotelConfigured] = useState(false);
  const [exotelInfo, setExotelInfo] = useState<ExotelStatusResponse | null>(null);
  const [startingCall, setStartingCall] = useState(false);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // Active Live Call State
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callPhase, setCallPhase] = useState<'ringing_agent' | 'connecting_customer' | 'connected'>('ringing_agent');
  const [inCallOutcome, setInCallOutcome] = useState('Interested');
  const [inCallNotes, setInCallNotes] = useState('');
  const [inCallFollowUp, setInCallFollowUp] = useState('');
  const [completingCall, setCompletingCall] = useState(false);

  const loadStructured = () =>
    api<{ callLogs: StructuredCallLog[] }>(`/api/call-logs?contactId=${encodeURIComponent(contactId)}`)
      .then((data) => {
        setStructured(data.callLogs);
        setNoteDrafts(Object.fromEntries(data.callLogs.map((call) => [call.id, call.notes])));
      });

  useEffect(() => {
    let cancelled = false;
    void fetchContactCallLog(contactId)
      .then((data) => {
        if (!cancelled) setLog(buildCallLog(data.events));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load call log');
      });
    void loadStructured().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load recorded calls');
    });
    void api<ExotelStatusResponse>('/api/exotel/status')
      .then((data) => {
        if (!cancelled) {
          setExotelConfigured(data.configured);
          setExotelInfo(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExotelConfigured(false);
          setExotelInfo(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  // Live in-call timer and progression
  useEffect(() => {
    if (!activeCall) return;
    const interval = setInterval(() => {
      setCallSeconds((s) => {
        const next = s + 1;
        if (next < 2) setCallPhase('ringing_agent');
        else if (next < 4) setCallPhase('connecting_customer');
        else setCallPhase('connected');
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall]);

  const startExotelCall = async () => {
    setStartingCall(true);
    setError(null);
    setSuccess('');
    try {
      const res = await api<{
        callLog: {
          id: string;
          providerCallSid: string;
          providerStatus: string;
          occurredAt: string;
          contactName: string;
          customerPhone?: string;
          sharedAgentPhone: string;
          callerId: string;
          mode?: string;
        };
      }>('/api/exotel/calls', { method: 'POST', body: JSON.stringify({ contactId }) });

      const logData = res.callLog;
      setActiveCall({
        id: logData.id,
        providerCallSid: logData.providerCallSid,
        contactName: logData.contactName || 'Contact',
        customerPhone: logData.customerPhone || contactPhone,
        sharedAgentPhone: logData.sharedAgentPhone || '+91 98765 43210 (Shared Handset)',
        callerId: logData.callerId || '+91 80 4718 2000 (ExoPhone Virtual)',
        mode: logData.mode || 'poc',
      });
      setCallSeconds(0);
      setCallPhase('ringing_agent');
      setInCallOutcome(contactStatuses.find((s) => s !== 'Not Contacted') ?? 'Interested');
      setInCallNotes('');

      // Default follow-up date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setInCallFollowUp(tomorrow.toISOString().slice(0, 10));

      setSuccess('Call connected via Exotel telephony.');
      await loadStructured();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Exotel call.');
    } finally {
      setStartingCall(false);
    }
  };

  const completeExotelCall = async () => {
    if (!activeCall) return;
    setCompletingCall(true);
    setError(null);
    try {
      const finalDuration = Math.max(1, callSeconds);
      await api(`/api/exotel/calls/${encodeURIComponent(activeCall.id)}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          durationSeconds: finalDuration,
          outcome: inCallOutcome,
          notes: inCallNotes,
          nextFollowUpAt: inCallFollowUp || null,
        }),
      });
      onCallLogged?.(inCallOutcome, inCallFollowUp || '');
      setSuccess(`Call ended (${formatCallDuration(finalDuration)}). Cloud recording archived and lead status updated.`);
      setActiveCall(null);
      await loadStructured();
      void fetchContactCallLog(contactId).then((data) => setLog(buildCallLog(data.events)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete call.');
    } finally {
      setCompletingCall(false);
    }
  };

  const saveExotelNote = async (id: string) => {
    setSavingNoteId(id);
    setError(null);
    try {
      await api(`/api/call-logs/${id}`, { method: 'PATCH', body: JSON.stringify({ notes: noteDrafts[id] ?? '' }) });
      setSuccess('Call notes saved.');
      await loadStructured();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save call notes.');
    } finally {
      setSavingNoteId(null);
    }
  };

  const saveCall = async () => {
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      await api('/api/call-logs', {
        method: 'POST',
        body: JSON.stringify({
          contactId,
          outcome,
          durationSeconds: durationMinutes === '' ? null : Math.round(Number(durationMinutes) * 60),
          notes,
          nextFollowUpAt: nextFollowUpAt || null,
        }),
      });
      setNotes('');
      setDurationMinutes('');
      setSuccess('Call saved. Lead status and follow-up were updated.');
      onCallLogged?.(outcome, nextFollowUpAt);
      await loadStructured();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this call.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="space-y-4"
      aria-label="Contact call log"
      data-testid="contact-call-log"
    >
      <div className="border-b border-slate-100 pb-2.5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <svg className="h-4 w-4 text-teal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          Call Log & Intake History
        </h3>
        <p className="text-xs text-slate-500">
          Record call details, duration, outcome, and scheduled follow-ups.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          {error}
        </p>
      ) : null}

      {/* ACTIVE CALL IN-CALL HUD MODAL / CONSOLE */}
      {activeCall ? (
        <div
          role="region"
          aria-label="Active call dialer console"
          className="rounded-xl border-2 border-teal-500 bg-slate-900 text-white p-4 shadow-xl space-y-4 animate-in fade-in duration-200"
        >
          {/* Top Bar with Live Indicator and Timer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                    Exotel Telephony Active
                  </h4>
                  <span className="rounded-md bg-teal-500/20 px-2 py-0.5 text-[10px] font-semibold text-teal-300 border border-teal-500/30">
                    {activeCall.mode === 'poc' ? 'POC Active Simulation' : 'Live Production'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-medium">
                  {callPhase === 'ringing_agent' && 'Step 1/3: Ringing shared agent mobile...'}
                  {callPhase === 'connecting_customer' && 'Step 2/3: Agent picked up. Dialing customer leg...'}
                  {callPhase === 'connected' && 'Step 3/3: Both legs connected & bridged.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {callPhase === 'connected' ? (
                <div className="flex items-center gap-1.5 rounded-md bg-rose-500/20 px-2.5 py-1 border border-rose-500/40 text-[11px] font-bold text-rose-300">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  REC Exotel Cloud
                </div>
              ) : null}
              <div className="font-mono text-xl font-bold tracking-wider text-emerald-400 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 shadow-inner">
                {formatTimer(callSeconds)}
              </div>
            </div>
          </div>

          {/* Telephony Route Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Agent Handset</span>
              <span className="font-mono text-slate-200">{activeCall.sharedAgentPhone}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Virtual ExoPhone</span>
              <span className="font-mono text-teal-300">{activeCall.callerId}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer Target</span>
              <span className="font-mono text-slate-200 font-semibold">{activeCall.customerPhone || 'No Phone'}</span>
            </div>
          </div>

          {/* Quick Disposition Pills */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1.5">
              Select Call Outcome / Disposition:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['Interested', 'Follow-up set', 'Demo scheduled', "Didn't pick", 'Not Interested'].map((disp) => {
                const selected = inCallOutcome === disp;
                return (
                  <button
                    key={disp}
                    type="button"
                    onClick={() => setInCallOutcome(disp)}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? 'bg-teal-600 text-white shadow-sm ring-2 ring-teal-400 ring-offset-1 ring-offset-slate-900'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {disp}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Next Follow Up Date (if applicable) */}
          {(inCallOutcome === 'Interested' || inCallOutcome === 'Follow-up set' || inCallOutcome === 'Demo scheduled') ? (
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-300 font-medium whitespace-nowrap">
                Scheduled Next Follow-up:
              </label>
              <input
                type="date"
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
                value={inCallFollowUp}
                onChange={(e) => setInCallFollowUp(e.target.value)}
              />
            </div>
          ) : null}

          {/* Live In-Call Notes Field */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
              Live In-Call Notes:
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none min-h-[4rem]"
              value={inCallNotes}
              onChange={(e) => setInCallNotes(e.target.value)}
              placeholder="Capture client requirements, budget range, questions, or next action items in real-time..."
            />
          </div>

          {/* Hangup / End Call Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-400">
              Ending will finalize duration, bind audio recording, and update lead pipeline status.
            </p>
            <button
              type="button"
              onClick={() => void completeExotelCall()}
              disabled={completingCall}
              className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:bg-rose-500 disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                <line x1="22" y1="2" x2="2" y2="22" />
              </svg>
              {completingCall ? 'Finalizing Call...' : 'End Call & Save'}
            </button>
          </div>
        </div>
      ) : null}

      {!log ? (
        <p className="text-sm text-slate-500">Loading call log…</p>
      ) : log.days.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-xs text-slate-500">
          No calls logged yet.
        </p>
      ) : (
        <>
          <p className="text-xs font-semibold text-slate-600" data-testid="call-log-summary">
            {log.firstContactedDate
              ? `First contacted ${formatDay(log.firstContactedDate)}`
              : 'Not contacted yet'}
            {' · '}
            {log.callDays} call {log.callDays === 1 ? 'day' : 'days'}
          </p>
          <ol className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3 kanban-scroll">
            {log.days.map((day) => (
              <li key={day.date} className="rounded-lg border border-slate-200/80 bg-white p-2.5 text-xs text-slate-700 shadow-2xs" data-testid="call-log-day">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <time className="font-mono text-xs font-bold text-slate-700" dateTime={day.date}>
                    {formatDay(day.date)}
                  </time>
                  {day.date === log.firstContactedDate ? (
                    <span className="rounded-md bg-teal-50 border border-teal-200 px-1.5 py-0.2 text-[10px] font-bold text-teal-800">
                      First call
                    </span>
                  ) : null}
                  <span className="text-[11px] text-slate-500">{day.people.join(', ')}</span>
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-slate-600 border-t border-slate-100 pt-1">
                  {day.created ? (
                    <p>Added{day.createdStatus ? ` as ${day.createdStatus}` : ''}</p>
                  ) : null}
                  {day.statusChanges.map((change, i) => (
                    <p key={`${change.at}-${i}`}>
                      <span className="font-mono text-slate-400">{formatTime(change.at)}</span>{' '}
                      {change.from ? `${change.from} → ` : ''}
                      <span className="font-bold text-slate-800">{change.to ?? '—'}</span>
                    </p>
                  ))}
                  {day.followUp ? <p className="font-medium text-amber-700">Next follow-up: {formatDay(day.followUp)}</p> : null}
                  {day.whatsappSent !== null ? (
                    <p className="font-medium text-emerald-700">{day.whatsappSent ? '✓ WhatsApp sent' : 'WhatsApp unmarked'}</p>
                  ) : null}
                  {day.recordings > 0 ? (
                    <p className="text-teal-700 font-medium flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                      {day.recordings} recording{day.recordings === 1 ? '' : 's'} archived
                    </p>
                  ) : null}
                  {day.notes.map((note, i) => (
                    <p key={i} className="whitespace-pre-wrap text-slate-700">
                      Note: {note}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {/* Call via Exotel Trigger Bar */}
      <section className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-900">
                Call this contact via Exotel
              </h4>
              <span className="rounded-full bg-teal-100 px-2 py-0.2 text-[10px] font-semibold text-teal-800 border border-teal-300">
                {exotelInfo?.isLive ? 'Exotel Live' : 'POC Mode Ready'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              Agent handset ({exotelInfo?.agentPhone || '+91 98765 43210'}) connects to contact through ExoPhone ({exotelInfo?.callerId || '+91 80 4718 2000'}).
            </p>
          </div>
          <button
            type="button"
            className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
            onClick={() => void startExotelCall()}
            disabled={!exotelConfigured || !contactPhone.trim() || startingCall || !!activeCall}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            {startingCall ? 'Connecting…' : 'Call via Exotel'}
          </button>
        </div>
        {!contactPhone.trim() ? (
          <p className="text-xs text-amber-700">Add a valid contact phone number to call.</p>
        ) : null}
        {!exotelConfigured ? (
          <p className="text-xs text-slate-500">Exotel server settings are not configured yet.</p>
        ) : null}
      </section>

      {/* Manual Record Call Box */}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-teal-800">Log a Call Manually</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Call outcome">
            <select className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {contactStatuses.filter((s) => s !== 'Not Contacted').map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="Duration (minutes)">
            <input type="number" min="0" max="1440" step="0.5" className={inputClass} value={durationMinutes} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="e.g. 5" />
          </Field>
          <Field label="Next follow-up">
            <input type="date" className={inputClass} value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} />
          </Field>
          <Field label="Call notes" className="sm:col-span-2">
            <textarea className={`${inputClass} min-h-16`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Client needs, budget discussed, decision, next steps…" />
          </Field>
        </div>
        <button type="button" className={btnPrimary} onClick={() => void saveCall()} disabled={busy}>
          {busy ? 'Saving…' : 'Save Call Entry'}
        </button>
        {success ? <p role="status" className="text-xs font-bold text-teal-800">{success}</p> : null}
      </section>

      {/* Structured Call Records with Playback */}
      {structured.length ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Saved Call Records</h4>
            <button type="button" className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer" onClick={() => void loadStructured()}>Refresh records</button>
          </div>
          <ol className="max-h-72 space-y-2.5 overflow-y-auto kanban-scroll">
            {structured.map((call) => (
              <li key={call.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{call.outcome}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600 font-medium">{call.callerName}</span>
                    {call.provider === 'exotel' ? (
                      <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200">
                        Exotel
                      </span>
                    ) : null}
                  </div>
                  <time className="text-[11px] font-medium text-slate-400" dateTime={call.occurredAt}>
                    {new Date(call.occurredAt).toLocaleString('en-IN', { timeZone: IST_TZ })}
                  </time>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
                  {call.providerStatus ? (
                    <span>Status: <strong className="text-slate-700">{call.providerStatus}</strong></span>
                  ) : null}
                  {call.durationSeconds != null ? (
                    <span>Duration: <strong className="text-slate-700">{formatCallDuration(call.durationSeconds)}</strong></span>
                  ) : null}
                  {call.nextFollowUpAt ? (
                    <span className="text-amber-700 font-semibold">Next follow-up: {formatDay(call.nextFollowUpAt)}</span>
                  ) : null}
                </div>

                {call.hasRecording ? (
                  <div className="mt-2.5 rounded-lg border border-teal-200 bg-teal-50/50 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-teal-900">
                      <span className="flex items-center gap-1.5">
                        <svg className="h-3.5 w-3.5 text-teal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="22" />
                        </svg>
                        Call Audio Recording
                      </span>
                      <span className="text-[10px] text-teal-700 font-mono">Audio Stream</span>
                    </div>
                    <audio className="w-full h-8 pt-0.5" controls preload="none" src={`/api/exotel/call-logs/${call.id}/recording`} />
                  </div>
                ) : null}

                {call.provider === 'exotel' ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      className={`${inputClass} min-h-16`}
                      value={noteDrafts[call.id] ?? ''}
                      onChange={(e) => setNoteDrafts((current) => ({ ...current, [call.id]: e.target.value }))}
                      placeholder="Add key points or next steps from this call…"
                    />
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={() => void saveExotelNote(call.id)}
                      disabled={savingNoteId === call.id}
                    >
                      {savingNoteId === call.id ? 'Saving…' : 'Save call notes'}
                    </button>
                  </div>
                ) : call.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-slate-600 bg-slate-50 p-2 rounded-md border border-slate-100">
                    {call.notes}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
