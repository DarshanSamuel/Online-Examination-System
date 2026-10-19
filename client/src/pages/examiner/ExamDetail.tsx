import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { Archive, BarChart3, Copy, Download, Eye, Loader2, Pencil, Rocket, ScanSearch, Trash2, UserPlus, Users } from 'lucide-react';
import { ExaminerLayout } from '../../components/examiner/ExaminerLayout';
import { AttemptTrendBadge, AttemptTrendChart, getResolvedAttempts } from '../../components/examiner/AttemptTrendChart';
import { useAuth } from '../../auth/AuthProvider';
import { api, apiErrorMessage } from '../../lib/api';
import { db } from '../../lib/firebase';
import { assignCandidates, deleteDraftExam, downloadText, listQuestions, normalizeExam, parseEmails, removeAssignment, resultsToCsv, setExamStatus } from '../../lib/examinerData';
import type { Assignment, Exam, SimilarityReport, Submission } from '../../types/examiner';
import { btnDanger, btnGhost, btnPrimary, btnSmall, card, input, statusTone } from '../../components/ui/styles';
import { cn } from '../../lib/utils';

type Tab = 'candidates' | 'results' | 'similarity';

const TAB_META: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'results', label: 'Results', icon: BarChart3 },
  { key: 'candidates', label: 'Candidates', icon: Users },
  { key: 'similarity', label: 'Plagiarism', icon: ScanSearch },
];

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
      (s) => (s.exists() ? setExam(normalizeExam(s.id, s.data() as Record<string, unknown>)) : setMissing(true)),
      () => setMissing(true),
    );
  }, [examId]);

  if (missing) return <ExaminerLayout><p className="text-red-600">Exam not found or you don't have access.</p></ExaminerLayout>;
  if (!exam) return <ExaminerLayout><p className="animate-pulse text-slate-400">Loading…</p></ExaminerLayout>;

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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{exam.title}</h1>
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

      {/* Smooth Segmented Pill Tabs */}
      <div className="mt-6 inline-flex rounded-2xl border border-slate-200/90 bg-slate-100/80 p-1.5">
        {TAB_META.map(({ key, label, icon: Icon }) => (
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
      <div className={cn(card, 'h-fit p-6')}>
        <h2 className="font-semibold text-slate-900">Assign candidates</h2>
        <p className="mt-1 text-xs text-slate-500">Paste Google account emails, separated by commas, spaces or new lines. Candidates must sign in with the same email.</p>
        <textarea className={cn(input, 'mt-3 min-h-32')} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="alice@school.edu&#10;bob@school.edu" />
        <button className={cn(btnPrimary, 'mt-3 w-full')} onClick={add} disabled={busy || !raw.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Assign
        </button>
        {msg && <p className="animate-tab-enter mt-3 text-xs font-medium text-primary-700">{msg}</p>}
        <div className="mt-5 rounded-xl border border-slate-200/70 bg-slate-50/80 p-3.5 text-xs text-slate-600">
          <p className="mb-1.5 font-medium text-slate-700">Share this link with candidates</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200/80">{link}</code>
            <button className={btnSmall} onClick={() => void navigator.clipboard.writeText(link)}><Copy className="h-3 w-3" /> Copy</button>
          </div>
          {exam.status !== 'published' && <p className="mt-2.5 font-medium text-amber-700">The exam is not published yet — candidates can't start it.</p>}
        </div>
      </div>

      <div className={cn(card, 'overflow-hidden')}>
        <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-900">{items.length} assigned</div>
        <div className="divide-y divide-slate-100">
          {items.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3.5 text-sm transition-colors hover:bg-slate-50/80">
              <span className="truncate font-medium text-slate-800">{a.candidateEmail}</span>
              <div className="flex items-center gap-3">
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusTone[a.status])}>{a.status}</span>
                {a.status === 'assigned' && (
                  <button className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Remove" onClick={() => void removeAssignment(a)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="px-5 py-12 text-center text-slate-400">Nobody assigned yet.</p>}
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
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

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

  const activeSub = useMemo(() => {
    if (!sorted.length) return null;
    return sorted.find((s) => s.id === selectedSubId) ?? sorted[0]!;
  }, [sorted, selectedSubId]);

  const stats = useMemo(() => {
    const scored = (subs ?? []).map(pct).filter((v): v is number => v != null);
    const buckets = Array.from({ length: 10 }, () => 0);
    scored.forEach((v) => (buckets[Math.min(9, Math.floor(v / 10))]! += 1));
    const totalAttemptsAcrossAll = (subs ?? []).reduce((acc, s) => acc + (s.attemptCount ?? 1), 0);
    return {
      total: subs?.length ?? 0,
      totalAttemptsAcrossAll,
      live: (subs ?? []).filter((s) => s.status === 'in_progress').length,
      avg: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
      max: scored.length ? Math.max(...scored) : null,
      min: scored.length ? Math.min(...scored) : null,
      flagged: (subs ?? []).filter((s) => s.proctoring.warningCount > 0).length,
      buckets,
    };
  }, [subs]);

  if (subs === null) return <p className="animate-pulse text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Candidates / Runs', `${stats.total} (${stats.totalAttemptsAcrossAll} runs)`],
          ['Live now', stats.live],
          ['Average', stats.avg != null ? `${stats.avg.toFixed(1)}%` : '—'],
          ['Highest', stats.max != null ? `${stats.max.toFixed(1)}%` : '—'],
          ['Lowest', stats.min != null ? `${stats.min.toFixed(1)}%` : '—'],
          ['With warnings', stats.flagged],
        ].map(([k, v]) => (
          <div key={k as string} className={cn(card, 'p-4 transition-transform duration-200 hover:-translate-y-0.5')}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k}</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">{v}</p>
          </div>
        ))}
      </div>

      {stats.buckets.some(Boolean) && (
        <div className={cn(card, 'p-5')}>
          <p className="mb-3 text-sm font-semibold text-slate-900">Score distribution</p>
          <div className="flex h-24 items-end gap-2">
            {stats.buckets.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-primary-600 to-primary-400 transition-all duration-500 ease-out"
                  style={{ height: `${(n / Math.max(...stats.buckets)) * 100}%`, minHeight: n ? 4 : 0 }}
                  title={`${n} candidates`}
                />
                <span className="text-[10px] font-medium text-slate-400">{i * 10}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Candidate Attempt Progression & Improvement / Depreciation Graph */}
      {activeSub && (
        <div className="space-y-3">
          {sorted.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Select candidate for Attempt Graph:</span>
              {sorted.map((c) => {
                const count = getResolvedAttempts(c).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedSubId(c.id)}
                    className={cn(
                      'cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95',
                      activeSub.id === c.id
                        ? 'bg-primary-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
                    )}
                  >
                    {c.candidateName} ({count} {count === 1 ? 'attempt' : 'attempts'})
                  </button>
                );
              })}
            </div>
          )}
          <AttemptTrendChart attempts={getResolvedAttempts(activeSub)} candidateName={activeSub.candidateName} />
        </div>
      )}

      <div className={cn(card, 'overflow-hidden')}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-1">
            {(
              [
                ['recent', 'Most recent'],
                ['score', 'Highest score'],
                ['warnings', 'Most warnings'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={cn(
                  'cursor-pointer rounded-lg px-3 py-1 text-xs font-medium transition-all duration-200 active:scale-95',
                  sort === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {lbl}
              </button>
            ))}
          </div>
          <button className={btnSmall} disabled={!sorted.length} onClick={() => downloadText(`${exam.title.replace(/\W+/g, '_')}_results.csv`, resultsToCsv(sorted))}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                {['Candidate', 'Status', 'Latest Score', 'All Attempts & Trend', 'Warnings', 'Tabs', 'Clipboard', 'Started', ''].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((s) => {
                const p = pct(s);
                const pasted = Object.values(s.keystrokeStats ?? {}).reduce((a, k) => a + k.pastedChars, 0);
                const attempts = getResolvedAttempts(s);
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSubId(s.id)}
                    className={cn(
                      'cursor-pointer transition-colors duration-150 hover:bg-slate-50/80',
                      activeSub?.id === s.id && 'bg-primary-50/30',
                    )}
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-900">{s.candidateName}</p>
                      <p className="text-xs text-slate-500">{s.candidateEmail}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusTone[s.status])}>{s.status.replace('_', ' ')}</span>
                      {s.submitReason && s.submitReason !== 'manual' && <p className="mt-0.5 text-[11px] text-slate-500">{s.submitReason.replace('_', ' ')}</p>}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-medium">{s.grading.totalScore != null ? `${s.grading.totalScore}/${s.grading.maxScore} (${p?.toFixed(0)}%)` : '—'}</td>
                    <td className="px-4 py-3.5">
                      <AttemptTrendBadge attempts={attempts} />
                    </td>
                    <td className={cn('px-4 py-3.5 font-semibold', s.proctoring.warningCount ? 'text-red-600' : 'text-slate-400')}>{s.proctoring.warningCount}</td>
                    <td className="px-4 py-3.5">{s.proctoring.tabSwitches}</td>
                    <td className={cn('px-4 py-3.5', s.proctoring.clipboardAttempts || pasted ? 'font-medium text-amber-700' : '')}>{s.proctoring.clipboardAttempts}{pasted ? ` · ${pasted}ch pasted` : ''}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">{s.timing.startedAt.toDate().toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/examiner/submissions/${s.id}`} className={btnSmall}><Eye className="h-3.5 w-3.5" /> Review</Link>
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
      <div className={cn(card, 'flex flex-wrap items-end gap-4 p-6')}>
        <div className="min-w-64 flex-1">
          <p className="font-semibold text-slate-900">Code similarity check</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Compares every pair of submitted solutions per coding question (same language) using token-normalized winnowing — renamed variables and reformatting don't hide copying.
            Run it after the exam has closed and grading has finished.
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Flag at ≥ {Math.round(threshold * 100)}%</label>
          <input type="range" min={0.3} max={1} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="accent-primary-600" />
        </div>
        <button className={btnPrimary} onClick={run} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Run check
        </button>
      </div>
      {error && <p className="animate-tab-enter rounded-xl bg-red-50 p-3.5 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}

      {reports === null && <p className="animate-pulse text-slate-400">Loading…</p>}
      {reports?.length === 0 && <p className="py-10 text-center text-slate-400">No report yet. Run the check to generate one.</p>}

      {reports?.map((r) => (
        <div key={r.id} className={cn(card, 'animate-tab-enter overflow-hidden')}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
            <p className="font-semibold text-slate-900">{titles[r.questionId] ?? r.questionId}</p>
            <p className="text-xs text-slate-500">
              {r.comparedSubmissions} submissions compared · threshold {Math.round(r.threshold * 100)}% · {r.generatedAt.toDate().toLocaleString()}
            </p>
          </div>
          {r.pairs.length === 0 ? (
            <p className="px-5 py-6 text-sm font-medium text-emerald-700">No suspicious pairs found.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Candidate A</th>
                  <th className="px-5 py-2.5 font-semibold">Candidate B</th>
                  <th className="px-5 py-2.5 font-semibold">Language</th>
                  <th className="px-5 py-2.5 font-semibold">Similarity</th>
                  <th className="px-5 py-2.5 font-semibold">Containment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.pairs.map((p, i) => (
                  <tr key={i} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-5 py-3"><Link className="font-medium text-primary-600 hover:underline" to={`/examiner/submissions/${p.submissionA}`}>{p.candidateA}</Link></td>
                    <td className="px-5 py-3"><Link className="font-medium text-primary-600 hover:underline" to={`/examiner/submissions/${p.submissionB}`}>{p.candidateB}</Link></td>
                    <td className="px-5 py-3 uppercase text-xs font-medium text-slate-500">{p.language}</td>
                    <td className="px-5 py-3"><Bar value={p.jaccard} /></td>
                    <td className="px-5 py-3"><Bar value={p.containment} /></td>
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
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
        <div className={cn('h-full rounded-full transition-all duration-500 ease-out', tone)} style={{ width: `${value * 100}%` }} />
      </div>
      <span className="font-mono text-xs font-medium">{Math.round(value * 100)}%</span>
    </div>
  );
}
