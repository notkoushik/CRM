import { useCallback, useEffect, useState } from 'react';
import type { Conversation, Stage } from '../types';
import { DEFAULT_STAGES } from '../defaults';
import type { CrmStore } from '../hooks/useCrmStore';
import {
  deleteConversation,
  getPlayUrl,
  listConversations,
  uploadConversationRecording,
} from '../lib/conversations';
import { Field, inputClass, btnGhost, btnPrimary } from './ui';

interface ConversationPanelProps {
  store: CrmStore;
  contactId: string;
  companyId: string | null;
  stages?: string[];
}

function formatCalledAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function ConversationPanel({
  store,
  contactId,
  companyId,
  stages = [...DEFAULT_STAGES],
}: ConversationPanelProps) {
  const company = companyId ? store.getCompany(companyId) : null;
  const [stageAtCall, setStageAtCall] = useState<Stage>(
    company?.stage ?? stages[0] ?? 'Lead Added'
  );
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listConversations({ contactId });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (company?.stage) setStageAtCall(company.stage);
  }, [company?.stage]);

  const upload = async () => {
    if (!file) {
      setError('Choose an audio file first');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadConversationRecording(contactId, stageAtCall, file, notes || undefined);
      setFile(null);
      setNotes('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const play = async (id: string) => {
    try {
      const url = await getPlayUrl(id);
      setPlayingId(id);
      setPlayUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Playback failed');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this recording?')) return;
    try {
      await deleteConversation(id);
      if (playingId === id) {
        setPlayingId(null);
        setPlayUrl(null);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="border-b border-slate-200/80 pb-2.5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <span>🎵</span> Call Audio Recordings
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Upload phone call audio clips (mp3, m4a, wav). Stage at call is tagged automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Stage at call">
          <select
            className={inputClass}
            value={stageAtCall}
            onChange={(e) => setStageAtCall(e.target.value as Stage)}
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Audio file (mp3, m4a, wav, webm)">
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.aac,.mp4"
            className={inputClass}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Notes (optional)" className="sm:col-span-2">
          <input
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Quick call summary"
          />
        </Field>
      </div>

      <button
        type="button"
        className={btnPrimary}
        disabled={uploading || !file}
        onClick={() => void upload()}
      >
        {uploading ? 'Uploading…' : 'Upload Audio Recording'}
      </button>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}

      {playUrl ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 shadow-2xs">
          <p className="text-xs font-bold text-teal-800 mb-1.5">Audio Player</p>
          <audio controls className="w-full" src={playUrl} autoPlay>
            <track kind="captions" />
          </audio>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          Recording Archives ({items.length})
        </p>
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-400">No recordings uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            {items.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-slate-50/60 transition"
              >
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-slate-900">{formatCalledAt(c.calledAt)}</p>
                  <p className="text-slate-500 text-[11px]">
                    Recorded by <span className="font-semibold text-slate-700">{c.calledByName}</span> · stage: <span className="font-semibold text-teal-800">{c.stageAtCall}</span>
                  </p>
                  {c.notes ? <p className="mt-0.5 text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded text-[11px] inline-block">{c.notes}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2 items-center">
                  <button type="button" className={`${btnGhost} py-1 text-xs`} onClick={() => void play(c.id)}>
                    ▶ Play
                  </button>
                  {store.canDelete ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-rose-600 hover:underline cursor-pointer"
                      onClick={() => void remove(c.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}
