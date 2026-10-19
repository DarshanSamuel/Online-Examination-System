import { api, apiErrorCode, ATTEMPT_OVER_CODES, isTransient } from './api';
import { useExamStore } from '../store/examStore';
import type { ProctorEvent, ProctorResult } from '../types/exam';

/**
 * Batches proctoring events and posts them to /attempts/:id/events.
 * The server decides which events count as warnings and returns the authoritative count;
 * the client only mirrors it (so deleting this file can't avoid an auto-submit — the
 * server still finalizes, and missing heartbeats are visible to the examiner).
 */
const MAX_BATCH = 50;
const FLUSH_DELAY_MS = 400;

let queue: ProctorEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

export function reportProctorEvent(ev: ProctorEvent, opts: { immediate?: boolean } = {}) {
  queue.push({ ...ev, meta: ev.meta ?? {} });
  if (queue.length > 500) queue = queue.slice(-500); // bound memory while offline
  if (opts.immediate) void flushProctorEvents();
  else if (!timer) timer = setTimeout(() => void flushProctorEvents(), FLUSH_DELAY_MS);
}

export async function flushProctorEvents(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const { submissionId, phase } = useExamStore.getState();
  if (inFlight || !queue.length || !submissionId || phase !== 'active') return;

  const batch = queue.slice(0, MAX_BATCH);
  inFlight = true;
  try {
    const { data } = await api.post<ProctorResult>(`/attempts/${submissionId}/events`, { events: batch });
    queue = queue.slice(batch.length);
    const store = useExamStore.getState();
    store.setWarnings(data.warningCount, data.maxWarnings);
    if (data.autoSubmitted) store.end('max_warnings');
  } catch (err) {
    const code = apiErrorCode(err);
    if (code && ATTEMPT_OVER_CODES.has(code)) {
      queue = [];
      useExamStore.getState().end('submitted');
    } else if (!isTransient(err)) {
      queue = queue.slice(batch.length); // malformed batch — drop it rather than retry forever
    }
  } finally {
    inFlight = false;
    if (queue.length && useExamStore.getState().phase === 'active') {
      timer = setTimeout(() => void flushProctorEvents(), navigator.onLine ? FLUSH_DELAY_MS : 5_000);
    }
  }
}

export function resetProctorQueue() {
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
}
