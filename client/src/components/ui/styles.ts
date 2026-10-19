export const input =
  'w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs outline-none transition-all duration-200 ease-out placeholder:text-slate-400 hover:border-slate-300 focus:border-primary-500 focus:ring-3 focus:ring-primary-500/15 disabled:bg-slate-100 disabled:text-slate-400';

export const label = 'mb-1.5 block text-xs font-semibold tracking-wide text-slate-600 uppercase';

export const card =
  'rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_1px_3px_rgba(15,23,42,0.03),0_6px_16px_rgba(15,23,42,0.03)] backdrop-blur-xs transition-all duration-250 ease-out';

const btn =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

export const btnPrimary = `${btn} bg-gradient-to-b from-primary-500 to-primary-600 text-white shadow-sm shadow-primary-600/25 hover:-translate-y-0.5 hover:from-primary-600 hover:to-primary-700 hover:shadow-md hover:shadow-primary-600/30 active:translate-y-0`;

export const btnGhost = `${btn} border border-slate-200/90 bg-white text-slate-700 shadow-2xs hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/90 hover:text-slate-900 hover:shadow-xs active:translate-y-0`;

export const btnDanger = `${btn} bg-gradient-to-b from-red-500 to-red-600 text-white shadow-sm shadow-red-600/20 hover:-translate-y-0.5 hover:from-red-600 hover:to-red-700 hover:shadow-md hover:shadow-red-600/25 active:translate-y-0`;

export const btnSmall =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-all duration-200 ease-out hover:-translate-y-[1px] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:shadow-xs active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50';

export const statusTone: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  published: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  archived: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  assigned: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  started: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  in_progress: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  submitted: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200',
  grading: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200',
  graded: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  grading_failed: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
};
