import { useEffect, useState } from 'react';
import type { ProjectDocument } from '../lib/projects';
import { downloadProjectDocument } from '../lib/projects';
import { Modal, btnGhost, btnPrimary } from './ui';

export interface DocumentViewerModalProps {
  document: ProjectDocument | null;
  open: boolean;
  onClose: () => void;
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentViewerModal({
  document,
  open,
  onClose,
}: DocumentViewerModalProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const isPdf =
    document?.contentType === 'application/pdf' ||
    document?.filename.toLowerCase().endsWith('.pdf');
  const isImage =
    document?.contentType?.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(document?.filename ?? '');
  const isText =
    document?.contentType?.startsWith('text/') ||
    /\.(txt|md|json|csv|log)$/i.test(document?.filename ?? '');

  useEffect(() => {
    if (!document || !open) {
      setTextContent(null);
      setError('');
      return;
    }
    if (isText) {
      fetch(`/api/project-documents/${document.id}/view`, { credentials: 'include' })
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error('Failed to load text content'))))
        .then(setTextContent)
        .catch((e) => setError(e instanceof Error ? e.message : 'Error loading document'));
    }
  }, [document, open, isText]);

  if (!document) return null;

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      await downloadProjectDocument(document);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download document');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Document: ${document.filename}`}
      onClose={onClose}
      wide={true}
    >
      <div className="space-y-4">
        {/* Document metadata & Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200/80 font-mono text-xs font-bold text-slate-700">
              {document.type === 'quotation' ? 'RFC' : isPdf ? 'PDF' : isImage ? 'IMG' : 'DOC'}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 break-all">{document.filename}</p>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium">
                <span className="rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  {titleCase(document.type)}
                </span>
                <span>·</span>
                <span>{formatBytes(document.sizeBytes)}</span>
                {document.type === 'quotation' ? (
                  <>
                    <span>·</span>
                    <span className="rounded border border-amber-300 bg-amber-100/80 px-1.5 py-0.2 text-[10px] font-bold text-amber-900">
                      Confidential Scope
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Prominent Download Button inside/around the opened document */}
          <button
            type="button"
            className={`${btnPrimary} py-2 px-4 shadow-sm flex items-center gap-2`}
            onClick={() => void handleDownload()}
            disabled={downloading}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{downloading ? 'Downloading…' : 'Download Document'}</span>
          </button>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {error}
          </p>
        ) : null}

        {/* In-Browser Document Preview */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          {isPdf ? (
            <div className="relative w-full h-[65vh] bg-slate-100">
              <iframe
                src={`/api/project-documents/${document.id}/view`}
                title={document.filename}
                className="w-full h-full border-0"
              />
            </div>
          ) : isImage ? (
            <div className="flex max-h-[65vh] min-h-[250px] items-center justify-center overflow-auto bg-slate-900/5 p-4">
              <img
                src={`/api/project-documents/${document.id}/view`}
                alt={document.filename}
                className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-sm border border-slate-200"
              />
            </div>
          ) : isText && textContent !== null ? (
            <div className="max-h-[60vh] overflow-auto p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl whitespace-pre-wrap leading-relaxed">
              {textContent}
            </div>
          ) : (
            <div className="p-8 text-center space-y-3 bg-slate-50/50">
              <span className="text-4xl">📎</span>
              <div>
                <p className="text-sm font-bold text-slate-800">{document.filename}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Format: {document.contentType || 'Binary file'} · {formatBytes(document.sizeBytes)}
                </p>
              </div>
              <p className="text-xs text-slate-600 max-w-sm mx-auto">
                This document is ready to be saved to your device. Click the download button below or in the top bar.
              </p>
              <button
                type="button"
                className={`${btnPrimary} py-2 px-5`}
                onClick={() => void handleDownload()}
                disabled={downloading}
              >
                <span>⬇️ Download File ({formatBytes(document.sizeBytes)})</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer with second download action & close */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">
            Previewing in CRM Document Viewer
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>
              Close Preview
            </button>
            <button
              type="button"
              className={`${btnPrimary} flex items-center gap-1.5`}
              onClick={() => void handleDownload()}
              disabled={downloading}
            >
              <span>⬇️</span> Download Document
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
