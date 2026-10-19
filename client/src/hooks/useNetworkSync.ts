import { useEffect } from 'react';
import { useExamStore } from '../store/examStore';
import { reportProctorEvent } from '../lib/proctorQueue';

const SYNC_INTERVAL_MS = 30_000;

/**
 * Network resilience:
 *  - every edit is already in localStorage (examStore.saveAnswer)
 *  - pending answers are pushed to the API every 30s
 *  - flushed immediately when the browser comes back online or the tab is being hidden/closed
 */
export function useNetworkSync() {
  const phase = useExamStore((s) => s.phase);
  const flush = useExamStore((s) => s.flush);

  useEffect(() => {
    if (phase !== 'active') return;

    const interval = setInterval(() => void flush(), SYNC_INTERVAL_MS);

    const onOnline = () => {
      reportProctorEvent({ type: 'network_online', clientTs: Date.now() });
      void flush();
    };
    const onOffline = () => {
      useExamStore.setState({ syncStatus: 'offline' });
      reportProctorEvent({ type: 'network_offline', clientTs: Date.now() });
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [phase, flush]);
}
