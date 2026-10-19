import { Loader2 } from 'lucide-react';

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
