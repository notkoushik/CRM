import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Project, ProjectTask, ProjectEnvironment, ProjectUpdate } from '../../lib/projects';
import { api } from '../../lib/api';
import { DocumentPanel } from '../Projects';
import { Field, inputClass, btnPrimary, btnGhost } from '../ui';

interface DeveloperConsoleProps {
  project: Project;
  userRole: string;
  onRefresh: () => Promise<void>;
}

type TabKey = 'overview' | 'tasks' | 'rfc' | 'environments' | 'documents' | 'activity';

const TASK_CATEGORIES = [
  { id: 'architecture', label: 'Architecture & Schema' },
  { id: 'backend', label: 'Core Backend & API' },
  { id: 'frontend', label: 'Client UI & State' },
  { id: 'database', label: 'Database & Migrations' },
  { id: 'integrations', label: 'Integrations & Webhooks' },
  { id: 'devops', label: 'CI/CD & Cloud Deploy' },
  { id: 'qa', label: 'QA, Security & E2E' },
] as const;

const PRIORITIES = [
  { id: 'p0', label: 'P0 Blocker', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'p1', label: 'P1 High', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'p2', label: 'P2 Normal', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { id: 'p3', label: 'P3 Low', color: 'bg-slate-50 text-slate-500 border-slate-200' },
] as const;

export function DeveloperConsole({ project, userRole, onRefresh }: DeveloperConsoleProps) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [environments, setEnvironments] = useState<ProjectEnvironment[]>([]);
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modals & Drafts
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskDraft, setTaskDraft] = useState({
    title: '',
    description: '',
    category: 'backend' as ProjectTask['category'],
    priority: 'p2' as ProjectTask['priority'],
    estimatedHours: 8,
  });

  const [showRfcModal, setShowRfcModal] = useState(false);
  const [rfcDraft, setRfcDraft] = useState({
    frontendHours: 32,
    backendHours: 40,
    infraHours: 12,
    qaHours: 16,
    schemaProposal: `-- PostgreSQL Schema Proposal\nCREATE TABLE app_users (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  email TEXT UNIQUE NOT NULL,\n  role TEXT NOT NULL DEFAULT 'member',\n  created_at TIMESTAMPTZ DEFAULT now()\n);`,
    riskMatrix: [
      { risk: 'Third-party API rate limits', severity: 'medium' as const, mitigation: 'Implement Redis caching with exponential backoff' },
      { risk: 'Client OAuth credentials pending', severity: 'high' as const, mitigation: 'Use mock provider sandbox until prod keys issued' },
    ],
    status: 'submitted' as const,
  });

  const [showTopologyModal, setShowTopologyModal] = useState(false);
  const [topologyDraft, setTopologyDraft] = useState({
    repoUrl: project.githubRepoUrl || '',
    cloneUrlSsh: `git@github.com:skylance/${project.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.git`,
    cloneUrlHttps: project.githubRepoUrl || `https://github.com/skylance/${project.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.git`,
    activeBranch: 'dev',
    defaultBranch: 'main',
    frontendFramework: 'Next.js 15 (App Router)',
    frontendPort: 3000,
    backendFramework: 'Node.js / Express TypeScript',
    backendPort: 5000,
    databaseEngine: project.databaseEngine || 'PostgreSQL 16',
    databasePort: 5432,
    cacheEngine: 'Redis 7.2 (Valkey)',
  });

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const loadAll = useCallback(async () => {
    try {
      const [tasksRes, envsRes, detailRes] = await Promise.all([
        api<{ tasks: ProjectTask[] }>(`/api/projects/${project.id}/tasks`),
        api<{ environments: ProjectEnvironment[] }>(`/api/projects/${project.id}/environments`),
        api<{ updates: ProjectUpdate[] }>(`/api/projects/${project.id}`),
      ]);
      setTasks(tasksRes.tasks || []);
      setEnvironments(envsRes.environments || []);
      setUpdates(detailRes.updates || []);
    } catch {
      // Graceful fallback
    }
  }, [project.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Task Actions
  const createTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskDraft.title.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ task: ProjectTask }>(`/api/projects/${project.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify(taskDraft),
      });
      setTasks((prev) => [...prev, res.task]);
      setShowTaskModal(false);
      setTaskDraft({ title: '', description: '', category: 'backend', priority: 'p2', estimatedHours: 8 });
      void onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: ProjectTask['status']) => {
    try {
      await api<{ ok: boolean; task: ProjectTask }>(`/api/projects/${project.id}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
      void onRefresh();
    } catch {
      // rollback
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await api(`/api/projects/${project.id}/tasks/${taskId}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      // ignore
    }
  };

  // Lifecycle Status Action
  const setProjectStatus = async (newStatus: string) => {
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      await onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update project status');
    } finally {
      setBusy(false);
    }
  };

  // Save RFC
  const saveRfc = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/rfc`, {
        method: 'PATCH',
        body: JSON.stringify({ rfcSpec: rfcDraft }),
      });
      const totalHours = rfcDraft.frontendHours + rfcDraft.backendHours + rfcDraft.infraHours + rfcDraft.qaHours;
      await api(`/api/projects/${project.id}/evaluations`, {
        method: 'POST',
        body: JSON.stringify({
          feasibility: 'feasible',
          suggestedTechnology: project.preferredTechnology || 'PostgreSQL, Node.js, Next.js',
          databaseEngine: project.databaseEngine || 'PostgreSQL',
          githubRepoUrl: project.githubRepoUrl || '',
          liveUrl: project.liveUrl || '',
          techStack: project.techStack || 'Next.js, Node.js, TypeScript',
          estimatedEffort: `${Math.ceil(totalHours / 40)} Weeks (${totalHours}h)`,
          technicalRequirements: rfcDraft.schemaProposal.slice(0, 200),
          clarificationQuestions: '',
          notes: `Architecture RFC submitted. Total estimated effort: ${totalHours}h across FE (${rfcDraft.frontendHours}h), BE (${rfcDraft.backendHours}h), Infra (${rfcDraft.infraHours}h), QA (${rfcDraft.qaHours}h).`,
        }),
      });
      setShowRfcModal(false);
      void onRefresh();
    } finally {
      setBusy(false);
    }
  };

  // Save Topology
  const saveTopology = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/topology`, {
        method: 'PATCH',
        body: JSON.stringify({
          repoMetadata: {
            cloneUrlSsh: topologyDraft.cloneUrlSsh,
            cloneUrlHttps: topologyDraft.cloneUrlHttps,
            defaultBranch: topologyDraft.defaultBranch,
            activeBranch: topologyDraft.activeBranch,
          },
          serviceTopology: {
            frontend: { framework: topologyDraft.frontendFramework, port: topologyDraft.frontendPort, runScript: 'npm run dev:web' },
            backend: { framework: topologyDraft.backendFramework, port: topologyDraft.backendPort, runScript: 'npm run dev:api' },
            database: { engine: topologyDraft.databaseEngine, port: topologyDraft.databasePort, migrationRunner: 'npm run db:migrate' },
            cache: { engine: topologyDraft.cacheEngine, port: 6379 },
          },
        }),
      });
      await api(`/api/projects/${project.id}/tech-specs`, {
        method: 'PATCH',
        body: JSON.stringify({
          githubRepoUrl: topologyDraft.repoUrl,
          databaseEngine: topologyDraft.databaseEngine,
        }),
      });
      setShowTopologyModal(false);
      void onRefresh();
    } finally {
      setBusy(false);
    }
  };

  // Metrics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const totalEstimatedHours = tasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 0), 0);
  const sprintProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const stagingEnv = environments.find((e) => e.envType === 'staging');
  const prodEnv = environments.find((e) => e.envType === 'production');

  return (
    <div className="space-y-6">
      {/* ─── Top Level Console Header ───────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-100 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold tracking-widest text-teal-400 uppercase">
                PROJ-{project.id.slice(0, 6)}
              </span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-xs text-slate-400">{project.projectType}</span>
              <span className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-teal-300">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
                {project.status?.toUpperCase() ?? 'ACTIVE'}
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {project.title}
            </h2>
            <p className="font-mono text-xs text-slate-400">
              Client: <strong className="text-slate-200">{project.clientBusiness}</strong> · Assigned Dev: <strong className="text-slate-200">{project.developerName || 'Unassigned'}</strong> · Converted by: <strong className="text-slate-200">{project.callerName || 'Agency'}</strong>
            </p>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {project.githubRepoUrl ? (
              <a
                href={project.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs font-bold text-slate-200 shadow-sm hover:border-slate-500 hover:bg-slate-800 transition"
              >
                <span>GitHub Repo</span>
                <span className="text-slate-400">↗</span>
              </a>
            ) : null}
            {stagingEnv?.url || project.liveUrl ? (
              <a
                href={stagingEnv?.url || project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs font-bold text-emerald-300 shadow-sm hover:bg-emerald-500/20 transition"
              >
                <span>Staging Preview</span>
                <span className="text-emerald-400">↗</span>
              </a>
            ) : null}
            {prodEnv?.url ? (
              <a
                href={prodEnv.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 font-mono text-xs font-bold text-purple-300 shadow-sm hover:bg-purple-500/20 transition"
              >
                <span>Prod Live</span>
                <span className="text-purple-400">↗</span>
              </a>
            ) : null}
            {project.status === 'assigned' ? (
              <button
                type="button"
                onClick={() => void setProjectStatus('in_evaluation')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/50 bg-teal-500/20 px-3 py-1.5 font-mono text-xs font-bold text-teal-300 hover:bg-teal-500/30 transition cursor-pointer"
              >
                Start Evaluation
              </button>
            ) : null}
            {['assigned', 'in_evaluation', 'clarification_required'].includes(project.status) ? (
              <button
                type="button"
                onClick={() => setShowRfcModal(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 font-mono text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition cursor-pointer"
              >
                Submit RFC Spec
              </button>
            ) : null}
            {project.status === 'approved' ? (
              <button
                type="button"
                onClick={() => void setProjectStatus('in_progress')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-3 py-1.5 font-mono text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition cursor-pointer"
              >
                Begin Sprint
              </button>
            ) : null}
            {project.status === 'in_progress' && completedTasks > 0 && completedTasks === totalTasks ? (
              <button
                type="button"
                onClick={() => void setProjectStatus('completed')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-1.5 font-mono text-xs font-bold text-white hover:bg-emerald-500 transition cursor-pointer"
              >
                Complete Project
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => copyToClipboard(`git clone ${project.githubRepoUrl || 'https://github.com/skylance/repo.git'}`, 'clone')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs font-semibold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
            >
              <span>{copiedKey === 'clone' ? '✓ Copied' : 'Clone URL'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTaskModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500 bg-teal-600 px-3 py-1.5 font-mono text-xs font-bold text-white shadow-sm hover:bg-teal-500 transition cursor-pointer"
            >
              <span>+ Add Ticket</span>
            </button>
          </div>
        </div>

        {/* Console Health & Sprint Bar */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-800/80 pt-4 sm:grid-cols-4">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">Sprint Velocity</p>
            <p className="mt-0.5 font-mono text-base font-black text-white">
              {completedTasks}/{totalTasks} Tickets <span className="text-xs font-normal text-slate-400">({sprintProgress}%)</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">Effort Allocated</p>
            <p className="mt-0.5 font-mono text-base font-black text-teal-400">
              {totalEstimatedHours} <span className="text-xs font-normal text-slate-400">hrs</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">Primary Database</p>
            <p className="mt-0.5 font-mono text-base font-black text-purple-300">
              {project.databaseEngine || 'PostgreSQL 16'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">Target Release</p>
            <p className="mt-0.5 font-mono text-base font-black text-amber-400">
              {project.expectedTimeline || 'Sprint Cycle 1'}
            </p>
          </div>
        </div>
      </section>

      {/* ─── Navigation Tabs Bar ───────────────────────────────────────────── */}
      <nav className="flex space-x-1 overflow-x-auto border-b border-slate-200 pb-px text-xs font-bold">
        {[
          { id: 'overview' as const, label: 'Topology & Overview' },
          { id: 'tasks' as const, label: `Engineering Tasks (${completedTasks}/${totalTasks})` },
          { id: 'rfc' as const, label: 'Architecture & RFC' },
          { id: 'environments' as const, label: 'Environments & Git' },
          { id: 'documents' as const, label: 'Contractual Scope & Docs' },
          { id: 'activity' as const, label: 'Deployment Terminal Log' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap px-4 py-2.5 font-mono transition cursor-pointer border-b-2 ${
              tab === t.id
                ? 'border-teal-600 text-teal-700 font-bold bg-teal-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ─── TAB 1: Topology & Overview ────────────────────────────────────── */}
      {tab === 'overview' ? (
        <div className="space-y-6">
          {/* Service Topology Grid */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-extrabold tracking-wider text-slate-800 uppercase">
                Service & Runtime Topology
              </h3>
              <button
                type="button"
                onClick={() => setShowTopologyModal(true)}
                className="font-mono text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
              >
                Configure Topology →
              </button>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">Frontend Web</span>
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <p className="mt-1.5 font-mono text-sm font-bold text-slate-900">React / Next.js 15</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">Port :3000 · Tailwind v4</p>
                <div className="mt-3 rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600 border border-slate-200/60">
                  npm run dev:web
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">API Backend</span>
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <p className="mt-1.5 font-mono text-sm font-bold text-slate-900">Node.js Express TS</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">Port :5000 · REST /api/v1</p>
                <div className="mt-3 rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600 border border-slate-200/60">
                  npm run dev:api
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">Database</span>
                  <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
                </div>
                <p className="mt-1.5 font-mono text-sm font-bold text-slate-900">{project.databaseEngine || 'PostgreSQL 16'}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">Port :5432 · Migrations Active</p>
                <div className="mt-3 rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600 border border-slate-200/60">
                  npm run db:migrate
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">Cache & Storage</span>
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                </div>
                <p className="mt-1.5 font-mono text-sm font-bold text-slate-900">Redis 7 + AWS S3</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">Session store & Upload bucket</p>
                <div className="mt-3 rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600 border border-slate-200/60">
                  STORAGE_BUCKET=crm-uploads
                </div>
              </div>
            </div>
          </section>

          {/* Third-Party Integration Readiness Matrix */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
            <h4 className="font-mono text-xs font-extrabold tracking-wider text-slate-800 uppercase">
              External API & Infrastructure Readiness Matrix
            </h4>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { name: 'Database Cluster', status: 'Active (Verified)', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
                { name: 'Storage / S3 Bucket', status: 'Ready (Local/S3)', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
                { name: 'Payment Webhook', status: 'Pending Client API Key', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
                { name: 'Auth / OAuth Provider', status: 'Configured (JWT/OAuth)', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
              ].map((item) => (
                <div key={item.name} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <p className="font-mono text-xs font-bold text-slate-900">{item.name}</p>
                  <span className={`mt-1.5 inline-block rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${item.tone}`}>
                    ● {item.status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Contractual Scope Baseline Summary */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h4 className="font-mono text-xs font-extrabold tracking-wider text-slate-800 uppercase">
                Contractual Scope & Deliverables
              </h4>
              <button
                type="button"
                onClick={() => setTab('documents')}
                className="font-mono text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
              >
                View Attached Quotation Briefs (Full PDF) →
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="font-mono text-[11px] font-bold text-slate-500 uppercase">Functional Requirements</p>
                <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800 border border-slate-200/70 whitespace-pre-wrap">
                  {project.functionalRequirements || 'Functional specifications detailed in client handoff.'}
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-mono text-[11px] font-bold text-slate-500 uppercase">Project Scope & Deliverables</p>
                <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800 border border-slate-200/70 whitespace-pre-wrap">
                  {project.description || 'Deliverables and scope agreed with the client.'}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {/* ─── TAB 2: Engineering Tasks (WBS Ticket Board) ───────────────────── */}
      {tab === 'tasks' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-mono text-sm font-extrabold text-slate-900 uppercase">
                Work Breakdown Structure (WBS)
              </h3>
              <p className="text-xs text-slate-500">
                Engineering deliverables organized by architectural phases with priority and estimation tracking.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTaskModal(true)}
              className={btnPrimary}
            >
              + Create Engineering Ticket
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
              <p className="font-mono text-sm font-bold text-slate-600">No engineering tickets created yet.</p>
              <p className="mt-1 text-xs text-slate-400">Break this project down into architecture, API, UI, and QA tickets.</p>
              <button
                type="button"
                onClick={() => setShowTaskModal(true)}
                className="mt-4 rounded-lg bg-teal-600 px-4 py-2 font-mono text-xs font-bold text-white shadow-sm hover:bg-teal-700"
              >
                + Add First Ticket
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left font-mono text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Phase / Domain</th>
                    <th className="px-4 py-3">Deliverable & Task</th>
                    <th className="px-4 py-3">Est. Hours</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((task) => {
                    const prio = PRIORITIES.find((p) => p.id === task.priority) || PRIORITIES[2];
                    return (
                      <tr key={task.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold ${prio.color}`}>
                            {prio.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 uppercase text-[11px]">
                          {task.category}
                        </td>
                        <td className="px-4 py-3">
                          <p className={`font-bold text-slate-900 ${task.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
                            {task.title}
                          </p>
                          {task.description ? (
                            <p className="text-[11px] text-slate-500 font-sans mt-0.5 line-clamp-1">{task.description}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {task.estimatedHours} hrs
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={task.status}
                            onChange={(e) => void updateTaskStatus(task.id, e.target.value as ProjectTask['status'])}
                            className={`rounded-md border px-2 py-1 text-[11px] font-bold cursor-pointer ${
                              task.status === 'completed'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : task.status === 'in_progress'
                                ? 'border-blue-300 bg-blue-50 text-blue-800'
                                : task.status === 'in_review'
                                ? 'border-amber-300 bg-amber-50 text-amber-800'
                                : 'border-slate-200 bg-slate-50 text-slate-600'
                            }`}
                          >
                            <option value="todo">Todo</option>
                            <option value="in_progress">In Progress</option>
                            <option value="in_review">In Review</option>
                            <option value="completed">Completed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void deleteTask(task.id)}
                            className="text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Delete ticket"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* ─── TAB 3: Architecture & RFC ─────────────────────────────────────── */}
      {tab === 'rfc' ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm font-extrabold text-slate-900 uppercase">
                Technical Design Document & RFC Proposal
              </h3>
              <p className="text-xs text-slate-500">
                Architectural specification, database schema DDL, effort hours matrix, and risk analysis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRfcModal(true)}
              className={btnPrimary}
            >
              Edit RFC Proposal
            </button>
          </div>

          {/* Effort Hours Breakdown Matrix */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
            <h4 className="font-mono text-xs font-extrabold tracking-wider text-slate-800 uppercase">
              Effort Hours Allocation Matrix
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 font-mono text-center">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Frontend UI</p>
                <p className="mt-1 text-lg font-black text-slate-900">{rfcDraft.frontendHours} hrs</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Backend APIs</p>
                <p className="mt-1 text-lg font-black text-slate-900">{rfcDraft.backendHours} hrs</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase">DevOps & Cloud</p>
                <p className="mt-1 text-lg font-black text-slate-900">{rfcDraft.infraHours} hrs</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase">QA & Testing</p>
                <p className="mt-1 text-lg font-black text-slate-900">{rfcDraft.qaHours} hrs</p>
              </div>
              <div className="rounded-lg border border-teal-300 bg-teal-50/70 p-3">
                <p className="text-[10px] font-bold text-teal-800 uppercase">Total Engineering</p>
                <p className="mt-1 text-lg font-black text-teal-900">
                  {rfcDraft.frontendHours + rfcDraft.backendHours + rfcDraft.infraHours + rfcDraft.qaHours} hrs
                </p>
              </div>
            </div>
          </section>

          {/* Database Schema DDL */}
          <section className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-xl space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-mono text-xs font-bold text-teal-400 uppercase">
                Proposed Database DDL Schema
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(rfcDraft.schemaProposal, 'ddl')}
                className="font-mono text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                {copiedKey === 'ddl' ? '✓ Copied' : 'Copy DDL'}
              </button>
            </div>
            <pre className="font-mono text-xs text-emerald-300 overflow-x-auto p-2 bg-slate-900 rounded-lg">
              {rfcDraft.schemaProposal}
            </pre>
          </section>

          {/* Risk Mitigation Matrix */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
            <h4 className="font-mono text-xs font-extrabold tracking-wider text-slate-800 uppercase">
              Technical Risk Analysis & Mitigation Strategy
            </h4>
            <div className="space-y-2 font-mono text-xs">
              {rfcDraft.riskMatrix.map((item, idx) => (
                <div key={idx} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div>
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase mr-2 ${
                      item.severity === 'high' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {item.severity} Risk
                    </span>
                    <strong className="text-slate-900">{item.risk}</strong>
                  </div>
                  <p className="text-slate-600 font-sans text-xs">
                    <strong className="font-mono text-slate-800">Mitigation:</strong> {item.mitigation}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {/* ─── TAB 4: Environments & Git ─────────────────────────────────────── */}
      {tab === 'environments' ? (
        <div className="space-y-6">
          {/* Git Command Center */}
          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="font-mono text-xs font-bold text-teal-400 uppercase">
                Git Repository & Branch Control
              </span>
              <span className="font-mono text-xs text-slate-400">
                Default: <strong className="text-white">main</strong> · Active: <strong className="text-teal-400">dev</strong>
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 font-mono text-xs">
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-bold">SSH Clone Command</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-slate-200">{topologyDraft.cloneUrlSsh}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`git clone ${topologyDraft.cloneUrlSsh}`, 'ssh')}
                    className="text-xs text-teal-400 hover:text-teal-300 cursor-pointer"
                  >
                    {copiedKey === 'ssh' ? '✓' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-bold">HTTPS Clone Command</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-slate-200">{topologyDraft.cloneUrlHttps}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`git clone ${topologyDraft.cloneUrlHttps}`, 'https')}
                    className="text-xs text-teal-400 hover:text-teal-300 cursor-pointer"
                  >
                    {copiedKey === 'https' ? '✓' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Environment Cards */}
          <section className="grid gap-4 sm:grid-cols-3">
            {environments.map((env) => (
              <div key={env.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-2.5 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 uppercase">{env.label}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    env.healthStatus === 'healthy' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                  }`}>
                    ● {env.healthStatus?.toUpperCase() ?? 'ACTIVE'}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <p className="text-slate-500">Branch: <strong className="text-slate-800">{env.branch}</strong></p>
                  <p className="truncate text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-100">{env.url}</p>
                  <p className="text-[11px] text-slate-400">{env.notes}</p>
                </div>
                {env.url ? (
                  <a
                    href={env.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline"
                  >
                    Open Environment ↗
                  </a>
                ) : null}
              </div>
            ))}
          </section>
        </div>
      ) : null}

      {/* ─── TAB 5: Contractual Scope & Documents ──────────────────────────── */}
      {tab === 'documents' ? (
        <div className="space-y-4">
          <DocumentPanel parent={{ projectId: project.id }} userRole={userRole} />
        </div>
      ) : null}

      {/* ─── TAB 6: Terminal Activity Stream ───────────────────────────────── */}
      {tab === 'activity' ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-6 font-mono text-xs text-slate-300 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="font-bold text-teal-400 uppercase tracking-wider">
              Deployment & Engineering Event Stream
            </span>
            <span className="text-[11px] text-slate-500">Auto-synced with project events</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-96 pr-2">
            {updates.length === 0 ? (
              <p className="text-slate-500 italic">No engineering events logged yet.</p>
            ) : (
              updates.map((u) => (
                <div key={u.id} className="flex items-start gap-3 rounded bg-slate-900/60 p-2.5 border border-slate-800/80">
                  <span className="shrink-0 text-slate-500 text-[10px]">
                    [{new Date(u.createdAt).toLocaleTimeString('en-IN', { hour12: false })}]
                  </span>
                  <span className="shrink-0 rounded bg-teal-500/20 px-1.5 py-0.2 text-[10px] font-bold text-teal-300 uppercase">
                    {u.type}
                  </span>
                  <div className="flex-1 text-slate-200">
                    <strong>{u.authorName}:</strong> {u.body}
                    {u.progressPercent != null ? (
                      <span className="ml-2 font-bold text-emerald-400">({u.progressPercent}% Sprint Progress)</span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {/* ─── Modal: Create Engineering Task ────────────────────────────────── */}
      {showTaskModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-mono text-sm font-extrabold text-slate-900 uppercase">
                New Engineering Deliverable Ticket
              </h3>
              <button
                type="button"
                onClick={() => setShowTaskModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={createTask} className="space-y-3 font-mono text-xs">
              <Field label="Ticket Title">
                <input
                  className={inputClass}
                  value={taskDraft.title}
                  onChange={(e) => setTaskDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="e.g. Implement JWT session auth & role guard middleware"
                  required
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Domain / Phase">
                  <select
                    className={inputClass}
                    value={taskDraft.category}
                    onChange={(e) => setTaskDraft((d) => ({ ...d, category: e.target.value as ProjectTask['category'] }))}
                  >
                    {TASK_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Priority Level">
                  <select
                    className={inputClass}
                    value={taskDraft.priority}
                    onChange={(e) => setTaskDraft((d) => ({ ...d, priority: e.target.value as ProjectTask['priority'] }))}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Estimated Hours">
                <input
                  type="number"
                  min="1"
                  max="500"
                  className={inputClass}
                  value={taskDraft.estimatedHours}
                  onChange={(e) => setTaskDraft((d) => ({ ...d, estimatedHours: Number(e.target.value) || 0 }))}
                />
              </Field>

              <Field label="Technical Description & Acceptance Criteria">
                <textarea
                  className={`${inputClass} min-h-20 font-sans`}
                  value={taskDraft.description}
                  onChange={(e) => setTaskDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Specific requirements, test conditions, API response format…"
                />
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTaskModal(false)} className={btnGhost}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy ? 'Creating…' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ─── Modal: Edit RFC Proposal ──────────────────────────────────────── */}
      {showRfcModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-mono text-sm font-extrabold text-slate-900 uppercase">
                Edit Technical RFC Specification
              </h3>
              <button
                type="button"
                onClick={() => setShowRfcModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={saveRfc} className="space-y-4 font-mono text-xs">
              <p className="font-bold text-slate-700 uppercase">Effort Hours Allocation</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Frontend (hrs)">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={rfcDraft.frontendHours}
                    onChange={(e) => setRfcDraft((d) => ({ ...d, frontendHours: Number(e.target.value) || 0 }))}
                  />
                </Field>
                <Field label="Backend (hrs)">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={rfcDraft.backendHours}
                    onChange={(e) => setRfcDraft((d) => ({ ...d, backendHours: Number(e.target.value) || 0 }))}
                  />
                </Field>
                <Field label="DevOps/Cloud (hrs)">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={rfcDraft.infraHours}
                    onChange={(e) => setRfcDraft((d) => ({ ...d, infraHours: Number(e.target.value) || 0 }))}
                  />
                </Field>
                <Field label="QA & Security (hrs)">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={rfcDraft.qaHours}
                    onChange={(e) => setRfcDraft((d) => ({ ...d, qaHours: Number(e.target.value) || 0 }))}
                  />
                </Field>
              </div>

              <Field label="Database Schema DDL Proposal">
                <textarea
                  className={`${inputClass} min-h-36 font-mono text-xs bg-slate-950 text-emerald-300`}
                  value={rfcDraft.schemaProposal}
                  onChange={(e) => setRfcDraft((d) => ({ ...d, schemaProposal: e.target.value }))}
                />
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRfcModal(false)} className={btnGhost}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className={btnPrimary}>
                  Save RFC Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ─── Modal: Configure Topology ─────────────────────────────────────── */}
      {showTopologyModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-mono text-sm font-extrabold text-slate-900 uppercase">
                Configure Topology & Git Repositories
              </h3>
              <button
                type="button"
                onClick={() => setShowTopologyModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={saveTopology} className="space-y-3 font-mono text-xs">
              <Field label="GitHub Project Repository URL">
                <input
                  className={inputClass}
                  value={topologyDraft.repoUrl}
                  onChange={(e) => setTopologyDraft((d) => ({ ...d, repoUrl: e.target.value }))}
                  placeholder="https://github.com/organization/repo"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Active Dev Branch">
                  <input
                    className={inputClass}
                    value={topologyDraft.activeBranch}
                    onChange={(e) => setTopologyDraft((d) => ({ ...d, activeBranch: e.target.value }))}
                  />
                </Field>
                <Field label="Primary Database">
                  <input
                    className={inputClass}
                    value={topologyDraft.databaseEngine}
                    onChange={(e) => setTopologyDraft((d) => ({ ...d, databaseEngine: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Frontend Framework">
                  <input
                    className={inputClass}
                    value={topologyDraft.frontendFramework}
                    onChange={(e) => setTopologyDraft((d) => ({ ...d, frontendFramework: e.target.value }))}
                  />
                </Field>
                <Field label="Backend Framework">
                  <input
                    className={inputClass}
                    value={topologyDraft.backendFramework}
                    onChange={(e) => setTopologyDraft((d) => ({ ...d, backendFramework: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTopologyModal(false)} className={btnGhost}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className={btnPrimary}>
                  Save Topology
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
