import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { useExamStore } from '../../store/examStore';
import { cn } from '../../lib/utils';

function format(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Countdown against the server deadline using the measured clock offset.
 * Changing the OS clock doesn't help: the API rejects writes after deadline + grace and the
 * sweeper finalizes the attempt regardless of what this component does.
 */
export function Timer() {
  const deadlineAt = useExamStore((s) => s.deadlineAt);
  const serverNow = useExamStore((s) => s.serverNow);
  const submit = useExamStore((s) => s.submit);
  const phase = useExamStore((s) => s.phase);
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((deadlineAt - serverNow()) / 1000)));
  const fired = useRef(false);

  useEffect(() => {
    if (phase !== 'active') return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineAt - serverNow()) / 1000));
      setLeft(remaining);
      if (remaining === 0 && !fired.current) {
        fired.current = true;
        void submit('timeout');
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadlineAt, serverNow, submit, phase]);

  const critical = left <= 60;
  const low = left <= 300;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-base font-semibold tabular-nums',
        critical ? 'animate-pulse border-red-300 bg-red-50 text-red-700' : low ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-700',
      )}
      aria-live="polite"
    >
      <Clock className="h-4 w-4" />
      {format(left)}
    </div>
  );
}
