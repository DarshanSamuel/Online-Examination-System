export const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-slate-100';
export const label = 'mb-1 block text-sm font-medium text-slate-700';
export const card = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const btn =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50';
export const btnPrimary = `${btn} bg-primary-600 text-white hover:bg-primary-700`;
export const btnGhost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
export const btnDanger = `${btn} bg-red-600 text-white hover:bg-red-700`;
export const btnSmall = 'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50';

export const statusTone: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  published: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-amber-100 text-amber-800',
  assigned: 'bg-slate-100 text-slate-700',
  started: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-blue-100 text-blue-800',
  submitted: 'bg-indigo-100 text-indigo-800',
  grading: 'bg-indigo-100 text-indigo-800',
  graded: 'bg-emerald-100 text-emerald-800',
  grading_failed: 'bg-red-100 text-red-800',
};
