import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from '../../config/firebase.js';
import { HttpError } from '../../lib/errors.js';
import type { AuthedUser } from '../../middleware/auth.js';
import type { KeystrokeEvent, ProctorEventType, ProctoringSummary } from '../../types/schema.js';
import type { keystrokeChunkSchema, proctorEventsSchema } from '../../validation/schemas.js';
import { assertActive, finalizeAttempt, finalizeIfExpired, loadOwnedSubmission } from './lifecycle.js';

type ProctorEventInput = z.infer<typeof proctorEventsSchema>['events'][number];
type KeystrokeChunkInput = z.infer<typeof keystrokeChunkSchema>;

/** Events that cost the candidate a warning. Everything else is logged for the examiner only. */
const VIOLATIONS = new Set<ProctorEventType>(['tab_hidden', 'fullscreen_exit']);
/** A single alt-tab often fires several violation events; count them once. */
const VIOLATION_DEDUPE_MS = 2_000;

const COUNTERS: Partial<Record<ProctorEventType, keyof ProctoringSummary>> = {
  tab_hidden: 'tabSwitches',
  fullscreen_exit: 'fullscreenExits',
  copy: 'clipboardAttempts',
  cut: 'clipboardAttempts',
  paste: 'clipboardAttempts',
  context_menu: 'clipboardAttempts',
  blocked_shortcut: 'blockedShortcuts',
  devtools_suspected: 'blockedShortcuts',
  audio_spike: 'audioFlags',
  snapshot: 'snapshotCount',
};

export interface ProctorResult {
  warningCount: number;
  maxWarnings: number;
  autoSubmitted: boolean;
}

/**
 * Records proctoring events and counts warnings server-side.
 * The client shows the warning modal, but the authoritative counter (and auto-submit) lives here.
 */
export async function recordProctorEvents(user: AuthedUser, submissionId: string, events: ProctorEventInput[]): Promise<ProctorResult> {
  let result: ProctorResult & { terminate: boolean };
  try {
    result = await db.runTransaction(async (tx) => {
      const { ref, sub } = await loadOwnedSubmission(submissionId, user.uid, tx);
      const nowMs = Date.now();
      assertActive(sub, nowMs);
      const now = Timestamp.fromMillis(nowMs);

      let warnings = sub.proctoring.warningCount;
      let lastViolationMs = sub.proctoring.lastViolationAt?.toMillis() ?? 0;
      let violationCounted = false;
      const increments = new Map<keyof ProctoringSummary, number>();
      const snapshotPrefix = `proctoring/${sub.examId}/${user.uid}/`;

      for (const ev of events) {
        let counted = false;
        if (VIOLATIONS.has(ev.type) && nowMs - lastViolationMs > VIOLATION_DEDUPE_MS) {
          warnings += 1;
          lastViolationMs = nowMs;
          counted = violationCounted = true;
        }
        const field = COUNTERS[ev.type];
        if (field) increments.set(field, (increments.get(field) ?? 0) + 1);

        if (ev.type === 'heartbeat') continue;

        if (ev.type === 'snapshot') {
          const storagePath = String(ev.meta.storagePath ?? '');
          if (!storagePath.startsWith(snapshotPrefix)) throw new HttpError(400, 'Invalid snapshot path', 'BAD_SNAPSHOT_PATH');
          const audioLevelDb = typeof ev.meta.audioLevelDb === 'number' ? ev.meta.audioLevelDb : null;
          tx.create(ref.collection('snapshots').doc(), { storagePath, clientTs: ev.clientTs, serverTs: now, audioLevelDb, flagged: false, flags: [] });
          continue;
        }

        tx.create(ref.collection('events').doc(), { type: ev.type, clientTs: ev.clientTs, serverTs: now, countedAsViolation: counted, meta: ev.meta });
      }

      const updates: Record<string, unknown> = { 'proctoring.warningCount': warnings, 'proctoring.lastHeartbeatAt': now };
      for (const [field, n] of increments) updates[`proctoring.${field}`] = FieldValue.increment(n);
      if (violationCounted) updates['proctoring.lastViolationAt'] = Timestamp.fromMillis(lastViolationMs);
      tx.update(ref, updates);

      const max = sub.examSnapshot.maxWarnings;
      return { warningCount: warnings, maxWarnings: max, autoSubmitted: false, terminate: max > 0 && warnings >= max };
    });
  } catch (err) {
    finalizeIfExpired(err, submissionId);
    throw err;
  }

  if (result.terminate) {
    await finalizeAttempt(submissionId, 'max_warnings');
    result.autoSubmitted = true;
  }
  const { terminate: _t, ...publicResult } = result;
  return publicResult;
}

/* ───────────────────────────── keystrokes ───────────────────────────── */

/** Inserts at least this long in one event are treated as paste-like. */
const LARGE_INSERT_CHARS = 40;

function summarize(events: KeystrokeEvent[]) {
  let typed = 0;
  let pasted = 0;
  let large = 0;
  for (const e of events) {
    if ((e.k !== 'e' && e.k !== 'p') || !e.i) continue;
    if (e.k === 'p' || e.i.length >= LARGE_INSERT_CHARS) {
      pasted += e.i.length;
      large += 1;
    } else {
      typed += e.i.length;
    }
  }
  return { typed, pasted, large };
}

/**
 * Stores one chunk of editor events for replay. Doc id = `${questionId}_${chunkSeq}`, written with
 * `create()` so retries after a network blip are no-ops rather than duplicates.
 */
export async function appendKeystrokes(user: AuthedUser, submissionId: string, chunk: KeystrokeChunkInput) {
  const { ref, sub } = await loadOwnedSubmission(submissionId, user.uid);
  try {
    assertActive(sub);
  } catch (err) {
    finalizeIfExpired(err, submissionId);
    throw err;
  }

  const entry = sub.questionMap.find((e) => e.questionId === chunk.questionId);
  if (!entry || entry.type !== 'coding') throw new HttpError(400, 'Not a coding question in this attempt', 'BAD_QUESTION');

  const stats = summarize(chunk.events);
  const docId = `${chunk.questionId}_${String(chunk.chunkSeq).padStart(6, '0')}`;
  const prefix = `keystrokeStats.${chunk.questionId}`;

  const batch = db.batch();
  batch.create(ref.collection('keystrokes').doc(docId), { ...chunk, serverReceivedAt: Timestamp.now() });
  batch.update(ref, {
    [`${prefix}.chunks`]: FieldValue.increment(1),
    [`${prefix}.events`]: FieldValue.increment(chunk.events.length),
    [`${prefix}.typedChars`]: FieldValue.increment(stats.typed),
    [`${prefix}.pastedChars`]: FieldValue.increment(stats.pasted),
    [`${prefix}.largeInserts`]: FieldValue.increment(stats.large),
  });

  try {
    await batch.commit();
    return { stored: true, duplicate: false };
  } catch (err) {
    if ((err as { code?: number }).code === 6 /* ALREADY_EXISTS */) return { stored: false, duplicate: true };
    throw err;
  }
}
