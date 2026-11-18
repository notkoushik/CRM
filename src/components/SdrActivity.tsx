import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  eventTypeLabel,
  fetchOverview,
  fetchSdrs,
  fetchTimeline,
  todayIstIso,
  type ActivityOverview,
  type ActivitySdr,
  type TimelineEvent,
} from '../lib/activity';
import { DayActivityStrip } from './DayActivityStrip';
import { btnGhost, inputClass } from './ui';

interface RecordedCallItem {
  id: string;
  leadId: string;
  companyName: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  callerId: string;
  callerName: string;
  occurredAt: string;
  durationSeconds: number | null;
  outcome: string;
  notes: string;
  nextFollowUpAt: string | null;
  provider: string;
  providerStatus: string | null;
  hasRecording: boolean;
}

function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s ? `${s}s` : ''}`;
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function fmtDay(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function dayKeyIst(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-semibold">
        <span className="text-slate-700">{label}</span>
        <span className="text-slate-500">
          {value} / {max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
      <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function ActivityFeed({ events, multiDay }: { events: TimelineEvent[]; multiDay: boolean }) {
  const groups = useMemo(() => {
    if (!multiDay) return [{ key: 'all', label: null as string | null, events }];
    const map = new Map<string, TimelineEvent[]>();
    for (const e of events) {
      const key = dayKeyIst(e.createdAt);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()].map(([key, evs]) => ({
      key,
      label: fmtDay(`${key}T12:00:00+05:30`),
      events: evs,
    }));
  }, [events, multiDay]);

  if (events.length === 0) {
    return (
      <p className="rounded-none border border-dashed border-[var(--color-line)] bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
        No activity logged for this user / date range.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key}>
          {g.label ? (
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
              {g.label}
            </h3>
          ) : null}
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            {g.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-3 hover:bg-slate-50/60 transition">
                <time className="w-20 shrink-0 text-xs font-mono font-medium text-slate-400 tabular-nums">
                  {fmtTime(e.createdAt)}
                </time>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-teal-200/80 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                      {eventTypeLabel(e.eventType)}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">{e.userName}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-800 font-medium">{e.summary || e.eventType}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function SdrActivity() {
  const [sdrs, setSdrs] = useState<ActivitySdr[]>([]);
  const [userId, setUserId] = useState('all');
  const today = todayIstIso();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [overview, setOverview] = useState<ActivityOverview | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [recordedCalls, setRecordedCalls] = useState<RecordedCallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchSdrs()
      .then(({ sdrs: list }) => setSdrs(list.filter((s) => s.role === 'sdr')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load agents'));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opts = { from, to, userId, q: searchApplied };
      const callParams = new URLSearchParams();
      if (userId !== 'all') callParams.set('userId', userId);
      callParams.set('from', from);
      callParams.set('to', to);
      if (searchApplied) callParams.set('q', searchApplied);

      const [ov, tl, callsData] = await Promise.all([
        fetchOverview(opts),
        fetchTimeline(opts),
        api<{ callLogs: RecordedCallItem[] }>(`/api/call-logs?${callParams.toString()}`).catch(() => ({ callLogs: [] })),
      ]);
      setOverview(ov);
      setEvents(tl.events);
      setRecordedCalls(callsData.callLogs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
      setOverview(null);
      setEvents([]);
      setRecordedCalls([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, userId, searchApplied]);

  useEffect(() => {
    void load();
  }, [load]);

  const m = overview?.metrics;
  const session = overview?.session;
  const progress = overview?.progress;
  const targets = overview?.targets;
  const single = userId !== 'all';
  const singleDay = from === to;
  const stripEvents = useMemo(() => (singleDay ? [...events].reverse() : []), [events, singleDay]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-stone-900 sm:text-4xl">
            SDR Activity
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Every CRM action by agents — filter by user, date range, and search.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            Agent
            <select
              className={inputClass}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="all">All SDRs</option>
              {sdrs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            From
            <input
              type="date"
              className={inputClass}
              value={from}
              onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (v > to) setTo(v);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            To
            <input
              type="date"
              className={inputClass}
              value={to}
              onChange={(e) => {
                const v = e.target.value;
                setTo(v);
                if (v < from) setFrom(v);
              }}
            />
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-stone-500">
            Search
            <input
              type="search"
              className={inputClass}
              placeholder="Status, client business…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearchApplied(search.trim());
              }}
            />
          </label>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setSearchApplied(search.trim())}
            disabled={loading}
          >
            Search
          </button>
          <button type="button" className={btnGhost} onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          <div className="flex gap-1 border-l border-stone-200 pl-2">
            <button
              type="button"
              className={btnGhost}
              onClick={async () => {
                try {
                  setLoading(true);
                  setError(null);
                  const url = `/api/activity/export?format=csv&from=${from}&to=${to}`;
                  const res = await fetch(url, { credentials: 'include' });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || 'Export failed');
                  }
                  const blob = await res.blob();
                  const objUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = objUrl;
                  a.download = `activity_export.csv`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(objUrl);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Export failed');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              CSV
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={async () => {
                try {
                  setLoading(true);
                  setError(null);
                  const url = `/api/activity/export?format=json&from=${from}&to=${to}`;
                  const res = await fetch(url, { credentials: 'include' });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || 'Export failed');
                  }
                  const blob = await res.blob();
                  const objUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = objUrl;
                  a.download = `activity_export.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(objUrl);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Export failed');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              JSON
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{error}</p>
      ) : null}
      {loading && !overview ? <p className="text-sm text-slate-500">Loading activity…</p> : null}

      {overview && m && session && progress && targets ? (
        <>
          {overview.alerts.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-slate-800">Alerts</h2>
              <ul className="space-y-1.5">
                {overview.alerts.map((a, i) => (
                  <li
                    key={`${a.code}-${a.userId}-${i}`}
                    className={`rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-2xs ${
                      a.severity === 'critical'
                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <span className="font-bold">{a.userName}:</span> {a.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-stone-800">Session</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {single ? (
                <>
                  <Metric label="Login" value={fmtTime(session.loginTime)} />
                  <Metric label="Logout" value={fmtTime(session.logoutTime)} />
                </>
              ) : null}
              <Metric label="Active" value={session.activeDuration} />
              <Metric label="Idle" value={session.idleDuration} />
              <Metric label="Sessions" value={session.sessionCount} />
            </div>
          </section>

          {singleDay ? (
            <DayActivityStrip
              dateIso={from}
              events={stripEvents}
              agents={
                userId === 'all'
                  ? overview.agents.map((a) => ({ userId: a.userId, name: a.name }))
                  : undefined
              }
            />
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-stone-800">Calls</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Metric label="Made" value={m.callsMade} />
              <Metric label="Connected" value={m.connected} />
              <Metric label="Didn't pick" value={m.didntPick} />
              <Metric label="Interested" value={m.interested} />
              <Metric label="Follow-ups" value={m.followUps} />
              <Metric label="Demo" value={m.demo} />
              <Metric label="WhatsApp sent" value={m.whatsappSent ?? 0} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Caller Targets</h2>
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <ProgressBar label="Calls" value={progress.calls} max={targets.calls} />
              <ProgressBar label="Follow-ups" value={progress.followUps} max={targets.followUps} />
              <ProgressBar label="Demos" value={progress.demos} max={targets.demos} />
            </div>
          </section>

          {userId === 'all' && overview.agents.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">By Caller</h2>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Caller</th>
                      <th className="px-3 py-2 font-semibold">Calls</th>
                      <th className="px-3 py-2 font-semibold">Connected</th>
                      <th className="px-3 py-2 font-semibold">Interested</th>
                      <th className="px-3 py-2 font-semibold">Demo</th>
                      <th className="px-3 py-2 font-semibold">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.agents.map((a) => (
                      <tr
                        key={a.userId}
                        className="cursor-pointer border-t border-[var(--color-line)] hover:bg-stone-50"
                        onClick={() => setUserId(a.userId)}
                      >
                        <td className="px-3 py-2 font-medium text-teal-800">{a.name}</td>
                        <td className="px-3 py-2">{a.metrics.callsMade}</td>
                        <td className="px-3 py-2">{a.metrics.connected}</td>
                        <td className="px-3 py-2">{a.metrics.interested}</td>
                        <td className="px-3 py-2">{a.metrics.demo}</td>
                        <td className="px-3 py-2">{a.session.activeDuration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {/* ADMIN CALL RECORDINGS & TELEPHONY PLAYBACK FEED */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2.5">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <svg className="h-4 w-4 text-teal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Recorded Calls & Audio Playback ({recordedCalls.length})
            </h2>
            <p className="text-xs text-slate-500">
              Listen to actual call recordings, inspect agent talk duration, review in-call notes, and verify outcomes.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            {userId === 'all' ? 'All Callers' : 'Filtered Agent'} · {from === to ? from : `${from} to ${to}`}
          </span>
        </div>

        {recordedCalls.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
            No calls recorded for this agent or date filter.
          </div>
        ) : (
          <div className="grid gap-3">
            {recordedCalls.map((call) => (
              <div
                key={call.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5 text-xs text-slate-700 hover:border-slate-300 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">
                      {call.contactName || 'Lead Contact'}
                    </span>
                    {call.companyName ? (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {call.companyName}
                      </span>
                    ) : null}
                    <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200">
                      {call.outcome}
                    </span>
                    {call.provider === 'exotel' ? (
                      <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 border border-slate-200">
                        Exotel
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span>Agent: <strong className="text-slate-800 font-semibold">{call.callerName}</strong></span>
                    <span>·</span>
                    <time dateTime={call.occurredAt}>
                      {new Date(call.occurredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </time>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-600">
                  {call.durationSeconds != null ? (
                    <span>Duration: <strong className="text-slate-800 font-semibold">{formatCallDuration(call.durationSeconds)}</strong></span>
                  ) : null}
                  {call.contactPhone ? (
                    <span>Customer Phone: <strong className="font-mono text-slate-800">{call.contactPhone}</strong></span>
                  ) : null}
                  {call.nextFollowUpAt ? (
                    <span className="text-amber-700 font-semibold">Scheduled Follow-up: {call.nextFollowUpAt}</span>
                  ) : null}
                </div>

                {call.hasRecording ? (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-teal-900">
                      <span className="flex items-center gap-1.5">
                        <svg className="h-3.5 w-3.5 text-teal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="22" />
                        </svg>
                        Call Audio Recording
                      </span>
                      <span className="text-[10px] font-mono text-teal-700">Audio Playback Ready</span>
                    </div>
                    <audio
                      className="w-full h-8 pt-0.5"
                      controls
                      preload="none"
                      src={`/api/exotel/call-logs/${call.id}/recording`}
                    />
                  </div>
                ) : null}

                {call.notes ? (
                  <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-slate-700">
                    <strong className="text-slate-500 block text-[10px] uppercase font-bold mb-0.5">Caller Intake Notes:</strong>
                    {call.notes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-800">Activity log</h2>
          <span className="text-xs text-stone-500">
            {events.length} event{events.length === 1 ? '' : 's'}
            {loading ? ' · refreshing…' : ''}
          </span>
        </div>
        <div className="max-h-[28rem] overflow-y-auto overscroll-contain pr-1">
          <ActivityFeed events={events} multiDay={!singleDay} />
        </div>
      </section>
    </div>
  );
}
