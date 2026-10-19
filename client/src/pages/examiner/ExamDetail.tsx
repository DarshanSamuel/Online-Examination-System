import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { Archive, Copy, Download, Eye, Loader2, Pencil, Rocket, ScanSearch, Trash2, UserPlus } from 'lucide-react';
import { ExaminerLayout } from '../../components/examiner/ExaminerLayout';
import { useAuth } from '../../auth/AuthProvider';
import { api, apiErrorMessage } from '../../lib/api';
import { db } from '../../lib/firebase';
import { assignCandidates, deleteDraftExam, downloadText, listQuestions, parseEmails, removeAssignment, resultsToCsv, setExamStatus } from '../../lib/examinerData';
import type { Assignment, Exam, SimilarityReport, Submission } from '../../types/examiner';
import { btnDanger, btnGhost, btnPrimary, btnSmall, card, input, statusTone } from '../../components/ui/styles';
import { cn } from '../../lib/utils';

type Tab = 'candidates' | 'results' | 'similarity';

export function ExamDetail() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>('results');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!examId) return;
    return onSnapshot(
      doc(db, 'exams', examId),
      (s) => (s.exists() ? setExam({ id: s.id, ...(s.data() as Omit<Exam, 'id'>) }) : setMissing(true)),
      () => setMissing(true),
    );
  }, [examId]);

  if (missing) return <ExaminerLayout><p className="text-red-600">Exam not found or you don't have access.</p></ExaminerLayout>;
  if (!exam) return <ExaminerLayout><p className="text-slate-400">Loading…</p></ExaminerLayout>;

  const changeStatus = async (status: Exam['status']) => {
    if (status === 'published' && !confirm('Publish this exam? Assigned candidates will be able to start it within the window.')) return;
    setBusy(true);
    try {
      await setExamStatus(exam.id, status);
    } finally {
      setBusy(false);
    }
  };

  const removeDraft = async () => {
    if (!confirm('Delete this draft exam?')) return;
    await deleteDraftExam(exam.id);
    navigate('/examiner');
  };

  return (
    <ExaminerLayout wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{exam.title}</h1>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', statusTone[exam.status])}>{exam.status}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {exam.durationMinutes} min · {exam.totalPoints} pts · {exam.window.opensAt.toDate().toLocaleString()} → {exam.window.closesAt.toDate().toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/examiner/exams/${exam.id}/edit`} className={btnGhost}>
            <Pencil className="h-4 w-4" /> Edit
          </Link>
          {exam.status === 'draft' && (
            <>
              <button className={btnDanger} onClick={removeDraft}><Trash2 className="h-4 w-4" /> Delete</button>
              <button className={btnPrimary} onClick={() => changeStatus('published')} disabled={busy}><Rocket className="h-4 w-4" /> Publish</button>
            </>
          )}
          {exam.status === 'published' && (
            <>
              <button className={btnGhost} onClick={() => changeStatus('draft')} disabled={busy}>Unpublish</button>
              <button className={btnGhost} onClick={() => changeStatus('archived')} disabled={busy}><Archive className="h-4 w-4" /> Archive</button>
            </>
          )}
          {exam.status === 'archived' && <button className={btnGhost} onClick={() => changeStatus('published')} disabled={busy}>Republish</button>}
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {(['results', 'candidates', 'similarity'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('border-b-2 px-4 pb-2.5 text-sm font-medium capitalize', tab === t ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            {t === 'similarity' ? 'Plagiarism' : t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'results' && <ResultsTab exam={exam} />}
        {tab === 'candidates' && <CandidatesTab exam={exam} />}
        {tab === 'similarity' && <SimilarityTab exam={exam} />}
      </div>
    </ExaminerLayout>
  );
}

/* ───────────────────────────── candidates ───────────────────────────── */

function CandidatesTab({ exam }: { exam: Exam }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Assignment[]>([]);
  const [raw, setRaw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'assignments'), where('examId', '==', exam.id)), (s) =>
        setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Assignment, 'id'>) })).sort((a, b) => a.candidateEmail.localeCompare(b.candidateEmail))),
      ),
    [exam.id],
  );

  const add = async () => {
    if (!user) return;
    const { valid, invalid } = parseEmails(raw);
    const existing = new Set(items.map((i) => i.candidateEmail));
    const fresh = valid.filter((e) => !existing.has(e));
    setBusy(true);
    try {
      await assignCandidates(exam, fresh, user.uid);
      setMsg(`Assigned ${fresh.length}${valid.length - fresh.length ? `, ${valid.length - fresh.length} already assigned` : ''}${invalid.length ? `, ignored invalid: ${invalid.join(', ')}` : ''}.`);
      setRaw('');
    } catch {
      setMsg('Could not assign candidates.');
    } finally {
      setBusy(false);
    }
  };

  const link = `${window.location.origin}/`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div className={cn(card, 'h-fit p-5')}>
        <h2 className="font-semibold text-slate-900">Assign candidates</h2>
        <p className="mt-1 text-xs text-slate-500">Paste Google account emails, separated by commas, spaces or new lines. Candidates must sign in with the same email.</p>
        <textarea className={cn(input, 'mt-3 min-h-32')} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="alice@school.edu&#10;bob@school.edu" />
        <button className={cn(btnPrimary, 'mt-3 w-full')} onClick={add} disabled={busy || !raw.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Assign
        </button>
        {msg && <p className="mt-3 text-xs text-slate-600">{msg}</p>}
        <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1 font-medium">Share this link with candidates</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate">{link}</code>
            <button className={btnSmall} onClick={() => void navigator.clipboard.writeText(link)}><Copy className="h-3 w-3" /> Copy</button>
          </div>
          {exam.status !== 'published' && <p className="mt-2 text-amber-700">The exam is not published yet — candidates can't start it.</p>}
        </div>
      </div>

      <div className={cn(card, 'overflow-hidden')}>
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">{items.length} assigned</div>
        <div className="divide-y divide-slate-100">
          {items.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="truncate">{a.candidateEmail}</span>
              <div className="flex items-center gap-3">
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusTone[a.status])}>{a.status}</span>
                {a.status === 'assigned' && (
                  <button className="text-slate-400 hover:text-red-600" title="Remove" onClick={() => void removeAssignment(a)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="px-5 py-10 text-center text-slate-400">Nobody assigned yet.</p>}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── results ────────────────────────────── */

function pct(s: Submission) {
  return s.grading.totalScore != null && s.grading.maxScore ? (s.grading.totalScore / s.grading.maxScore) * 100 : null;
}

function ResultsTab({ exam }: { exam: Exam }) {
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [sort, setSort] = useState<'recent' | 'score' | 'warnings'>('recent');

  useEffect(
    () => onSnapshot(query(collection(db, 'submissions'), where('examId', '==', exam.id)), (s) => setSubs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, 'id'>) })))),
    [exam.id],
  );

  const sorted = useMemo(() => {
    const list = [...(subs ?? [])];
    if (sort === 'score') list.sort((a, b) => (pct(b) ?? -1) - (pct(a) ?? -1));
    else if (sort === 'warnings') list.sort((a, b) => b.proctoring.warningCount - a.proctoring.warningCount);
    else list.sort((a, b) => b.timing.startedAt.toMillis() - a.timing.startedAt.toMillis());
    return list;
  }, [subs, sort]);

  const stats = useMemo(() => {
    const scored = (subs ?? []).map(pct).filter((v): v is number => v != null);
    const buckets = Array.from({ length: 10 }, () => 0);
    scored.forEach((v) => (buckets[Math.min(9, Math.floor(v / 10))]! += 1));
    return {
      total: subs?.length ?? 0,
      live: (subs ?? []).filter((s) => s.status === 'in_progress').length,
      avg: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
      max: scored.length ? Math.max(...scored) : null,
      min: scored.length ? Math.min(...scored) : null,
      flagged: (subs ?? []).filter((s) => s.proctoring.warningCount > 0).length,
      buckets,
    };
  }, [subs]);

  if (subs === null) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Attempts', stats.total],
          ['Live now', stats.live],
          ['Average', stats.avg != null ? `${stats.avg.toFixed(1)}%` : '—'],
          ['Highest', stats.max != null ? `${stats.max.toFixed(1)}%` : '—'],
          ['Lowest', stats.min != null ? `${stats.min.toFixed(1)}%` : '—'],
          ['With warnings', stats.flagged],
        ].map(([k, v]) => (
          <div key={k as string} className={cn(card, 'p-4')}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{k}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{v}</p>
          </div>
        ))}
      </div>

      {stats.buckets.some(Boolean) && (
        <div className={cn(card, 'p-5')}>
          <p className="mb-3 text-sm font-semibold text-slate-900">Score distribution</p>
          <div className="flex h-24 items-end gap-2">
            {stats.buckets.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-primary-500" style={{ height: `${(n / Math.max(...stats.buckets)) * 100}%`, minHeight: n ? 4 : 0 }} title={`${n} candidates`} />
                <span className="text-[10px] text-slate-400">{i * 10}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={cn(card, 'overflow-hidden')}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <select className={cn(input, 'w-44 py-1')} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="recent">Most recent</option>
            <option value="score">Highest score</option>
            <option value="warnings">Most warnings</option>
          </select>
          <button className={btnSmall} disabled={!sorted.length} onClick={() => downloadText(`${exam.title.replace(/\W+/g, '_')}_results.csv`, resultsToCsv(sorted))}>
            <Download className="h-3 w-3" /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {['Candidate', 'Status', 'Score', 'Warnings', 'Tabs', 'Clipboard', 'Audio', 'Started', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((s) => {
                const p = pct(s);
                const pasted = Object.values(s.keystrokeStats ?? {}).reduce((a, k) => a + k.pastedChars, 0);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.candidateName}</p>
                      <p className="text-xs text-slate-500">{s.candidateEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusTone[s.status])}>{s.status.replace('_', ' ')}</span>
                      {s.submitReason && s.submitReason !== 'manual' && <p className="mt-0.5 text-[11px] text-slate-500">{s.submitReason.replace('_', ' ')}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono">{s.grading.totalScore != null ? `${s.grading.totalScore}/${s.grading.maxScore} (${p?.toFixed(0)}%)` : '—'}</td>
                    <td className={cn('px-4 py-3 font-medium', s.proctoring.warningCount ? 'text-red-600' : 'text-slate-400')}>{s.proctoring.warningCount}</td>
                    <td className="px-4 py-3">{s.proctoring.tabSwitches}</td>
                    <td className={cn('px-4 py-3', s.proctoring.clipboardAttempts || pasted ? 'font-medium text-amber-700' : '')}>{s.proctoring.clipboardAttempts}{pasted ? ` · ${pasted}ch pasted` : ''}</td>
                    <td className="px-4 py-3">{s.proctoring.audioFlags}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.timing.startedAt.toDate().toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/examiner/submissions/${s.id}`} className={btnSmall}><Eye className="h-3 w-3" /> Review</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length === 0 && <p className="px-5 py-12 text-center text-slate-400">No attempts yet.</p>}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── plagiarism ───────────────────────────── */

function SimilarityTab({ exam }: { exam: Exam }) {
  const { user } = useAuth();
  const [threshold, setThreshold] = useState(0.6);
  const [running, setRunning] = useState(false);
  const [reports, setReports] = useState<SimilarityReport[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'similarityReports'), where('examId', '==', exam.id)));
    setReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SimilarityReport, 'id'>) })));
  }, [exam.id]);

  useEffect(() => {
    void load().catch(() => setReports([]));
    if (user) void listQuestions(user.uid).then((qs) => setTitles(Object.fromEntries(qs.map((q) => [q.id, q.title]))));
  }, [load, user]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await api.post(`/examiner/exams/${exam.id}/similarity`, { threshold });
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={cn(card, 'flex flex-wrap items-end gap-4 p-5')}>
        <div className="min-w-64 flex-1">
          <p className="font-semibold text-slate-900">Code similarity check</p>
          <p className="text-xs text-slate-500">
            Compares every pair of submitted solutions per coding question (same language) using token-normalized winnowing — renamed variables and reformatting don't hide copying.
            Run it after the exam has closed and grading has finished.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Flag at ≥ {Math.round(threshold * 100)}%</label>
          <input type="range" min={0.3} max={1} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </div>
        <button className={btnPrimary} onClick={run} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Run check
        </button>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {reports === null && <p className="text-slate-400">Loading…</p>}
      {reports?.length === 0 && <p className="text-center text-slate-400">No report yet. Run the check to generate one.</p>}

      {reports?.map((r) => (
        <div key={r.id} className={cn(card, 'overflow-hidden')}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <p className="font-semibold text-slate-900">{titles[r.questionId] ?? r.questionId}</p>
            <p className="text-xs text-slate-500">
              {r.comparedSubmissions} submissions compared · threshold {Math.round(r.threshold * 100)}% · {r.generatedAt.toDate().toLocaleString()}
            </p>
          </div>
          {r.pairs.length === 0 ? (
            <p className="px-5 py-6 text-sm text-emerald-700">No suspicious pairs found.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Candidate A</th>
                  <th className="px-5 py-2 font-medium">Candidate B</th>
                  <th className="px-5 py-2 font-medium">Language</th>
                  <th className="px-5 py-2 font-medium">Similarity</th>
                  <th className="px-5 py-2 font-medium">Containment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.pairs.map((p, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2.5"><Link className="text-primary-600 hover:underline" to={`/examiner/submissions/${p.submissionA}`}>{p.candidateA}</Link></td>
                    <td className="px-5 py-2.5"><Link className="text-primary-600 hover:underline" to={`/examiner/submissions/${p.submissionB}`}>{p.candidateB}</Link></td>
                    <td className="px-5 py-2.5">{p.language}</td>
                    <td className="px-5 py-2.5"><Bar value={p.jaccard} /></td>
                    <td className="px-5 py-2.5"><Bar value={p.containment} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const tone = value >= 0.85 ? 'bg-red-500' : value >= 0.7 ? 'bg-amber-500' : 'bg-yellow-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded bg-slate-200">
        <div className={cn('h-full', tone)} style={{ width: `${value * 100}%` }} />
      </div>
      <span className="font-mono text-xs">{Math.round(value * 100)}%</span>
    </div>
  );
}
