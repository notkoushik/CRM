import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrmStore } from '../hooks/useCrmStore';
import type { Contact } from '../types';
import { api } from '../lib/api';
import { statusColor } from '../lib/views';
import { IST_TZ } from '../lib/championCard';
import { fetchSdrs } from '../lib/activity';

interface ActiveCall {
  id: string;
  providerCallSid: string;
  contactId: string;
  contactName: string;
  companyName: string;
  customerPhone: string;
  sharedAgentPhone: string;
  callerId: string;
  mode: string;
}

interface CallLogItem {
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

interface ExotelStatus {
  configured: boolean;
  isLive: boolean;
  mode: string;
  provider: string;
  callerId: string;
  agentPhone: string;
}

type QueueTab = 'due_today' | 'fresh' | 'in_progress' | 'retry' | 'all' | 'history';

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

export function CallDesk({
  store,
  userRole,
  userName: _userName,
}: {
  store: CrmStore;
  userRole?: string;
  userName?: string;
}) {
  const isElevated = userRole === 'admin' || userRole === 'founder';
  const [sdrs, setSdrs] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('all');
  const [activeTab, setActiveTab] = useState<QueueTab>('due_today');
  const [search, setSearch] = useState('');
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callPhase, setCallPhase] = useState<'ringing_agent' | 'connecting_customer' | 'connected'>('ringing_agent');
  const [inCallOutcome, setInCallOutcome] = useState('Interested');
  const [inCallNotes, setInCallNotes] = useState('');
  const [inCallFollowUp, setInCallFollowUp] = useState('');
  const [startingCallContactId, setStartingCallContactId] = useState<string | null>(null);
  const [completingCall, setCompletingCall] = useState(false);
  const [callLogs, setCallLogs] = useState<CallLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [exotelStatus, setExotelStatus] = useState<ExotelStatus | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load SDR list for elevated users
  useEffect(() => {
    if (isElevated) {
      void fetchSdrs()
        .then(({ sdrs: list }) => setSdrs(list.filter((s) => s.role === 'sdr')))
        .catch(() => {});
    }
  }, [isElevated]);

  // Today in IST
  const todayIST = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }, []);

  // Load Exotel config status
  useEffect(() => {
    let active = true;
    api<ExotelStatus>('/api/exotel/status')
      .then((data) => {
        if (active) setExotelStatus(data);
      })
      .catch(() => {
        if (active) setExotelStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  // Load Recent Call Logs
  const loadRecentCalls = useCallback((agentId = selectedAgentId) => {
    setLoadingLogs(true);
    const query = agentId !== 'all' ? `?userId=${encodeURIComponent(agentId)}` : '';
    api<{ callLogs: CallLogItem[] }>(`/api/call-logs${query}`)
      .then((data) => {
        setCallLogs(data.callLogs);
      })
      .catch((err) => {
        console.error('Failed to load call logs', err);
      })
      .finally(() => {
        setLoadingLogs(false);
      });
  }, [selectedAgentId]);

  useEffect(() => {
    loadRecentCalls(selectedAgentId);
  }, [loadRecentCalls, selectedAgentId]);

  // Live call timer progression
  useEffect(() => {
    if (!activeCall) return;
    const interval = setInterval(() => {
      setCallSeconds((prev) => {
        const next = prev + 1;
        if (next < 2) setCallPhase('ringing_agent');
        else if (next < 4) setCallPhase('connecting_customer');
        else setCallPhase('connected');
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall]);

  // Lookup map for companies
  const companyMap = useMemo(() => {
    return new Map(store.companies.map((c) => [c.id, c]));
  }, [store.companies]);

  // Caller Queue Buckets (supports Admin agent filtering)
  const contactsList = useMemo(() => {
    if (!isElevated || selectedAgentId === 'all') return store.contacts;
    return store.contacts.filter((c) => {
      const co = c.companyId ? companyMap.get(c.companyId) : null;
      return co?.assignedTo === selectedAgentId;
    });
  }, [store.contacts, isElevated, selectedAgentId, companyMap]);

  const dueTodayContacts = useMemo(() => {
    return contactsList.filter((c) => c.nextFollowUp && c.nextFollowUp <= todayIST);
  }, [contactsList, todayIST]);

  const freshContacts = useMemo(() => {
    return contactsList.filter((c) => c.contactStatus === 'Not Contacted');
  }, [contactsList]);

  const inProgressContacts = useMemo(() => {
    return contactsList.filter(
      (c) =>
        c.contactStatus.includes('Follow-up') ||
        c.contactStatus === 'Interested' ||
        c.contactStatus.includes('Discovery')
    );
  }, [contactsList]);

  const retryContacts = useMemo(() => {
    return contactsList.filter(
      (c) => c.contactStatus === "Didn't Pick" || c.contactStatus === 'No Answer'
    );
  }, [contactsList]);

  // Filter contacts by active tab
  const filteredQueue = useMemo(() => {
    let list: Contact[] = [];
    switch (activeTab) {
      case 'due_today':
        list = dueTodayContacts;
        break;
      case 'fresh':
        list = freshContacts;
        break;
      case 'in_progress':
        list = inProgressContacts;
        break;
      case 'retry':
        list = retryContacts;
        break;
      case 'all':
        list = contactsList;
        break;
      case 'history':
        return [];
    }

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((c) => {
      const co = c.companyId ? companyMap.get(c.companyId) : null;
      return (
        c.contactName.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (co && co.companyName.toLowerCase().includes(q))
      );
    });
  }, [
    activeTab,
    dueTodayContacts,
    freshContacts,
    inProgressContacts,
    retryContacts,
    contactsList,
    search,
    companyMap,
  ]);

  // Dial a contact
  const handleStartCall = async (contact: Contact) => {
    if (!contact.phone || !contact.phone.trim()) {
      setErrorMessage(`Cannot place call: Contact ${contact.contactName} does not have a phone number.`);
      return;
    }
    setStartingCallContactId(contact.id);
    setErrorMessage(null);
    setBannerMessage(null);
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
      }>('/api/exotel/calls', {
        method: 'POST',
        body: JSON.stringify({ contactId: contact.id }),
      });

      const co = contact.companyId ? companyMap.get(contact.companyId) : null;
      const logData = res.callLog;
      setActiveCall({
        id: logData.id,
        providerCallSid: logData.providerCallSid,
        contactId: contact.id,
        contactName: contact.contactName,
        companyName: co?.companyName || 'Unassigned Lead',
        customerPhone: contact.phone,
        sharedAgentPhone: logData.sharedAgentPhone || '+91 98765 43210 (Shared Handset)',
        callerId: logData.callerId || '+91 80 4718 2000 (ExoPhone Virtual)',
        mode: logData.mode || 'poc',
      });
      setCallSeconds(0);
      setCallPhase('ringing_agent');
      setInCallOutcome('Interested');
      setInCallNotes('');

      // Default follow-up date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setInCallFollowUp(tomorrow.toISOString().slice(0, 10));
      setBannerMessage(`Dialing ${contact.contactName} via Exotel Cloud...`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not place Exotel call.');
    } finally {
      setStartingCallContactId(null);
    }
  };

  // Complete Active Call
  const handleCompleteCall = async () => {
    if (!activeCall) return;
    setCompletingCall(true);
    setErrorMessage(null);
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

      setBannerMessage(
        `Call completed (${formatCallDuration(finalDuration)}). Outcome: "${inCallOutcome}" saved to CRM timeline.`
      );
      setActiveCall(null);
      void store.refresh();
      loadRecentCalls();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not complete call.');
    } finally {
      setCompletingCall(false);
    }
  };

  // Stats today
  const todayCallsCount = useMemo(() => {
    return callLogs.filter((c) => c.occurredAt && c.occurredAt.slice(0, 10) === todayIST).length;
  }, [callLogs, todayIST]);

  return (
    <div className="space-y-6">
      {/* Page Title & Status Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
              Telephony Workplace
            </span>
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200">
              {exotelStatus?.isLive ? 'Exotel Production' : 'POC Mode Active'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 sm:text-3xl tracking-tight">
            Caller Desk & Telephony Queue
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Work your daily calling queue, dial client leads with one click, and review call recordings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isElevated && sdrs.length > 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Agent Queue</span>
              <select
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value);
                  loadRecentCalls(e.target.value);
                }}
                className="font-bold text-slate-800 bg-transparent text-xs focus:outline-none cursor-pointer"
              >
                <option value="all">All Callers (Entire Agency)</option>
                {sdrs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Caller)
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Virtual ExoPhone</span>
            <span className="font-mono font-bold text-teal-800">
              {exotelStatus?.callerId || '+91 80 4718 2000'}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Shared Handset</span>
            <span className="font-mono font-bold text-slate-700">
              {exotelStatus?.agentPhone || '+91 98765 43210'}
            </span>
          </div>
        </div>
      </div>

      {/* Error & Success Banners */}
      {errorMessage ? (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="cursor-pointer text-rose-500 hover:text-rose-800"
          >
            ✕
          </button>
        </div>
      ) : null}

      {bannerMessage ? (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{bannerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="cursor-pointer text-emerald-600 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* ACTIVE CALL IN-CALL HUD MODAL / CONSOLE */}
      {activeCall ? (
        <div
          role="region"
          aria-label="Active Call Dialer Console"
          className="rounded-2xl border-2 border-teal-500 bg-slate-900 text-white p-5 shadow-2xl space-y-4 animate-in fade-in duration-300 ring-4 ring-teal-500/20"
        >
          {/* Top Bar with Live Indicator and Timer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-3.5 w-3.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                    Live Call in Progress · {activeCall.contactName}
                  </h3>
                  <span className="rounded-md bg-teal-500/20 px-2 py-0.5 text-[10px] font-semibold text-teal-300 border border-teal-500/30">
                    {activeCall.companyName}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-medium">
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
              <div className="font-mono text-2xl font-bold tracking-wider text-emerald-400 bg-slate-950 px-4 py-1.5 rounded-xl border border-slate-800 shadow-inner">
                {formatTimer(callSeconds)}
              </div>
            </div>
          </div>

          {/* Telephony Route Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-950/70 p-3 rounded-xl border border-slate-800">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Agent Handset</span>
              <span className="font-mono text-slate-200 font-medium">{activeCall.sharedAgentPhone}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Virtual ExoPhone</span>
              <span className="font-mono text-teal-300 font-medium">{activeCall.callerId}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer Target</span>
              <span className="font-mono text-slate-200 font-bold">{activeCall.customerPhone}</span>
            </div>
          </div>

          {/* Quick Disposition Selection */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
              Select Call Outcome / Disposition:
            </label>
            <div className="flex flex-wrap gap-2">
              {['Interested', 'Follow-up set', 'Demo scheduled', "Didn't pick", 'Not Interested'].map((disp) => {
                const selected = inCallOutcome === disp;
                return (
                  <button
                    key={disp}
                    type="button"
                    onClick={() => setInCallOutcome(disp)}
                    className={`cursor-pointer rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                      selected
                        ? 'bg-teal-600 text-white shadow-md ring-2 ring-teal-400 ring-offset-2 ring-offset-slate-900'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {disp}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scheduled Follow-up Date */}
          {(inCallOutcome === 'Interested' || inCallOutcome === 'Follow-up set' || inCallOutcome === 'Demo scheduled') ? (
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-300 font-semibold whitespace-nowrap">
                Scheduled Next Follow-up:
              </label>
              <input
                type="date"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
                value={inCallFollowUp}
                onChange={(e) => setInCallFollowUp(e.target.value)}
              />
            </div>
          ) : null}

          {/* Live In-Call Notes Field */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-1">
              Live In-Call Notes:
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none min-h-[4.5rem]"
              value={inCallNotes}
              onChange={(e) => setInCallNotes(e.target.value)}
              placeholder="Capture client requirements, budget range, questions, or next action items in real-time..."
            />
          </div>

          {/* Hangup / End Call Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-slate-400">
              Ending will finalize call duration, bind audio recording, and update lead pipeline status.
            </p>
            <button
              type="button"
              onClick={() => void handleCompleteCall()}
              disabled={completingCall}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-rose-500 disabled:opacity-50"
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

      {/* Caller Performance Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Queue Total</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{contactsList.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Assigned client leads</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-2xs">
          <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Due Today</p>
          <p className="mt-1 text-2xl font-black text-amber-900">{dueTodayContacts.length}</p>
          <p className="text-[10px] text-amber-700 mt-0.5">Scheduled follow-ups</p>
        </div>
        <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 shadow-2xs">
          <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">Fresh Leads</p>
          <p className="mt-1 text-2xl font-black text-teal-900">{freshContacts.length}</p>
          <p className="text-[10px] text-teal-700 mt-0.5">Awaiting first call</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Calls Today</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{todayCallsCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Logged outbound calls</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs col-span-2 sm:col-span-1">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Recorded</p>
          <p className="mt-1 text-2xl font-black text-teal-800">{callLogs.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Archived call sessions</p>
        </div>
      </div>

      {/* Queue Tabs & Search Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('due_today')}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'due_today'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Due Today ({dueTodayContacts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fresh')}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'fresh'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Fresh Leads ({freshContacts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('in_progress')}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'in_progress'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            In-Progress ({inProgressContacts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('retry')}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'retry'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Didn&apos;t Pick ({retryContacts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'all'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Contacts ({contactsList.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              loadRecentCalls();
            }}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Call History & Recordings ({callLogs.length})
          </button>
        </div>

        {activeTab !== 'history' ? (
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search contact, company, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-600 focus:outline-none shadow-2xs"
            />
          </div>
        ) : null}
      </div>

      {/* TAB CONTENT: CONTACTS CALL QUEUE */}
      {activeTab !== 'history' ? (
        filteredQueue.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
            <svg className="mx-auto h-8 w-8 text-slate-400 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <h4 className="text-sm font-bold text-slate-700">No contacts in this queue</h4>
            <p className="mt-1 text-xs text-slate-500">
              {search
                ? 'Try clearing the search filter.'
                : 'Great job! You have cleared this section of your call queue.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-bold">Contact & Role</th>
                    <th className="px-4 py-3 font-bold">Company & Stage</th>
                    <th className="px-4 py-3 font-bold">Phone Number</th>
                    <th className="px-4 py-3 font-bold">Current Status</th>
                    <th className="px-4 py-3 font-bold">Next Follow-up</th>
                    <th className="px-4 py-3 font-bold text-right">Quick Dial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQueue.map((contact) => {
                    const co = contact.companyId ? companyMap.get(contact.companyId) : null;
                    const isDue = contact.nextFollowUp && contact.nextFollowUp <= todayIST;
                    const isCalling = startingCallContactId === contact.id;

                    return (
                      <tr key={contact.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            {contact.contactName}
                            {contact.champion ? (
                              <span className="rounded-md bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                                Key
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-slate-500">{contact.role || 'Primary Contact'}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-slate-800 block">
                            {co?.companyName || '—'}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500">
                            {co?.stage || 'New Lead'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-slate-700 font-semibold">
                            {contact.phone || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusColor(
                              contact.contactStatus
                            )}`}
                          >
                            {contact.contactStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {contact.nextFollowUp ? (
                            <span
                              className={`font-semibold ${
                                isDue ? 'text-amber-700 font-bold' : 'text-slate-600'
                              }`}
                            >
                              {contact.nextFollowUp} {isDue ? '(Due)' : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => void handleStartCall(contact)}
                            disabled={!contact.phone || isCalling || !!activeCall}
                            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-teal-800 disabled:opacity-40"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            {isCalling ? 'Connecting…' : 'Call Lead'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* TAB CONTENT: CALL HISTORY & RECORDINGS */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Recorded Calls & Outbound History
            </h3>
            <button
              type="button"
              onClick={() => loadRecentCalls()}
              className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
            >
              Refresh recordings
            </button>
          </div>

          {loadingLogs ? (
            <p className="text-sm text-slate-500 p-4">Loading call history…</p>
          ) : callLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
              <svg className="mx-auto h-8 w-8 text-slate-400 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              <h4 className="text-sm font-bold text-slate-700">No calls recorded yet</h4>
              <p className="mt-1 text-xs text-slate-500">
                Outbound calls placed via Exotel will appear here with playable audio recordings.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {callLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-2xs space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-sm">
                        {log.contactName || 'Client Contact'}
                      </span>
                      {log.companyName ? (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {log.companyName}
                        </span>
                      ) : null}
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200">
                        {log.outcome}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                      <span>Caller: <strong className="text-slate-700">{log.callerName}</strong></span>
                      <span>·</span>
                      <time dateTime={log.occurredAt}>
                        {new Date(log.occurredAt).toLocaleString('en-IN', { timeZone: IST_TZ })}
                      </time>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
                    {log.durationSeconds != null ? (
                      <span>Duration: <strong className="text-slate-800">{formatCallDuration(log.durationSeconds)}</strong></span>
                    ) : null}
                    {log.nextFollowUpAt ? (
                      <span className="text-amber-700 font-semibold">
                        Next follow-up: {log.nextFollowUpAt}
                      </span>
                    ) : null}
                    {log.contactPhone ? (
                      <span>Phone: <strong className="font-mono text-slate-800">{log.contactPhone}</strong></span>
                    ) : null}
                  </div>

                  {log.hasRecording ? (
                    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-teal-900">
                        <span className="flex items-center gap-1.5">
                          <svg className="h-3.5 w-3.5 text-teal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="22" />
                          </svg>
                          Exotel Cloud Recording
                        </span>
                        <span className="text-[10px] text-teal-700 font-mono">8kHz PCM Stream</span>
                      </div>
                      <audio
                        className="w-full h-8 pt-0.5"
                        controls
                        preload="none"
                        src={`/api/exotel/call-logs/${log.id}/recording`}
                      />
                    </div>
                  ) : null}

                  {log.notes ? (
                    <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-slate-700">
                      <strong className="text-slate-500 block text-[10px] uppercase font-bold mb-0.5">In-Call Notes</strong>
                      {log.notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
