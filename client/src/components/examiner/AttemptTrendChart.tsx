import { useState } from 'react';
import { Check, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { asTimestamp } from '../../lib/examinerData';
import type { Submission } from '../../types/examiner';
import { card, statusTone } from '../ui/styles';
import { cn } from '../../lib/utils';

export interface NormalizedAttempt {
  attemptNumber: number;
  status: string;
  totalScore: number | null;
  maxScore: number | null;
  pct: number | null;
  warningCount: number;
  submittedAtMs: number | null;
  startedAtMs?: number | null;
  submitReason?: string | null;
  perQuestion?: Record<string, { score: number; maxScore: number; status: string }>;
}

/**
 * Combines `sub.attemptHistory` with the current top-level submission state so
 * every attempt (1..n) is represented in chronological order.
 */
export function getResolvedAttempts(sub: Submission): NormalizedAttempt[] {
  const byNum = new Map<number, NormalizedAttempt>();

  for (const h of sub.attemptHistory ?? []) {
    const pct = h.totalScore != null && h.maxScore ? (h.totalScore / h.maxScore) * 100 : null;
    byNum.set(h.attemptNumber, {
      attemptNumber: h.attemptNumber,
      status: h.status,
      totalScore: h.totalScore,
      maxScore: h.maxScore,
      pct,
      warningCount: h.warningCount ?? 0,
      submittedAtMs: h.submittedAt ? asTimestamp(h.submittedAt).toMillis() : null,
      startedAtMs: h.startedAt ? asTimestamp(h.startedAt).toMillis() : null,
      submitReason: h.submitReason ?? null,
      perQuestion: h.perQuestion,
    });
  }

  const currentNum = sub.attemptCount ?? Math.max(1, byNum.size);
  const currentPct =
    sub.grading.totalScore != null && sub.grading.maxScore
      ? (sub.grading.totalScore / sub.grading.maxScore) * 100
      : null;

  // Always ensure the latest attempt reflects live grading/status updates.
  byNum.set(currentNum, {
    attemptNumber: currentNum,
    status: sub.status,
    totalScore: sub.grading.totalScore,
    maxScore: sub.grading.maxScore,
    pct: currentPct,
    warningCount: sub.proctoring.warningCount,
    submittedAtMs: sub.timing.submittedAt ? asTimestamp(sub.timing.submittedAt).toMillis() : null,
    startedAtMs: sub.timing.startedAt ? asTimestamp(sub.timing.startedAt).toMillis() : null,
    submitReason: sub.submitReason ?? null,
    perQuestion: sub.grading.perQuestion,
  });

  return Array.from(byNum.values()).sort((a, b) => a.attemptNumber - b.attemptNumber);
}

export function computeTrendSummary(attempts: NormalizedAttempt[]) {
  const scored = attempts.filter((a): a is NormalizedAttempt & { pct: number } => a.pct != null);
  if (scored.length === 0) {
    return {
      scored,
      first: null,
      latest: null,
      best: null,
      netDeltaPct: null,
      netDeltaMarks: null,
      direction: 'none' as const,
    };
  }
  const first = scored[0]!;
  const latest = scored[scored.length - 1]!;
  const best = scored.reduce((acc, cur) => (cur.pct > acc.pct ? cur : acc), first);
  const netDeltaPct = scored.length > 1 ? latest.pct - first.pct : null;
  const netDeltaMarks =
    scored.length > 1 && latest.totalScore != null && first.totalScore != null
      ? Math.round((latest.totalScore - first.totalScore) * 100) / 100
      : null;
  const direction: 'improvement' | 'depreciation' | 'steady' | 'single' =
    netDeltaPct == null
      ? 'single'
      : netDeltaPct > 0.05
        ? 'improvement'
        : netDeltaPct < -0.05
          ? 'depreciation'
          : 'steady';

  return { scored, first, latest, best, netDeltaPct, netDeltaMarks, direction };
}

/**
 * Compact badge + per-attempt score pills for the Examiner Results table.
 */
export function AttemptTrendBadge({ attempts }: { attempts: NormalizedAttempt[] }) {
  const { netDeltaPct, direction } = computeTrendSummary(attempts);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {attempts.map((a) => (
          <span
            key={a.attemptNumber}
            title={`Attempt #${a.attemptNumber}: ${a.totalScore ?? '—'}/${a.maxScore ?? '—'} (${a.pct != null ? `${a.pct.toFixed(1)}%` : a.status})`}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200/80"
          >
            <span className="text-slate-400">#{a.attemptNumber}</span>
            {a.totalScore != null && a.maxScore != null ? (
              <span>
                {a.totalScore}/{a.maxScore} <span className="text-slate-400">({a.pct?.toFixed(0)}%)</span>
              </span>
            ) : (
              <span className="italic text-slate-400">{a.status.replace('_', ' ')}</span>
            )}
          </span>
        ))}
      </div>

      {direction === 'improvement' && netDeltaPct != null && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <TrendingUp className="h-3 w-3" /> +{netDeltaPct.toFixed(1)}% Improvement
        </span>
      )}
      {direction === 'depreciation' && netDeltaPct != null && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">
          <TrendingDown className="h-3 w-3" /> {netDeltaPct.toFixed(1)}% Depreciation
        </span>
      )}
      {direction === 'steady' && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
          <Minus className="h-3 w-3" /> 0.0% No change
        </span>
      )}
    </div>
  );
}

/**
 * Full SVG Trajectory & Improvement / Depreciation Graph across all attempts.
 * Supports interactive attempt selection to view individual attempt metrics.
 */
export function AttemptTrendChart({
  attempts,
  candidateName,
  selectedAttemptNumber,
  onSelectAttempt,
  className,
}: {
  attempts: NormalizedAttempt[];
  candidateName?: string;
  selectedAttemptNumber?: number;
  onSelectAttempt?: (attemptNumber: number) => void;
  className?: string;
}) {
  const { scored, first, latest, best, netDeltaPct, netDeltaMarks, direction } = computeTrendSummary(attempts);

  const defaultNum = attempts.length > 0 ? attempts[attempts.length - 1]!.attemptNumber : 1;
  const [internalSelected, setInternalSelected] = useState<number>(defaultNum);
  const activeNum = selectedAttemptNumber ?? internalSelected;

  const handleSelect = (num: number) => {
    setInternalSelected(num);
    onSelectAttempt?.(num);
  };

  // SVG coordinate system
  const width = 680;
  const height = 230;
  const padLeft = 48;
  const padRight = 36;
  const padTop = 34;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const points = attempts.map((a, idx) => {
    const x =
      attempts.length === 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (attempts.length - 1)) * plotW;
    const clampedPct = Math.max(0, Math.min(100, a.pct ?? 0));
    const y = padTop + plotH - (clampedPct / 100) * plotH;
    const prev = idx > 0 ? attempts[idx - 1] : null;
    const stepDeltaPct =
      a.pct != null && prev?.pct != null ? a.pct - prev.pct : null;
    const stepDeltaMarks =
      a.totalScore != null && prev?.totalScore != null
        ? Math.round((a.totalScore - prev.totalScore) * 100) / 100
        : null;

    let durationStr: string | null = null;
    if (a.startedAtMs && a.submittedAtMs && a.submittedAtMs > a.startedAtMs) {
      const diffSec = Math.floor((a.submittedAtMs - a.startedAtMs) / 1000);
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      durationStr = mins === 0 ? `${secs}s` : secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
    }

    return { ...a, x, y, clampedPct, stepDeltaPct, stepDeltaMarks, durationStr };
  });

  const selectedPoint = points.find((p) => p.attemptNumber === activeNum) ?? points[points.length - 1];

  return (
    <div className={cn(card, 'p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold tracking-tight text-slate-900">
            {candidateName ? `${candidateName} — Attempt Progression & Trend` : 'Attempt Progression & Improvement / Depreciation Graph'}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Marks and percentage trajectory across all {attempts.length} {attempts.length === 1 ? 'attempt' : 'attempts'}. Click any attempt or data point to inspect its metrics.
          </p>
        </div>

        {direction === 'improvement' && netDeltaPct != null && (
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <TrendingUp className="h-4 w-4" />
            Net Improvement: +{netDeltaPct.toFixed(1)}% ({netDeltaMarks != null && netDeltaMarks >= 0 ? `+${netDeltaMarks}` : netDeltaMarks} pts)
          </div>
        )}
        {direction === 'depreciation' && netDeltaPct != null && (
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
            <TrendingDown className="h-4 w-4" />
            Net Depreciation: {netDeltaPct.toFixed(1)}% ({netDeltaMarks} pts)
          </div>
        )}
        {direction === 'steady' && (
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
            <Minus className="h-4 w-4" />
            Steady Score (0.0% net change)
          </div>
        )}
      </div>

      {/* Interactive Attempt Selection Pills */}
      {attempts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-slate-100 py-3">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Select Attempt:
          </span>
          {points.map((p) => {
            const isSelected = p.attemptNumber === activeNum;
            return (
              <button
                key={p.attemptNumber}
                type="button"
                onClick={() => handleSelect(p.attemptNumber)}
                className={cn(
                  'cursor-pointer inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95',
                  isSelected
                    ? 'bg-primary-600 text-white shadow-xs font-semibold ring-2 ring-primary-500/20'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80',
                )}
              >
                <span>Attempt #{p.attemptNumber}</span>
                {p.totalScore != null && p.maxScore != null ? (
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.2 font-mono text-[10px] font-semibold',
                      isSelected ? 'bg-white/20 text-white' : 'bg-white text-slate-700 shadow-2xs',
                    )}
                  >
                    {p.totalScore}/{p.maxScore}
                  </span>
                ) : (
                  <span className="italic opacity-80 text-[10px]">({p.status})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Attempt Detailed Metrics Card */}
      {selectedPoint && (
        <div className="mt-4 rounded-xl border border-primary-200/90 bg-gradient-to-br from-primary-50/50 via-white to-slate-50/60 p-4 shadow-2xs animate-tab-enter">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100/70 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 font-mono text-xs font-bold text-white shadow-xs">
                #{selectedPoint.attemptNumber}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    Attempt #{selectedPoint.attemptNumber} Metrics & Performance
                  </h4>
                  {selectedPoint.attemptNumber === latest?.attemptNumber && (
                    <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                      Latest Attempt
                    </span>
                  )}
                  {selectedPoint.attemptNumber === best?.attemptNumber && (
                    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      Best Score
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {selectedPoint.submittedAtMs
                    ? `Submitted on ${new Date(selectedPoint.submittedAtMs).toLocaleString()}`
                    : 'Status: ' + selectedPoint.status.replace('_', ' ')}
                </p>
              </div>
            </div>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', statusTone[selectedPoint.status] ?? 'bg-slate-100 text-slate-700')}>
              {selectedPoint.status.replace('_', ' ')}
            </span>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Score & Percentage</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900">
                {selectedPoint.totalScore != null && selectedPoint.maxScore != null
                  ? `${selectedPoint.totalScore} / ${selectedPoint.maxScore}`
                  : '—'}
              </p>
              <p className="text-xs font-semibold text-primary-600">
                {selectedPoint.pct != null ? `${selectedPoint.pct.toFixed(1)}%` : 'Ungraded'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Change vs Previous</p>
              <div className="mt-1 font-mono text-sm font-bold">
                {selectedPoint.stepDeltaPct == null ? (
                  <span className="text-slate-400 font-normal">Baseline (Attempt #1)</span>
                ) : selectedPoint.stepDeltaPct > 0.05 ? (
                  <span className="flex items-center gap-1 text-emerald-600 font-bold">
                    <TrendingUp className="h-4 w-4" /> +{selectedPoint.stepDeltaPct.toFixed(1)}% ({selectedPoint.stepDeltaMarks != null && selectedPoint.stepDeltaMarks >= 0 ? `+${selectedPoint.stepDeltaMarks}` : selectedPoint.stepDeltaMarks} pts)
                  </span>
                ) : selectedPoint.stepDeltaPct < -0.05 ? (
                  <span className="flex items-center gap-1 text-red-600 font-bold">
                    <TrendingDown className="h-4 w-4" /> {selectedPoint.stepDeltaPct.toFixed(1)}% ({selectedPoint.stepDeltaMarks} pts)
                  </span>
                ) : (
                  <span className="text-slate-600 font-medium">0.0% (No change)</span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {selectedPoint.attemptNumber > 1 ? `vs Attempt #${selectedPoint.attemptNumber - 1}` : 'Initial baseline'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Proctoring Flags</p>
              <p className={cn('mt-1 text-lg font-bold', selectedPoint.warningCount > 0 ? 'text-amber-600' : 'text-slate-900')}>
                {selectedPoint.warningCount} {selectedPoint.warningCount === 1 ? 'warning' : 'warnings'}
              </p>
              <p className="text-[11px] text-slate-400">
                {selectedPoint.warningCount === 0 ? 'Zero warnings recorded' : 'Integrity warnings logged'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Reason & Duration</p>
              <p className="mt-1 truncate text-sm font-semibold capitalize text-slate-800" title={selectedPoint.submitReason ?? 'normal'}>
                {selectedPoint.submitReason ? selectedPoint.submitReason.replace(/_/g, ' ') : 'Normal submit'}
              </p>
              <p className="text-[11px] text-slate-400">
                {selectedPoint.durationStr ?? (selectedPoint.submittedAtMs ? 'Submitted' : 'In progress')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary metrics cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Attempts</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{attempts.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">First Attempt (#1)</p>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900">
            {first ? `${first.totalScore}/${first.maxScore} (${first.pct.toFixed(0)}%)` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Latest Attempt (#{latest?.attemptNumber ?? attempts.length})</p>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900">
            {latest ? `${latest.totalScore}/${latest.maxScore} (${latest.pct.toFixed(0)}%)` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Peak / Best Score</p>
          <p className="mt-1 font-mono text-lg font-bold text-primary-600">
            {best ? `${best.totalScore}/${best.maxScore} (${best.pct.toFixed(0)}%)` : '—'}
          </p>
        </div>
      </div>

      {/* SVG Line + Bar Trajectory Chart */}
      {scored.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-50/40 p-3">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full min-w-[480px]">
            {/* Horizontal grid lines */}
            {[0, 25, 50, 75, 100].map((g) => {
              const y = padTop + plotH - (g / 100) * plotH;
              return (
                <g key={g}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray={g === 0 ? undefined : '4 4'}
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 font-mono text-[10px]"
                  >
                    {g}%
                  </text>
                </g>
              );
            })}

            {/* Bars for each attempt */}
            {points.map((p) => {
              const barW = Math.min(44, Math.max(20, plotW / Math.max(2, points.length * 2.2)));
              const barH = Math.max(2, padTop + plotH - p.y);
              const isSelected = p.attemptNumber === activeNum;
              const fill = isSelected
                ? 'rgba(99, 102, 241, 0.35)'
                : p.stepDeltaPct == null
                  ? 'rgba(99, 102, 241, 0.16)'
                  : p.stepDeltaPct > 0.05
                    ? 'rgba(16, 185, 129, 0.18)'
                    : p.stepDeltaPct < -0.05
                      ? 'rgba(239, 68, 68, 0.18)'
                      : 'rgba(148, 163, 184, 0.2)';
              return (
                <rect
                  key={`bar-${p.attemptNumber}`}
                  x={p.x - barW / 2}
                  y={p.y}
                  width={barW}
                  height={barH}
                  rx={6}
                  fill={fill}
                  onClick={() => handleSelect(p.attemptNumber)}
                  className="cursor-pointer transition-all hover:opacity-80"
                />
              );
            })}

            {/* Connecting segments colored by improvement (green) or depreciation (red) */}
            {points.map((p, idx) => {
              if (idx === 0) return null;
              const prev = points[idx - 1]!;
              if (prev.pct == null || p.pct == null) return null;
              const stroke =
                p.stepDeltaPct != null && p.stepDeltaPct > 0.05
                  ? '#10b981'
                  : p.stepDeltaPct != null && p.stepDeltaPct < -0.05
                    ? '#ef4444'
                    : '#6366f1';
              return (
                <line
                  key={`seg-${prev.attemptNumber}-${p.attemptNumber}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={stroke}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Data nodes & labels */}
            {points.map((p) => {
              const isSelected = p.attemptNumber === activeNum;
              const dotColor =
                p.stepDeltaPct == null
                  ? '#6366f1'
                  : p.stepDeltaPct > 0.05
                    ? '#10b981'
                    : p.stepDeltaPct < -0.05
                      ? '#ef4444'
                      : '#6366f1';

              return (
                <g
                  key={`pt-${p.attemptNumber}`}
                  onClick={() => handleSelect(p.attemptNumber)}
                  className="cursor-pointer group"
                >
                  {/* Active selection pulsing halo */}
                  {isSelected && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={12}
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 8 : 6}
                    fill={dotColor}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? 3 : 2}
                    className="transition-transform duration-150 group-hover:scale-125"
                  />
                  {/* Score label above node */}
                  <text
                    x={p.x}
                    y={Math.max(14, p.y - 12)}
                    textAnchor="middle"
                    className={cn(
                      'font-mono text-[11px] font-bold',
                      isSelected ? 'fill-primary-700 font-extrabold' : 'fill-slate-800',
                    )}
                  >
                    {p.totalScore != null && p.maxScore != null
                      ? `${p.totalScore}/${p.maxScore} (${p.pct?.toFixed(0)}%)`
                      : p.status}
                  </text>
                  {/* Step delta badge */}
                  {p.stepDeltaPct != null && (
                    <text
                      x={p.x}
                      y={Math.max(26, p.y - 24)}
                      textAnchor="middle"
                      fill={p.stepDeltaPct > 0.05 ? '#059669' : p.stepDeltaPct < -0.05 ? '#dc2626' : '#64748b'}
                      className="font-mono text-[10px] font-semibold"
                    >
                      {p.stepDeltaPct > 0 ? `▲ +${p.stepDeltaPct.toFixed(1)}%` : p.stepDeltaPct < 0 ? `▼ ${p.stepDeltaPct.toFixed(1)}%` : '━ 0%'}
                    </text>
                  )}
                  {/* X-axis label */}
                  <text
                    x={p.x}
                    y={height - 14}
                    textAnchor="middle"
                    className={cn(
                      'font-sans text-[11px] font-semibold',
                      isSelected ? 'fill-primary-700 font-bold' : 'fill-slate-600',
                    )}
                  >
                    Attempt #{p.attemptNumber}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Detailed Marks Table across all attempts */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/90 uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Attempt</th>
              <th className="px-4 py-2.5 font-semibold">Marks</th>
              <th className="px-4 py-2.5 font-semibold">Percentage</th>
              <th className="px-4 py-2.5 font-semibold">Change vs Previous</th>
              <th className="px-4 py-2.5 font-semibold">Warnings</th>
              <th className="px-4 py-2.5 font-semibold">Submitted At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {points.map((p) => {
              const isSelected = p.attemptNumber === activeNum;
              return (
                <tr
                  key={p.attemptNumber}
                  onClick={() => handleSelect(p.attemptNumber)}
                  className={cn(
                    'cursor-pointer transition-colors duration-150',
                    isSelected
                      ? 'bg-primary-50/70 font-semibold ring-1 ring-inset ring-primary-300 text-primary-950'
                      : 'hover:bg-slate-50/80',
                  )}
                >
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="selectedAttempt"
                        checked={isSelected}
                        onChange={() => handleSelect(p.attemptNumber)}
                        className="h-3.5 w-3.5 accent-primary-600 cursor-pointer"
                      />
                      <span>Attempt #{p.attemptNumber}</span>
                      {isSelected && (
                        <span className="rounded bg-primary-100 px-1.5 py-0.2 text-[10px] font-semibold text-primary-700">
                          Viewing
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">
                    {p.totalScore != null && p.maxScore != null ? `${p.totalScore} / ${p.maxScore}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {p.pct != null ? `${p.pct.toFixed(1)}%` : p.status.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold">
                    {p.stepDeltaPct == null ? (
                      <span className="text-slate-400">Baseline</span>
                    ) : p.stepDeltaPct > 0.05 ? (
                      <span className="text-emerald-600">
                        ▲ +{p.stepDeltaMarks} pts (+{p.stepDeltaPct.toFixed(1)}%)
                      </span>
                    ) : p.stepDeltaPct < -0.05 ? (
                      <span className="text-red-600">
                        ▼ {p.stepDeltaMarks} pts ({p.stepDeltaPct.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-slate-500">━ 0 pts (0.0%)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{p.warningCount}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {p.submittedAtMs ? new Date(p.submittedAtMs).toLocaleString() : 'In progress'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
