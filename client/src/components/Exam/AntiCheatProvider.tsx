import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Maximize } from 'lucide-react';
import { useExamStore } from '../../store/examStore';
import { reportProctorEvent } from '../../lib/proctorQueue';

/** Keys that open devtools / view-source / save / print, or leave the page. */
function isBlockedShortcut(e: KeyboardEvent): string | null {
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'F12') return 'F12';
  if (mod && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) return `Ctrl+Shift+${k.toUpperCase()}`;
  if (mod && e.altKey && ['i', 'j', 'c'].includes(k)) return `Cmd+Opt+${k.toUpperCase()}`;
  if (mod && ['u', 's', 'p'].includes(k)) return `Ctrl+${k.toUpperCase()}`;
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return 'Alt+Arrow';
  return null;
}

/**
 * Locked-down exam shell.
 * Client-side measures are deterrents and signal sources; the *decisions* (warning count,
 * auto-submit) are made by the API from the events reported here.
 */
export function AntiCheatProvider({ children }: { children: ReactNode }) {
  const phase = useExamStore((s) => s.phase);
  const requireFullscreen = useExamStore((s) => s.proctoring?.requireFullscreen ?? true);
  const warningCount = useExamStore((s) => s.warningCount);
  const maxWarnings = useExamStore((s) => s.maxWarnings);
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  const [toast, setToast] = useState<string | null>(null);

  const active = phase === 'active';

  // Surface each new server-confirmed warning.
  useEffect(() => {
    if (warningCount > 0) setToast(`Warning ${warningCount} of ${maxWarnings}: this action was recorded.`);
  }, [warningCount, maxWarnings]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!active) return;
    const now = () => Date.now();

    const onVisibility = () =>
      reportProctorEvent({ type: document.visibilityState === 'hidden' ? 'tab_hidden' : 'tab_visible', clientTs: now() }, { immediate: true });
    const onBlur = () => reportProctorEvent({ type: 'window_blur', clientTs: now() });
    const onFullscreen = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      reportProctorEvent({ type: fs ? 'fullscreen_enter' : 'fullscreen_exit', clientTs: now() }, { immediate: !fs });
    };
    const onClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      reportProctorEvent({ type: e.type as 'copy' | 'cut' | 'paste', clientTs: now() });
      setToast('Copy, cut and paste are disabled during the exam.');
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      reportProctorEvent({ type: 'context_menu', clientTs: now() });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = isBlockedShortcut(e);
      if (!combo) return;
      e.preventDefault();
      e.stopPropagation();
      reportProctorEvent({ type: combo.startsWith('F12') || combo.includes('+I') || combo.includes('+J') ? 'devtools_suspected' : 'blocked_shortcut', clientTs: now(), meta: { combo } });
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onDragDrop = (e: DragEvent) => e.preventDefault();

    // Capture phase so Monaco can't swallow the events before we see them.
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onClipboard, true);
    document.addEventListener('cut', onClipboard, true);
    document.addEventListener('paste', onClipboard, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('drop', onDragDrop, true);
    window.addEventListener('beforeunload', onBeforeUnload);

    // Heartbeat: lets the examiner spot a client that silently stopped reporting.
    const heartbeat = setInterval(() => reportProctorEvent({ type: 'heartbeat', clientTs: now() }), 60_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onClipboard, true);
      document.removeEventListener('cut', onClipboard, true);
      document.removeEventListener('paste', onClipboard, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('drop', onDragDrop, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearInterval(heartbeat);
    };
  }, [active]);

  // Leave fullscreen once the attempt is over.
  useEffect(() => {
    if (phase === 'ended' && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [phase]);

  const enterFullscreen = () => void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});

  return (
    <div className="relative min-h-screen bg-slate-50 select-none">
      {children}

      {active && requireFullscreen && !isFullscreen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-6">
          <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-7 w-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Fullscreen required</h2>
            <p className="mt-2 text-sm text-slate-600">
              The exam is paused on screen but your timer keeps running. Leaving fullscreen counts as a warning
              ({warningCount}/{maxWarnings}).
            </p>
            <button
              onClick={enterFullscreen}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700"
            >
              <Maximize className="h-4 w-4" /> Return to fullscreen
            </button>
          </div>
        </div>
      )}

      {toast && active && (
        <div className="fixed top-4 left-1/2 z-[110] -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
