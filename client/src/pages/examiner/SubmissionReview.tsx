import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, FileCheck2, Loader2, PlaySquare, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { ExaminerLayout } from '../../components/examiner/ExaminerLayout';
import { KeystrokeReplay } from '../../components/examiner/KeystrokeReplay';
import { api, apiErrorMessage } from '../../lib/api';
import { db, storage } from '../../lib/firebase';
import { loadQuestion } from '../../lib/examinerData';
import type { AnswerKey, Question, Submission } from '../../types/examiner';
import { btnDanger, btnGhost, card, statusTone } from '../../components/ui/styles';
import { cn } from '../../lib/utils';

type Tab = 'answers' | 'proctoring' | 'snapshots' | 'replay';
type Loaded = Record<string, { question: Question; key: AnswerKey }>;

const TAB_ITEMS: { key: Tab; label: string; icon: typeof FileCheck2 }[] = [
  { key: 'answers', label: 'Answers', icon: FileCheck2 },
  { key: 'proctoring', label: 'Proctoring', icon: ShieldAlert },
  { key: 'snapshots', label: 'Snapshots', icon: Camera },
  { key: 'replay', label: 'Code replay', icon: PlaySquare },
];

const GRADE_TONE: Record<string, string> = {
  correct: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  partial: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  incorrect: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  unanswered: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
  error: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
};

export function SubmissionReview() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const [sub, setSub] = useState<Submission | null>(null);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({});
  const [tab, setTab] = useState<Tab>('answers');
  const [busy, setBusy] = useState<'regrade' | 'terminate' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!submissionId) return;
    return onSnapshot(
      doc(db, 'submissions', submissionId),
      (s) => (s.exists() ? setSub({ id: s.id, ...(s.data() as Omit<Submission, 'id'>) }) : setMissing(true)),
      () => setMissing(true),
    );
  }, [submissionId]);

  const qids = sub?.questionMap.map((m) => m.questionId).join(',');
  useEffect(() => {
    if (!sub) return;
    let alive = true;
    Promise.all(sub.questionMap.map((m) => loadQuestion(m.questionId).then((r) => [m.questionId, r] as const).catch(() => null))).then((rows) => {
      if (alive) setLoaded(Object.fromEntries(rows.filter((r): r is NonNullable<typeof r> => r !== null)));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qids]);

  const act = async (kind: 'regrade' | 'terminate') => {
    if (!sub) return;
    if (kind === 'terminate' && !confirm('Force-submit this attempt now? The candidate will be locked out immediately.')) return;
    setBusy(kind);
    setNotice(null);
    try {
      await api.post(`/examiner/submissions/${sub.id}/${kind}`);
      setNotice(kind === 'regrade' ? 'Regrade queued — scores will update in a few seconds.' : 'Attempt terminated and queued for grading.');
    } catch (e) {
      setNotice(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const codingIds = useMemo(() => (sub?.questionMap ?? []).filter((m) => m.type === 'coding').map((m) => m.questionId), [sub]);

  if (missing) return <ExaminerLayout><p className="text-red-600">Submission not found or you don't have access.</p></ExaminerLayout>;
  if (!sub) return <ExaminerLayout><p className="animate-pulse text-slate-400">Loading…</p></ExaminerLayout>;

  const g = sub.grading;
  const p = sub.proctoring;

  return (
    <ExaminerLayout wide>
      <Link to={`/examiner/exams/${sub.examId}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to exam
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{sub.candidateName}</h1>
          <p className="text-sm text-slate-500">{sub.candidateEmail}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={cn('rounded-full px-2.5 py-0.5 font-medium', statusTone[sub.status])}>{sub.status.replace('_', ' ')}</span>
            {sub.submitReason && <span className="text-slate-500">submitted: {sub.submitReason.replace('_', ' ')}</span>}
            <span className="text-slate-400">started {sub.timing.startedAt.toDate().toLocaleString()}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-3xl font-bold tracking-tight text-slate-900">
            {g.totalScore != null ? `${g.totalScore}` : '—'}
            <span className="text-lg font-normal text-slate-400"> / {g.maxScore ?? '—'}</span>
          </p>
          <div className="flex gap-2">
            {sub.status === 'in_progress' && (
              <button className={btnDanger} onClick={() => act('terminate')} disabled={!!busy}>
                {busy === 'terminate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} Terminate
              </button>
            )}
            {sub.status !== 'in_progress' && (
              <button className={btnGhost} onClick={() => act('regrade')} disabled={!!busy}>
                {busy === 'regrade' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Regrade
              </button>
            )}
          </div>
        </div>
      </div>
      {notice && <p className="animate-tab-enter mt-4 rounded-xl bg-blue-50 p-3.5 text-sm text-blue-800 ring-1 ring-inset ring-blue-200">{notice}</p>}
      {g.lastError && sub.status === 'grading_failed' && <p className="animate-tab-enter mt-4 rounded-xl bg-red-50 p-3.5 text-sm text-red-700 ring-1 ring-inset ring-red-200">Grading failed: {g.lastError}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Warnings', p.warningCount, p.warningCount > 0],
          ['Tab switches', p.tabSwitches, p.tabSwitches > 0],
          ['Fullscreen exits', p.fullscreenExits, p.fullscreenExits > 0],
          ['Clipboard attempts', p.clipboardAttempts, p.clipboardAttempts > 0],
          ['Blocked shortcuts', p.blockedShortcuts, p.blockedShortcuts > 0],
          ['Audio flags', p.audioFlags, p.audioFlags > 0],
        ].map(([k, v, bad]) => (
          <div key={k as string} className={cn(card, 'p-3.5 transition-transform duration-200 hover:-translate-y-0.5')}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k}</p>
            <p className={cn('mt-1 text-xl font-bold', bad ? 'text-red-600' : 'text-slate-900')}>{v}</p>
          </div>
        ))}
      </div>

      {/* Smooth Segmented Pill Tabs */}
      <div className="mt-6 inline-flex flex-wrap rounded-2xl border border-slate-200/90 bg-slate-100/80 p-1.5">
        {TAB_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ease-out active:scale-[0.97]',
              tab === key
                ? 'bg-white text-primary-700 shadow-xs ring-1 ring-slate-200/60'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div key={tab} className="animate-tab-enter mt-6">
        {tab === 'answers' && <AnswersTab sub={sub} loaded={loaded} />}
        {tab === 'proctoring' && <EventsTab submissionId={sub.id} />}
        {tab === 'snapshots' && <SnapshotsTab submissionId={sub.id} />}
        {tab === 'replay' && <ReplayTab sub={sub} loaded={loaded} codingIds={codingIds} />}
      </div>
    </ExaminerLayout>
  );
}

/* ───────────────────────────── answers ───────────────────────────── */

function AnswersTab({ sub, loaded }: { sub: Submission; loaded: Loaded }) {
  const ordered = [...sub.questionMap].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-4">
      {ordered.map((m, i) => {
        const l = loaded[m.questionId];
        const ans = sub.answers[m.questionId];
        const grade = sub.grading.perQuestion[m.questionId];
        const ks = sub.keystrokeStats?.[m.questionId];
        const q = l?.question;
        return (
          <div key={m.questionId} className={cn(card, 'p-6')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Q{i + 1} · {m.type}</p>
                <h3 className="mt-0.5 font-semibold text-slate-900">{q?.title ?? m.questionId}</h3>
              </div>
              <div className="flex items-center gap-2">
                {grade && <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', GRADE_TONE[grade.status])}>{grade.status}</span>}
                <span className="font-mono text-sm font-medium">{grade ? `${grade.score}/${grade.maxScore}` : `—/${m.points}`}</span>
              </div>
            </div>
            {q && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{q.prompt}</p>}
            {grade?.note && <p className="mt-2 text-xs font-medium text-amber-700">{grade.note}</p>}

            <div className="mt-4">
              {!ans && <p className="text-sm italic text-slate-400">No answer submitted.</p>}

              {ans && m.type === 'mcq' && q?.type === 'mcq' && l.key.type === 'mcq' && (
                <ul className="space-y-2">
                  {(m.optionOrder ?? q.options.map((o) => o.id)).map((oid) => {
                    const opt = q.options.find((o) => o.id === oid);
                    if (!opt) return null;
                    const picked = ans.selectedOptionId === oid;
                    const correct = (l.key as { correctOptionId: string }).correctOptionId === oid;
                    return (
                      <li key={oid} className={cn('flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm', correct ? 'border-emerald-300 bg-emerald-50/70' : picked ? 'border-red-300 bg-red-50/70' : 'border-slate-200/80')}>
                        {correct ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : picked ? <XCircle className="h-4 w-4 text-red-600" /> : <span className="h-4 w-4" />}
                        <span className="flex-1">{opt.text}</span>
                        {picked && <span className="text-xs font-medium text-slate-500">candidate's choice</span>}
                      </li>
                    );
                  })}
                </ul>
              )}

              {ans && m.type === 'numerical' && l?.key.type === 'numerical' && (
                <p className="text-sm">
                  Candidate answered <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono">{ans.value || '(blank)'}</code>; expected{' '}
                  <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono">{l.key.value}</code> (± {l.key.tolerance.amount}
                  {l.key.tolerance.mode === 'relative' ? ' relative' : ''}).
                </p>
              )}

              {ans && m.type === 'coding' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>Language: <strong className="text-slate-700">{ans.language}</strong></span>
                    {ks && (
                      <>
                        <span>Typed {ks.typedChars} chars</span>
                        <span className={ks.pastedChars ? 'font-medium text-red-600' : ''}>Pasted {ks.pastedChars} chars</span>
                        <span className={ks.largeInserts ? 'font-medium text-amber-600' : ''}>{ks.largeInserts} large insert(s)</span>
                        {ks.typedChars + ks.pastedChars > 0 && ks.pastedChars / (ks.typedChars + ks.pastedChars) > 0.5 && (
                          <span className="inline-flex items-center gap-1 font-medium text-red-600"><AlertTriangle className="h-3 w-3" /> mostly pasted</span>
                        )}
                      </>
                    )}
                  </div>
                  <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{ans.code || '(empty)'}</pre>
                  {grade?.tests && (
                    <div className="flex flex-wrap gap-2">
                      {grade.tests.map((t) => (
                        <span key={t.testCaseId} title={`${t.visibility} · ${t.status}`} className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium', t.passed ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200')}>
                          {t.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {t.visibility === 'hidden' ? 'Hidden' : 'Public'} {t.testCaseId}
                          {!t.passed && ` (${t.status.replace(/_/g, ' ')})`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────── proctor events ──────────────────────────── */

interface EventRow {
  id: string;
  type: string;
  clientTs: number;
  serverTs: { toDate(): Date };
  countedAsViolation: boolean;
  meta: Record<string, string | number | boolean>;
}

function EventsTab({ submissionId }: { submissionId: string }) {
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [onlyViolations, setOnlyViolations] = useState(false);

  useEffect(() => {
    getDocs(collection(db, 'submissions', submissionId, 'events'))
      .then((s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventRow, 'id'>) })).sort((a, b) => a.serverTs.toDate().getTime() - b.serverTs.toDate().getTime())))
      .catch(() => setRows([]));
  }, [submissionId]);

  if (!rows) return <p className="animate-pulse text-slate-400">Loading…</p>;
  const shown = onlyViolations ? rows.filter((r) => r.countedAsViolation) : rows;

  return (
    <div className={cn(card, 'overflow-hidden')}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <p className="text-sm font-semibold text-slate-900">{shown.length} events</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
          <input type="checkbox" className="accent-primary-600" checked={onlyViolations} onChange={(e) => setOnlyViolations(e.target.checked)} />
          Only warnings
        </label>
      </div>
      <ul className="divide-y divide-slate-100">
        {shown.map((r) => (
          <li key={r.id} className="flex items-start gap-4 px-5 py-3 text-sm transition-colors hover:bg-slate-50/80">
            <span className="w-40 shrink-0 font-mono text-xs text-slate-400">{r.serverTs.toDate().toLocaleTimeString()}</span>
            <span className={cn('w-44 shrink-0 font-medium', r.countedAsViolation ? 'text-red-600' : 'text-slate-700')}>
              {r.type.replace(/_/g, ' ')}
              {r.countedAsViolation && <span className="ml-2 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">warning</span>}
            </span>
            <span className="truncate text-xs text-slate-500">{Object.entries(r.meta ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>
          </li>
        ))}
        {shown.length === 0 && <p className="px-5 py-12 text-center text-slate-400">No events.</p>}
      </ul>
    </div>
  );
}

/* ────────────────────────────── snapshots ────────────────────────────── */

interface SnapRow {
  id: string;
  storagePath: string;
  clientTs: number;
  audioLevelDb: number | null;
}

function SnapshotImg({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getDownloadURL(storageRef(storage, path)).then(setUrl).catch(() => setFailed(true));
  }, [path]);
  if (failed) return <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-xs text-slate-400">unavailable</div>;
  if (!url) return <div className="aspect-[4/3] animate-pulse bg-slate-100" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Proctoring snapshot" loading="lazy" className="aspect-[4/3] w-full -scale-x-100 object-cover transition-transform duration-300 hover:scale-105" />
    </a>
  );
}

function SnapshotsTab({ submissionId }: { submissionId: string }) {
  const [rows, setRows] = useState<SnapRow[] | null>(null);
  useEffect(() => {
    getDocs(collection(db, 'submissions', submissionId, 'snapshots'))
      .then((s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SnapRow, 'id'>) })).sort((a, b) => a.clientTs - b.clientTs)))
      .catch(() => setRows([]));
  }, [submissionId]);

  if (!rows) return <p className="animate-pulse text-slate-400">Loading…</p>;
  if (!rows.length) return <p className="py-10 text-center text-slate-400">No snapshots captured.</p>;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
      {rows.map((r) => (
        <figure key={r.id} className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <SnapshotImg path={r.storagePath} />
          <figcaption className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-slate-500">
            <span>{new Date(r.clientTs).toLocaleTimeString()}</span>
            {r.audioLevelDb != null && <span className={r.audioLevelDb > -20 ? 'font-medium text-red-600' : ''}>{r.audioLevelDb} dB</span>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/* ──────────────────────────────── replay ──────────────────────────────── */

function ReplayTab({ sub, loaded, codingIds }: { sub: Submission; loaded: Loaded; codingIds: string[] }) {
  const [qid, setQid] = useState(codingIds[0]);
  if (!codingIds.length || !qid) return <p className="text-slate-500">This attempt has no coding questions.</p>;
  return (
    <div className="space-y-4">
      {codingIds.length > 1 && (
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1">
          {codingIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setQid(id)}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95',
                qid === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {loaded[id]?.question.title ?? id}
            </button>
          ))}
        </div>
      )}
      <div key={qid} className="animate-tab-enter">
        <KeystrokeReplay submissionId={sub.id} questionId={qid} submittedCode={sub.answers[qid]?.code} />
      </div>
    </div>
  );
}
