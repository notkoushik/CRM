import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import ExcelJS from 'exceljs';
import type { CrmStore } from '../hooks/useCrmStore';
import type { ProspectRow } from '../types';
import {
  PROSPECT_TEMPLATE_CSV,
  parseProspectMatrix,
  parseProspectPaste,
  previewByCompany,
} from '../lib/importProspects';
import { Field, btnPrimary, btnGhost, inputClass } from './ui';

interface ImportLeadsProps {
  store: CrmStore;
}

const EXAMPLE = `Company\tProspect Name\tJob Title\tEmail\tPhone\tLocation\tEmployees\tIndustry
Acme Bio Labs\tAlex Example\tHead of Operations\talex@acme-bio.example\t+1 555 010 1001\tAustin, USA\t180\tResearchBiotechnology
Northwind Health\tJordan Sample\tCo-Founder & CEO\tjordan@northwind-health.example\t+1 555 010 1002\tChicago, USA\t230\tHospital & Health Care`;

type Mode = 'single' | 'bulk';

type ImportResult = {
  message: string;
  ok: boolean;
};

const emptySingle = {
  company: '',
  prospectName: '',
  jobTitle: '',
  email: '',
  phone: '',
  location: '',
  employees: '',
  industry: '',
};

function formatResult(result: {
  companiesCreated: number;
  companiesUpdated: number;
  contactsCreated: number;
  contactsSkipped: number;
}) {
  return `Done. ${result.companiesCreated} new leads, ${result.companiesUpdated} existing leads updated, ${result.contactsCreated} contacts added, ${result.contactsSkipped} duplicates skipped.`;
}

export function ImportLeads({ store }: ImportLeadsProps) {
  const [mode, setMode] = useState<Mode>('bulk');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileRows, setFileRows] = useState<ProspectRow[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [single, setSingle] = useState(emptySingle);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const pasted = useMemo(() => {
    if (!text.trim()) return { rows: [] as ProspectRow[], errors: [] as string[] };
    return parseProspectPaste(text);
  }, [text]);

  const bulkRows = fileRows.length > 0 ? fileRows : pasted.rows;
  const bulkErrors = fileRows.length > 0 ? fileErrors : pasted.errors;
  const byCompany = useMemo(() => previewByCompany(bulkRows), [bulkRows]);

  const runBulkImport = async () => {
    if (bulkRows.length === 0) {
      setLastResult({
        message: 'Nothing to import — paste rows or upload a file first.',
        ok: false,
      });
      return;
    }
    setBusy(true);
    try {
      const result = await store.importProspects(bulkRows);
      setLastResult({ message: formatResult(result), ok: true });
      setText('');
      setFileName(null);
      setFileRows([]);
      setFileErrors([]);
    } catch (e) {
      setLastResult({
        message: e instanceof Error ? e.message : 'Import failed',
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const runSingleImport = async (e: FormEvent) => {
    e.preventDefault();
    if (!single.company.trim() || !single.prospectName.trim()) return;
    setBusy(true);
    setLastResult(null);
    try {
      const row: ProspectRow = {
        company: single.company.trim(),
        prospectName: single.prospectName.trim(),
        jobTitle: single.jobTitle.trim(),
        email: single.email.trim().toLowerCase(),
        phone: single.phone.trim(),
        location: single.location.trim(),
        employees: single.employees
          ? Number(single.employees.replace(/[^0-9]/g, '')) || null
          : null,
        industry: single.industry.trim(),
      };
      const result = await store.importProspects([row]);
      setLastResult({ message: formatResult(result), ok: true });
      setSingle(emptySingle);
    } catch (err) {
      setLastResult({
        message: err instanceof Error ? err.message : 'Import failed',
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLastResult(null);
    setText('');
    try {
      const buf = await file.arrayBuffer();
      const name = file.name.toLowerCase();
      let matrix: unknown[][] = [];

      if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
        const text = new TextDecoder('utf-8').decode(buf);
        matrix = text
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map((line) =>
            line.includes('\t') ? line.split('\t') : line.split(',').map((c) => c.trim())
          );
      } else {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const sheet = wb.worksheets[0];
        if (!sheet) {
          setFileRows([]);
          setFileErrors(['No sheet found in file.']);
          setFileName(file.name);
          return;
        }
        sheet.eachRow({ includeEmpty: false }, (row) => {
          const values = row.values;
          // exceljs row.values is 1-indexed
          const cells = Array.isArray(values)
            ? values.slice(1).map((v) => (v == null ? '' : String(v)))
            : [];
          matrix.push(cells);
        });
      }

      const parsed = parseProspectMatrix(matrix);
      setFileRows(parsed.rows);
      setFileErrors(parsed.errors);
      setFileName(file.name);
    } catch {
      setFileRows([]);
      setFileErrors(['Could not read file. Use .csv or .xlsx.']);
      setFileName(file.name);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([PROSPECT_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const resultBannerClass = (ok: boolean) =>
    ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-teal-700 uppercase">
          Morning import
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-stone-900 sm:text-4xl">
          Import leads
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Add one lead or import many. Columns:{' '}
          <span className="font-medium text-stone-700">
            Client Business, Prospect Name, Job Title, Email, Phone, Location, Employees, Industry
          </span>
          . Existing leads are matched by client business name; duplicate emails are skipped.
        </p>
      </header>

      <div className="flex gap-1.5 rounded-xl border border-slate-200 bg-slate-100/80 p-1.5 shadow-2xs">
        <button
          type="button"
          className={`flex-1 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            mode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => setMode('single')}
        >
          Single Lead Entry
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            mode === 'bulk' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => setMode('bulk')}
        >
          Bulk Import (CSV / Excel)
        </button>
      </div>

      {mode === 'single' ? (
        <form
          onSubmit={runSingleImport}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client Business *" className="sm:col-span-2">
              <input
                className={inputClass}
                value={single.company}
                onChange={(e) => setSingle((s) => ({ ...s, company: e.target.value }))}
                required
                placeholder="Business or organization name"
              />
            </Field>
            <Field label="Prospect name *">
              <input
                className={inputClass}
                value={single.prospectName}
                onChange={(e) => setSingle((s) => ({ ...s, prospectName: e.target.value }))}
                required
                placeholder="Full name"
              />
            </Field>
            <Field label="Job title">
              <input
                className={inputClass}
                value={single.jobTitle}
                onChange={(e) => setSingle((s) => ({ ...s, jobTitle: e.target.value }))}
                placeholder="e.g. Managing Director"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className={inputClass}
                value={single.email}
                onChange={(e) => setSingle((s) => ({ ...s, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={single.phone}
                onChange={(e) => setSingle((s) => ({ ...s, phone: e.target.value }))}
                placeholder="+91 …"
              />
            </Field>
            <Field label="Location">
              <input
                className={inputClass}
                value={single.location}
                onChange={(e) => setSingle((s) => ({ ...s, location: e.target.value }))}
                placeholder="City / Country"
              />
            </Field>
            <Field label="Employees">
              <input
                className={inputClass}
                inputMode="numeric"
                value={single.employees}
                onChange={(e) => setSingle((s) => ({ ...s, employees: e.target.value }))}
                placeholder="e.g. 25"
              />
            </Field>
            <Field label="Industry" className="sm:col-span-2">
              <input
                className={inputClass}
                value={single.industry}
                onChange={(e) => setSingle((s) => ({ ...s, industry: e.target.value }))}
                placeholder="Healthcare, Real Estate, E-commerce…"
              />
            </Field>
          </div>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? 'Saving…' : 'Add Lead'}
          </button>
          {lastResult && mode === 'single' ? (
            <p
              role="alert"
              className={`rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${resultBannerClass(lastResult.ok)}`}
            >
              {lastResult.message}
            </p>
          ) : null}
        </form>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <label className={`${btnGhost} cursor-pointer`}>
                📁 Upload CSV / Excel
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={onFile}
                />
              </label>
              <button type="button" className={btnGhost} onClick={downloadTemplate}>
                📥 Download Template
              </button>
              {fileName ? (
                <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                  Loaded: {fileName} ({fileRows.length} rows)
                </span>
              ) : null}
            </div>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Or paste tabular rows directly
            </label>
            <textarea
              className={`${inputClass} mt-2 min-h-[200px] font-mono text-xs leading-relaxed`}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileName(null);
                setFileRows([]);
                setFileErrors([]);
                setLastResult(null);
              }}
              placeholder={EXAMPLE}
              spellCheck={false}
            />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => void runBulkImport()}
                disabled={busy}
              >
                {busy
                  ? 'Importing…'
                  : `Import ${bulkRows.length > 0 ? `${bulkRows.length} rows` : ''}`}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setText('');
                  setFileName(null);
                  setFileRows([]);
                  setFileErrors([]);
                  setLastResult(null);
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setText(EXAMPLE);
                  setFileName(null);
                  setFileRows([]);
                  setFileErrors([]);
                  setLastResult(null);
                }}
              >
                Load Example Template
              </button>
            </div>

            {bulkErrors.length > 0 ? (
              <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800">
                {bulkErrors.slice(0, 8).map((err) => (
                  <li key={err}>{err}</li>
                ))}
                {bulkErrors.length > 8 ? <li>+{bulkErrors.length - 8} more…</li> : null}
              </ul>
            ) : null}

            {lastResult && mode === 'bulk' ? (
              <p
                role="alert"
                className={`mt-3 rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${resultBannerClass(lastResult.ok)}`}
              >
                {lastResult.message}
              </p>
            ) : null}
          </div>

          {byCompany.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5">Preview by Client Business</h2>
              <ul className="mt-3 divide-y divide-slate-100">
                {byCompany.map((c) => (
                  <li key={c.company} className="flex items-center justify-between py-2 text-xs">
                    <span className="font-bold text-slate-800">{c.company}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 font-semibold">{c.count} contacts</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
