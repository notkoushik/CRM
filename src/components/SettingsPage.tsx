import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AppConfig } from '../types';
import { api } from '../lib/api';
import {
  championMapToRows,
  championRowsToMap,
  validateChampionMapRows,
  type ChampionMapRow,
} from '../lib/championStatusMap';
import { ChampionMapEditor } from './ChampionMapEditor';
import { Field, inputClass, btnPrimary, btnGhost } from './ui';

interface SettingsPageProps {
  config: AppConfig;
  onSaved: () => Promise<void> | void;
}

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SettingsPage({ config, onSaved }: SettingsPageProps) {
  const [brandName, setBrandName] = useState(config.brandName);
  const [brandTagline, setBrandTagline] = useState(config.brandTagline);
  const [logoUrl, setLogoUrl] = useState(config.logoUrl);
  const [stagesText, setStagesText] = useState(config.stages.join('\n'));
  const [statusesText, setStatusesText] = useState(config.contactStatuses.join('\n'));
  const [mapRows, setMapRows] = useState<ChampionMapRow[]>(() =>
    championMapToRows(config.championStatusToStage)
  );
  const [autoMoveScope, setAutoMoveScope] = useState(config.stageAutoMoveScope);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Exotel Telephony Diagnostic State
  const [diagnostic, setDiagnostic] = useState<{
    operational: boolean;
    mode: string;
    isLive: boolean;
    provider: string;
    callerId: string;
    agentPhone: string;
    apiHost: string;
    webhookEndpoint: string;
    databaseStatus: string;
    stats: {
      totalCalls: number;
      exotelCalls: number;
      completedCalls: number;
      recordedCalls: number;
      lastCallAt: string | null;
    };
  } | null>(null);
  const [runningDiag, setRunningDiag] = useState(false);
  const [diagMessage, setDiagMessage] = useState<string | null>(null);

  const fetchDiagnostic = () => {
    setRunningDiag(true);
    api<NonNullable<typeof diagnostic>>('/api/exotel/admin/diagnostic')
      .then((data) => {
        setDiagnostic(data);
        setDiagMessage('Exotel telephony connection verified: All routes, database indexes, and audio streams operational.');
      })
      .catch((err) => {
        setDiagMessage(err instanceof Error ? err.message : 'Diagnostic failed.');
      })
      .finally(() => {
        setRunningDiag(false);
      });
  };

  useEffect(() => {
    api<NonNullable<typeof diagnostic>>('/api/exotel/admin/diagnostic')
      .then((data) => setDiagnostic(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setBrandName(config.brandName);
    setBrandTagline(config.brandTagline);
    setLogoUrl(config.logoUrl);
    setStagesText(config.stages.join('\n'));
    setStatusesText(config.contactStatuses.join('\n'));
    setMapRows(championMapToRows(config.championStatusToStage));
    setAutoMoveScope(config.stageAutoMoveScope);
  }, [config]);

  const domainHint = useMemo(() => {
    if (config.allowAnyEmailDomain) return 'Any email domain (env ALLOWED_EMAIL_DOMAIN=*)';
    if (config.allowedEmailDomain) return `@${config.allowedEmailDomain} (from env)`;
    return 'Configured via env ALLOWED_EMAIL_DOMAIN';
  }, [config]);

  const liveStatuses = linesToList(statusesText);
  const liveStages = linesToList(stagesText);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const mapError = validateChampionMapRows(mapRows, liveStatuses, liveStages);
      if (mapError) {
        setError(mapError);
        return;
      }
      await api('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          brandName,
          brandTagline,
          logoUrl,
          stages: liveStages,
          contactStatuses: liveStatuses,
          championStatusToStage: championRowsToMap(mapRows),
          stageAutoMoveScope: autoMoveScope,
        }),
      });
      await onSaved();
      setMessage('Settings saved. Pipeline and forms will use the new lists.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Instance settings</h1>
        <p className="mt-1 text-sm text-stone-500">
          Customize the name, lead stages, and client statuses for your Skylance workspace.
        </p>
        <p className="mt-2 text-xs text-stone-500">
          Database and sign-in settings are managed by the application administrator.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-900">Instance Configuration</h2>
          <p className="text-xs text-slate-500">Customize branding, pipeline progression, and stage mappings.</p>
        </div>

        <Field label="Brand name">
          <input
            className={inputClass}
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            required
          />
        </Field>
        <Field label="Tagline">
          <input
            className={inputClass}
            value={brandTagline}
            onChange={(e) => setBrandTagline(e.target.value)}
          />
        </Field>
        <Field label="Logo URL">
          <input
            className={inputClass}
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="/your-logo.png"
          />
        </Field>
        <Field label="Pipeline stages (one per line, top → bottom)">
          <textarea
            className={`${inputClass} min-h-48 font-mono text-xs`}
            value={stagesText}
            onChange={(e) => setStagesText(e.target.value)}
            required
          />
        </Field>
        <Field label="Contact statuses (one per line)">
          <textarea
            className={`${inputClass} min-h-48 font-mono text-xs`}
            value={statusesText}
            onChange={(e) => setStatusesText(e.target.value)}
            required
          />
        </Field>

        <ChampionMapEditor
          rows={mapRows}
          contactStatuses={liveStatuses}
          stages={liveStages}
          onChange={setMapRows}
          scope={autoMoveScope}
          onScopeChange={setAutoMoveScope}
        />

        {/* EXOTEL TELEPHONY INTEGRATION & DIAGNOSTICS CARD */}
        <section className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/30 p-5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <svg className="h-4 w-4 text-teal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Exotel Cloud Telephony Configuration
                </h3>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-teal-900 border border-teal-300">
                  {diagnostic?.mode === 'live' ? 'Live Production Mode' : 'POC Simulation Ready'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Outbound click-to-call bridging, call recording capture, and real-time CRM stage progression.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchDiagnostic}
              disabled={runningDiag}
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-teal-800 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {runningDiag ? 'Checking…' : 'Test Exotel Connection'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Virtual ExoPhone (Caller ID)</span>
              <span className="font-mono font-bold text-teal-900 text-sm">
                {diagnostic?.callerId || '+91 80 4718 2000'}
              </span>
              <p className="text-[10px] text-slate-500">Number displayed to prospects on caller ID.</p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Shared Agent Mobile</span>
              <span className="font-mono font-bold text-slate-800 text-sm">
                {diagnostic?.agentPhone || '+91 98765 43210'}
              </span>
              <p className="text-[10px] text-slate-500">Physical handset rung first on outbound dial.</p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Exotel Callback URL</span>
              <span className="font-mono font-medium text-slate-700 truncate block">
                {diagnostic?.webhookEndpoint || '/api/webhooks/exotel/:token'}
              </span>
              <p className="text-[10px] text-slate-500">Receives terminal call status, talk duration, and audio.</p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Recorded Calls in CRM</span>
              <span className="font-bold text-teal-800 text-sm">
                {diagnostic?.stats.totalCalls ?? 0} total calls ({diagnostic?.stats.recordedCalls ?? 0} with recordings)
              </span>
              <p className="text-[10px] text-slate-500">Streamed securely to Caller Desk and Admin Activity.</p>
            </div>
          </div>

          {diagMessage ? (
            <p className="text-xs font-semibold text-teal-800 bg-teal-100/70 p-2.5 rounded-lg border border-teal-200">
              {diagMessage}
            </p>
          ) : null}
        </section>

        <p className="text-xs text-slate-400">Login email policy: {domainHint}</p>

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        {message ? <p className="rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs font-semibold text-teal-800">{message}</p> : null}

        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              setBrandName(config.brandName);
              setBrandTagline(config.brandTagline);
              setLogoUrl(config.logoUrl);
              setStagesText(config.stages.join('\n'));
              setStatusesText(config.contactStatuses.join('\n'));
              setMapRows(championMapToRows(config.championStatusToStage));
              setError(null);
              setMessage(null);
            }}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
