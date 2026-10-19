import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import Editor from '@monaco-editor/react';
import { AlertTriangle, CheckCircle2, Pause, Play, SkipBack } from 'lucide-react';
import { db } from '../../lib/firebase';
import type { KeystrokeEvent, LanguageKey } from '../../types/exam';
import { ALL_LANGUAGES } from '../../types/examiner';
import { btnSmall } from '../ui/styles';
import { cn } from '../../lib/utils';

interface Ev extends KeystrokeEvent {
  ts: number; // absolute client ms
  lang: LanguageKey;
}

const LARGE_INSERT = 40;
const CHECKPOINT = 100;
const MAX_STEP_MS = 1500; // compress idle gaps while playing

function apply(doc: string, e: Ev): string {
  if (e.k === 'e' || e.k === 'p') {
    const o = Math.min(e.o ?? 0, doc.length);
    return doc.slice(0, o) + (e.i ?? '') + doc.slice(o + (e.d ?? 0));
  }
  if (e.k === 'l' || e.k === 'r') return e.i ?? doc;
  return doc;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Props {
  submissionId: string;
  questionId: string;
  submittedCode?: string;
}

/**
 * Rebuilds the candidate's editor from recorded content changes.
 * Every pasted insertion ('p') or single large insertion is surfaced as a marker so examiners
 * can jump straight to the moments where text appeared all at once.
 */
export function KeystrokeReplay({ submissionId, questionId, submittedCode }: Props) {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [idx, setIdx] = useState(0); // number of events applied
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getDocs(collection(db, 'submissions', submissionId, 'keystrokes'))
      .then((snap) => {
        const chunks = snap.docs
          .map((d) => d.data() as { questionId: string; chunkSeq: number; language: LanguageKey; clientStartedAt: number; events: KeystrokeEvent[] })
          .filter((c) => c.questionId === questionId)
          .sort((a, b) => a.chunkSeq - b.chunkSeq);
        const flat: Ev[] = chunks.flatMap((c) => c.events.map((e) => ({ ...e, ts: c.clientStartedAt + e.t, lang: e.v ?? c.language })));
        if (alive) {
          setEvents(flat);
          setIdx(flat.length);
        }
      })
      .catch(() => alive && setError('Could not load keystroke data.'));
    return () => {
      alive = false;
    };
  }, [submissionId, questionId]);

  const checkpoints = useMemo(() => {
    const cps: string[] = [''];
    let doc = '';
    (events ?? []).forEach((e, i) => {
      doc = apply(doc, e);
      if ((i + 1) % CHECKPOINT === 0) cps.push(doc);
    });
    return cps;
  }, [events]);

  const docAt = (n: number): string => {
    if (!events) return '';
    const base = Math.floor(n / CHECKPOINT);
    let doc = checkpoints[base] ?? '';
    for (let i = base * CHECKPOINT; i < n; i++) doc = apply(doc, events[i]!);
    return doc;
  };

  const doc = useMemo(() => docAt(idx), [idx, events, checkpoints]); // eslint-disable-line react-hooks/exhaustive-deps
  const finalDoc = useMemo(() => (events ? docAt(events.length) : ''), [events, checkpoints]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autoplay with compressed idle gaps.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!playing || !events) return;
    if (idx >= events.length) return setPlaying(false);
    const gap = idx === 0 ? 0 : events[idx]!.ts - events[idx - 1]!.ts;
    timer.current = setTimeout(() => setIdx((i) => i + 1), Math.max(16, Math.min(gap, MAX_STEP_MS) / speed));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, idx, speed, events]);

  const markers = useMemo(
    () =>
      (events ?? []).flatMap((e, i): { i: number; kind: 'paste' | 'large'; len: number }[] => {
        const len = e.i?.length ?? 0;
        if (e.k === 'p') return [{ i, kind: 'paste' as const, len }];
        if (e.k === 'e' && len >= LARGE_INSERT) return [{ i, kind: 'large' as const, len }];
        return [];
      }),
    [events],
  );

  const blurs = useMemo(() => {
    // Editor blur → focus gaps longer than 5s (candidate looked elsewhere).
    const out: { i: number; ms: number }[] = [];
    (events ?? []).forEach((e, i) => {
      if (e.k !== 'b') return;
      const next = (events ?? []).slice(i + 1).find((x) => x.k === 'f');
      if (next && next.ts - e.ts > 5000) out.push({ i, ms: next.ts - e.ts });
    });
    return out;
  }, [events]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!events) return <p className="text-slate-400">Loading replay…</p>;
  if (events.length === 0) return <p className="text-slate-500">No keystrokes were recorded for this question.</p>;

  const start = events[0]!.ts;
  const total = events[events.length - 1]!.ts - start;
  const now = idx === 0 ? 0 : events[idx - 1]!.ts - start;
  const lang = events[Math.max(0, idx - 1)]!.lang;
  const monaco = ALL_LANGUAGES.find((l) => l.key === lang)?.monaco ?? 'plaintext';
  const matches = submittedCode == null ? null : finalDoc.trim() === submittedCode.trim();

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-96">
          <Editor height="100%" language={monaco} theme="vs-dark" value={doc} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, domReadOnly: true }} />
        </div>

        <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-4">
          <div className="relative">
            <input type="range" min={0} max={events.length} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="w-full accent-primary-600" />
            {/* Marker ticks over the timeline */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-5">
              {markers.map((m) => (
                <span key={m.i} className={cn('absolute top-0 h-2 w-0.5', m.kind === 'paste' ? 'bg-red-500' : 'bg-amber-500')} style={{ left: `${(m.i / events.length) * 100}%` }} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button className={btnSmall} onClick={() => { setIdx(0); setPlaying(false); }}><SkipBack className="h-3 w-3" /></button>
              <button className={btnSmall} onClick={() => { if (idx >= events.length) setIdx(0); setPlaying((p) => !p); }}>
                {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />} {playing ? 'Pause' : 'Play'}
              </button>
              <select className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                {[1, 2, 4, 8, 16, 32].map((s) => <option key={s} value={s}>{s}×</option>)}
              </select>
            </div>
            <p className="font-mono text-xs text-slate-500">{fmt(now)} / {fmt(total)} · event {idx}/{events.length}</p>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        {matches != null && (
          <div className={cn('flex items-start gap-2 rounded-lg p-3 text-xs', matches ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
            {matches ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            {matches ? 'The replay reproduces the submitted code exactly.' : 'The replay does not match the submitted code. Some edits may be missing (lost chunks) — treat the replay as partial evidence.'}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-slate-900">Suspicious moments</p>
          {markers.length === 0 && blurs.length === 0 && <p className="text-xs text-slate-500">No pastes, large insertions or long editor-blur gaps detected.</p>}
          <ul className="max-h-72 space-y-1 overflow-auto text-xs">
            {markers.map((m) => (
              <li key={m.i}>
                <button onClick={() => { setPlaying(false); setIdx(m.i + 1); }} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-slate-50">
                  <span className={m.kind === 'paste' ? 'font-medium text-red-600' : 'font-medium text-amber-600'}>{m.kind === 'paste' ? 'Paste' : 'Large insert'} · {m.len} chars</span>
                  <span className="font-mono text-slate-400">{fmt(events[m.i]!.ts - start)}</span>
                </button>
              </li>
            ))}
            {blurs.map((b) => (
              <li key={`b${b.i}`}>
                <button onClick={() => { setPlaying(false); setIdx(b.i + 1); }} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-slate-50">
                  <span className="text-slate-600">Left editor for {fmt(b.ms)}</span>
                  <span className="font-mono text-slate-400">{fmt(events[b.i]!.ts - start)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
