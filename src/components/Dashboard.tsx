import { useCallback, useEffect, useState } from 'react';
import type { CrmStore } from '../hooks/useCrmStore';
import type { CrmUser, Page } from '../types';
import { api } from '../lib/api';
import type { Project } from '../lib/projects';
import { btnPrimary, btnGhost, inputClass } from './ui';

interface DashboardProps {
  store: CrmStore;
  onNavigate: (page: Page, companyId?: string | null) => void;
  canManageUsers?: boolean;
  brandName?: string;
  userRole?: string;
}

export function Dashboard({
  store,
  onNavigate,
  canManageUsers,
  brandName = 'Skylance CRM',
  userRole,
}: DashboardProps) {
  const { metrics } = store;
  const today = new Date().toISOString().slice(0, 10);
  const isCaller = userRole === 'sdr';
  const isAdmin = userRole === 'admin' || userRole === 'founder';

  const [unassignedProjects, setUnassignedProjects] = useState<Project[]>([]);
  const [developers, setDevelopers] = useState<CrmUser[]>([]);
  const [assignDevMap, setAssignDevMap] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string>('');

  const loadDistributionQueue = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [projRes, userRes] = await Promise.all([
        api<{ projects: Project[] }>('/api/projects'),
        api<{ users: CrmUser[] }>('/api/users'),
      ]);
      setUnassignedProjects(projRes.projects.filter((p) => p.status === 'awaiting_assignment' || !p.developerId));
      setDevelopers(userRes.users.filter((u) => u.role === 'developer'));
    } catch {
      // silently fallback
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadDistributionQueue();
  }, [loadDistributionQueue]);

  const handleQuickAssign = async (projectId: string) => {
    const devId = assignDevMap[projectId];
    if (!devId) return;
    setAssigningId(projectId);
    setAssignSuccess('');
    try {
      await api(`/api/projects/${projectId}/assignment`, {
        method: 'PATCH',
        body: JSON.stringify({ developerId: devId }),
      });
      const assignedDev = developers.find((d) => d.id === devId);
      setAssignSuccess(`Assigned to ${assignedDev?.name || 'Developer'} successfully!`);
      await loadDistributionQueue();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to assign developer');
    } finally {
      setAssigningId(null);
    }
  };

  const newLeads = store.companies.filter((c) => c.stage === 'New Lead' || c.stage === 'Lead Added').length;
  const followUpsDueToday = store.companies.filter((c) => c.nextFollowUp === today).length;
  const qualifiedLeads = store.companies.filter((c) => c.stage === 'Qualified').length;
  const handoffsSubmitted = store.companies.filter((c) => c.stage === 'Handoff Submitted').length;
  const convertedProjects = store.companies.filter((c) => c.stage === 'Converted' || c.stage === 'Closed Won').length;
  const notInterested = store.companies.filter((c) => c.stage === 'Not Interested' || c.stage === 'Closed Lost').length;

  const summary = isCaller
    ? [
        { label: 'My Leads', value: store.companies.length, tone: 'border-l-sky-500' },
        { label: 'Follow-ups Today', value: followUpsDueToday, tone: 'border-l-amber-500' },
        { label: 'Qualified', value: qualifiedLeads, tone: 'border-l-teal-500' },
        { label: 'Handoffs Submitted', value: handoffsSubmitted, tone: 'border-l-purple-500' },
        { label: 'Converted', value: convertedProjects, tone: 'border-l-emerald-500' },
      ]
    : [
        { label: 'Total Leads', value: metrics.totalCompanies, tone: 'border-l-sky-500' },
        { label: 'Total Contacts', value: metrics.totalContacts, tone: 'border-l-indigo-500' },
        { label: 'Qualified Leads', value: qualifiedLeads, tone: 'border-l-teal-500' },
        { label: 'Pending Handoffs', value: handoffsSubmitted, tone: 'border-l-purple-500' },
        { label: 'Converted Projects', value: convertedProjects, tone: 'border-l-emerald-500' },
      ];

  const panels = [
    {
      title: 'New Inbound Leads',
      count: newLeads,
      blurb: 'Ad leads waiting for qualification and consultation',
      accent: 'text-sky-600',
      action: () => onNavigate('pipeline'),
    },
    {
      title: 'Follow-ups Due Today',
      count: followUpsDueToday,
      blurb: 'Scheduled client follow-ups due today',
      accent: 'text-amber-600',
      action: () => onNavigate('pipeline'),
    },
    {
      title: 'Qualified Leads',
      count: qualifiedLeads,
      blurb: 'Client requirements confirmed, ready for quotation/handoff',
      accent: 'text-teal-600',
      action: () => onNavigate('pipeline'),
    },
    {
      title: 'Handoffs Submitted',
      count: handoffsSubmitted,
      blurb: 'Requirements submitted for Admin review and developer assignment',
      accent: 'text-purple-600',
      action: () => onNavigate('handoffs'),
    },
    {
      title: 'Converted Projects',
      count: convertedProjects,
      blurb: 'Approved opportunities in active development delivery',
      accent: 'text-emerald-600',
      action: () => onNavigate('projects'),
    },
    {
      title: 'Not Interested',
      count: notInterested,
      blurb: 'Declined or unsuitable inbound leads',
      accent: 'text-slate-400',
      action: () => onNavigate('pipeline'),
    },
  ];

  const dueToday = store.companies.filter((c) => c.nextFollowUp === today);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
            {brandName} · Operations Brief
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Dashboard
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
            Work today&apos;s follow-up queue, advance leads through qualification, track project
            milestones, and manage final settlements.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {canManageUsers ? (
            <button type="button" className={btnGhost} onClick={() => onNavigate('users')}>
              Manage Users
            </button>
          ) : null}
          <button type="button" className={btnGhost} onClick={() => onNavigate('import')}>
            Import Leads
          </button>
          <button type="button" className={btnGhost} onClick={() => onNavigate('contacts')}>
            Contacts
          </button>
          <button type="button" className={btnPrimary} onClick={() => onNavigate('pipeline')}>
            Open Pipeline →
          </button>
        </div>
      </header>

      {/* Converted Leads Distribution Queue */}
      {isAdmin && unassignedProjects.length > 0 ? (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white shadow-xs">
                ⚡
              </span>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-amber-950">
                  Project Distribution Queue ({unassignedProjects.length})
                </h2>
                <p className="text-xs text-amber-800">
                  Converted leads requiring distribution to an available developer.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {assignSuccess ? (
                <span className="rounded-full bg-teal-100 border border-teal-200 px-3 py-1 text-xs font-bold text-teal-800">
                  ✓ {assignSuccess}
                </span>
              ) : null}
              <span className="rounded-full bg-amber-200/90 px-3 py-1 text-xs font-extrabold text-amber-950">
                Action Required
              </span>
            </div>
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
                      {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(p.createdAt))}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-slate-900">{p.title}</h3>
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-950 font-medium">
                    📢 <strong className="text-amber-950">{p.callerName || 'A caller'}</strong> has converted this project. Assign this project to an available developer.
                  </div>
                  {p.description ? (
                    <p className="mt-2 text-xs text-slate-600 line-clamp-2">{p.description}</p>
                  ) : null}
                </div>

                <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Select developer for ${p.title}`}
                    className={`${inputClass} flex-1 text-xs`}
                    value={assignDevMap[p.id] ?? ''}
                    onChange={(e) => setAssignDevMap((prev) => ({ ...prev, [p.id]: e.target.value }))}
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
                    disabled={!assignDevMap[p.id] || assigningId === p.id}
                    onClick={() => void handleQuickAssign(p.id)}
                  >
                    {assigningId === p.id ? 'Assigning…' : 'Assign to Developer →'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Primary KPI Metrics */}
      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {summary.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-xs transition hover:shadow-sm ${s.tone}`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {s.label}
            </p>
            <p className="mt-1.5 text-3xl font-extrabold tracking-tight text-slate-900">
              {s.value}
            </p>
          </div>
        ))}
      </section>

      {/* Stage Progression Cards */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
          Pipeline Funnel Status
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {panels.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={p.action}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-xs transition hover:border-teal-500 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-slate-900 transition group-hover:text-teal-700">
                    {p.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{p.blurb}</p>
                </div>
                <span className={`text-3xl font-extrabold ${p.accent} transition group-hover:scale-105`}>
                  {p.count}
                </span>
              </div>
              <span className="mt-4 inline-flex items-center text-xs font-semibold text-teal-700 group-hover:underline">
                View leads →
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Follow-ups Due Today */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Follow-ups Due Today
            </h2>
            <p className="text-xs text-slate-500">Leads scheduled for a check-in call or quote follow-up today</p>
          </div>
          <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
            {today}
          </span>
        </div>
        {dueToday.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No follow-ups due today — you&apos;re completely up to date.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dueToday.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 py-3.5 hover:bg-slate-50/50 px-2 rounded-lg transition">
                <div>
                  <p className="text-sm font-bold text-slate-900">{c.companyName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    <span className="inline-block rounded-sm bg-slate-100 px-1.5 py-0.2 font-medium text-slate-700">{c.stage}</span>
                    {c.intent ? ` · Intent: ${c.intent}` : ''}
                    {c.location ? ` · ${c.location}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100 cursor-pointer"
                  onClick={() => onNavigate('pipeline', c.id)}
                >
                  Open Lead →
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Agency Workflow Ritual Card */}
      <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/60 to-slate-50 p-6 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">✓</span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-900">Standard Agency Workflow</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs leading-relaxed text-slate-700">
          <div className="rounded-xl border border-teal-100 bg-white/80 p-3.5 shadow-2xs">
            <b className="text-teal-800">1. Intake Ad Calls</b>
            <p className="mt-1 text-slate-500">Log caller details, project needs, and register lead in New Leads stage.</p>
          </div>
          <div className="rounded-xl border border-teal-100 bg-white/80 p-3.5 shadow-2xs">
            <b className="text-teal-800">2. Upload Quotation</b>
            <p className="mt-1 text-slate-500">Attach client quote PDFs directly to the lead. Kept strictly private to sales & admin.</p>
          </div>
          <div className="rounded-xl border border-teal-100 bg-white/80 p-3.5 shadow-2xs">
            <b className="text-teal-800">3. Submit Handoff</b>
            <p className="mt-1 text-slate-500">Once qualified (Interested), submit requirements to Admin queue for assignment.</p>
          </div>
          <div className="rounded-xl border border-teal-100 bg-white/80 p-3.5 shadow-2xs">
            <b className="text-teal-800">4. Admin Review & Assign</b>
            <p className="mt-1 text-slate-500">Admin reviews scope and assigns trusted developer to execute.</p>
          </div>
          <div className="rounded-xl border border-teal-100 bg-white/80 p-3.5 shadow-2xs">
            <b className="text-teal-800">5. Tech Evaluation & Build</b>
            <p className="mt-1 text-slate-500">Developer submits stack feasibility and logs weekly progress updates (0–100%).</p>
          </div>
          <div className="rounded-xl border border-teal-100 bg-white/80 p-3.5 shadow-2xs">
            <b className="text-teal-800">6. Final Settlement</b>
            <p className="mt-1 text-slate-500">Admin records agreed and received amounts in the private final settlement card.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
