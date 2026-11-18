import { useEffect, useState, type FormEvent } from 'react';
import type { Company } from '../types';
import { api } from '../lib/api';
import { uploadProjectDocument, type Handoff, type ProjectDocument } from '../lib/projects';
import { Modal, btnGhost, btnPrimary, Field, inputClass } from './ui';
import { DocumentViewerModal } from './DocumentViewerModal';

export interface SubmitHandoffModalProps {
  company: Company | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (handoff: Handoff) => void;
}

const HANDOFF_TYPES = ['Website', 'Mobile application', 'Software', 'Design', 'Marketing', 'Other'];

export function SubmitHandoffModal({
  company,
  open,
  onClose,
  onSuccess,
}: SubmitHandoffModalProps) {
  const [title, setTitle] = useState('');
  const [projectType, setProjectType] = useState('Website');
  const [expectedBudget, setExpectedBudget] = useState('');
  const [expectedTimeline, setExpectedTimeline] = useState('3–4 weeks');
  const [functionalRequirements, setFunctionalRequirements] = useState('');
  const [preferredTechnology, setPreferredTechnology] = useState('');
  const [description, setDescription] = useState('');
  const [additionalComments, setAdditionalComments] = useState('');
  const [docType, setDocType] = useState('quotation');
  const [file, setFile] = useState<File | null>(null);
  const [existingDocs, setExistingDocs] = useState<ProjectDocument[]>([]);
  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (company && open) {
      setTitle(`${company.companyName} - Project Delivery`);
      setProjectType('Website');
      setExpectedBudget(company.offeredPrice ? `INR ${company.offeredPrice.toLocaleString()}` : '');
      setExpectedTimeline('3–4 weeks');
      setFunctionalRequirements('');
      setPreferredTechnology('');
      setDescription(company.notes || '');
      setAdditionalComments('');
      setDocType('quotation');
      setFile(null);
      setError('');
      setLoadingDocs(true);
      api<{ documents: ProjectDocument[] }>(`/api/project-documents?leadId=${company.id}`)
        .then((res) => setExistingDocs(res.documents || []))
        .catch(() => setExistingDocs([]))
        .finally(() => setLoadingDocs(false));
    }
  }, [company, open]);

  if (!company) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a project title.');
      return;
    }
    if (!file && existingDocs.length === 0) {
      setError('A quotation or scope document is required for leads in "Handoff Submitted". Please select and attach a document.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const res = await api<{ handoff: Handoff }>('/api/handoffs', {
        method: 'POST',
        body: JSON.stringify({
          leadId: company.id,
          title: title.trim(),
          projectType,
          description: description.trim(),
          functionalRequirements: functionalRequirements.trim() || 'See attached quotation/specification document.',
          preferredTechnology: preferredTechnology.trim(),
          expectedBudget: expectedBudget.trim(),
          expectedTimeline: expectedTimeline.trim(),
          additionalComments: additionalComments.trim(),
        }),
      });

      if (file && res.handoff?.id) {
        await uploadProjectDocument(
          { handoffId: res.handoff.id },
          docType,
          file,
          false
        );
      }

      onSuccess(res.handoff);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit quotation and scope.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Submit Client Quotation & Scope: ${company.companyName}`}
      onClose={onClose}
      wide={true}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 text-xs leading-relaxed text-teal-950">
          <p className="font-bold flex items-center gap-1.5 text-teal-900">
            <span>📄</span> Client Proposal & Scope of Work
          </p>
          <p className="mt-1 text-teal-800">
            Specify the client requirements, what we are developing for them, and attach the quotation document. Once the client approves and the lead is converted, Admin assigns a developer who will upload their own technical deliverables and development documents.
          </p>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project title *" className="sm:col-span-2">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Acme Corp Web Application Delivery"
              required
            />
          </Field>

          <Field label="Project type">
            <select
              className={inputClass}
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
            >
              {HANDOFF_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>

          <Field label="Expected budget">
            <input
              className={inputClass}
              value={expectedBudget}
              onChange={(e) => setExpectedBudget(e.target.value)}
              placeholder="e.g. INR 25,000"
            />
          </Field>

          <Field label="Expected timeline">
            <input
              className={inputClass}
              value={expectedTimeline}
              onChange={(e) => setExpectedTimeline(e.target.value)}
              placeholder="e.g. 3–4 weeks"
            />
          </Field>

          <Field label="Preferred technology">
            <input
              className={inputClass}
              value={preferredTechnology}
              onChange={(e) => setPreferredTechnology(e.target.value)}
              placeholder="e.g. React, Next.js, Node.js, Tailwind"
            />
          </Field>

          <Field label="Functional requirements * (What should be built?)" className="sm:col-span-2">
            <textarea
              className={`${inputClass} min-h-24`}
              value={functionalRequirements}
              onChange={(e) => setFunctionalRequirements(e.target.value)}
              placeholder="List specific core features, client expectations, required integrations, user roles, etc."
            />
          </Field>

          <Field label="Project description / scope notes" className="sm:col-span-2">
            <textarea
              className={`${inputClass} min-h-16`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Background context, client business goals, design aesthetic, or discussion summary…"
            />
          </Field>
        </div>

        {/* Document Upload Section */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
            <div>
              <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>📎</span> Attach Quotation or Scope Document {existingDocs.length === 0 ? <span className="text-rose-600 font-extrabold">* (Required)</span> : null}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Every lead in &quot;Handoff Submitted&quot; must contain the quotation or scope document shared with the client.
              </p>
            </div>
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              🔒 Confidential
            </span>
          </div>

          {loadingDocs ? (
            <p className="text-xs text-slate-500">Checking verified documents…</p>
          ) : existingDocs.length > 0 ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50/80 p-2.5 text-xs text-teal-950 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold">✓ Attached Document ({existingDocs.length}):</span>{' '}
                {existingDocs.map((d) => d.filename).join(', ')}
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 uppercase">On Record</span>
                <button
                  type="button"
                  onClick={() => setViewingDoc(existingDocs[0])}
                  className="rounded border border-teal-600 bg-teal-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs hover:bg-teal-700 cursor-pointer flex items-center gap-1"
                >
                  <span>👁️</span> View Document
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-900">
              ⚠️ A document (quotation, proposal, or scope specification) is required to place this lead into &quot;Handoff Submitted&quot;.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
            <Field label="Document classification">
              <select
                className={inputClass}
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                <option value="quotation">Quotation (Strictly Confidential)</option>
                <option value="project_brief">Project Brief</option>
                <option value="client_reference">Client Reference</option>
                <option value="technical">Technical Specs</option>
                <option value="other">Other</option>
              </select>
            </Field>

            <Field label={existingDocs.length > 0 ? "Attach replacement or additional document" : "Select document file * (Required)"}>
              <input
                type="file"
                className={inputClass}
                required={existingDocs.length === 0}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>

          {docType === 'quotation' ? (
            <p className="text-[11px] font-medium text-amber-800 bg-amber-50 rounded-lg p-2 border border-amber-200/70">
              Quotations and pricing details are strictly confidential between Caller and Admin. Assigned Developers will never have access to this document.
            </p>
          ) : (
            <p className="text-[11px] font-medium text-slate-600 bg-slate-100/80 rounded-lg p-2">
              Non-quotation documents can later be approved by Admin for Developer access.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            className={btnGhost}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={btnPrimary}
            disabled={busy || !title.trim()}
          >
            {busy ? 'Saving Quotation & Scope…' : 'Submit Quotation & Scope →'}
          </button>
        </div>
      </form>
      <DocumentViewerModal
        document={viewingDoc}
        open={Boolean(viewingDoc)}
        onClose={() => setViewingDoc(null)}
      />
    </Modal>
  );
}
