import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import type { AuthedUser } from '../../middleware/auth.js';
import type { AnswerValue, LanguageKey, QuestionMapEntry } from '../../types/schema.js';
import type { SyncItem } from '../../validation/schemas.js';
import { assertActive, finalizeIfExpired, loadOwnedSubmission } from './lifecycle.js';

export interface SyncResult {
  accepted: string[];
  stale: string[];
  rejected: { questionId: string; reason: string }[];
  serverNow: number;
  deadlineAt: number;
}

function validateAgainstMap(entry: QuestionMapEntry, answer: AnswerValue, allowed: LanguageKey[]): string | null {
  if (entry.type !== answer.type) return 'TYPE_MISMATCH';
  if (answer.type === 'mcq' && answer.selectedOptionId !== null && !entry.optionOrder?.includes(answer.selectedOptionId)) return 'UNKNOWN_OPTION';
  if (answer.type === 'coding' && !allowed.includes(answer.language)) return 'LANGUAGE_NOT_ALLOWED';
  return null;
}

/** Keep only the newest write per question within one batch. */
function newestPerQuestion(items: SyncItem[]): SyncItem[] {
  const m = new Map<string, SyncItem>();
  for (const it of items) {
    const cur = m.get(it.questionId);
    if (!cur || it.clientSeq > cur.clientSeq) m.set(it.questionId, it);
  }
  return [...m.values()];
}

/**
 * Idempotent, order-tolerant autosave.
 * The client keeps a per-question monotonically increasing `clientSeq`; replays from the
 * offline queue or out-of-order retries are discarded as `stale` instead of clobbering newer work.
 */
export async function syncAnswers(user: AuthedUser, submissionId: string, items: SyncItem[]): Promise<SyncResult> {
  try {
    return await db.runTransaction(async (tx) => {
      const { ref, sub } = await loadOwnedSubmission(submissionId, user.uid, tx);
      const nowMs = Date.now();
      assertActive(sub, nowMs);

      const now = Timestamp.fromMillis(nowMs);
      const byId = new Map(sub.questionMap.map((e) => [e.questionId, e]));
      const result: SyncResult = { accepted: [], stale: [], rejected: [], serverNow: nowMs, deadlineAt: sub.timing.deadlineAt.toMillis() };
      const updates: Record<string, unknown> = {};
      let lastClientSavedAt = sub.sync.lastClientSavedAt ?? 0;

      for (const item of newestPerQuestion(items)) {
        const entry = byId.get(item.questionId);
        if (!entry) {
          result.rejected.push({ questionId: item.questionId, reason: 'UNKNOWN_QUESTION' });
          continue;
        }
        const problem = validateAgainstMap(entry, item.answer, sub.examSnapshot.allowedLanguages);
        if (problem) {
          result.rejected.push({ questionId: item.questionId, reason: problem });
          continue;
        }
        const existing = sub.answers[item.questionId];
        if (existing && existing.clientSeq >= item.clientSeq) {
          result.stale.push(item.questionId);
          continue;
        }
        // questionId is regex-validated, so dotted field paths are safe.
        updates[`answers.${item.questionId}`] = { ...item.answer, clientSeq: item.clientSeq, clientSavedAt: item.clientSavedAt, serverSyncedAt: now };
        result.accepted.push(item.questionId);
        lastClientSavedAt = Math.max(lastClientSavedAt, item.clientSavedAt);
      }

      tx.update(ref, {
        ...updates,
        'sync.lastServerSyncAt': now,
        'sync.lastClientSavedAt': lastClientSavedAt || null,
        'sync.syncCount': FieldValue.increment(1),
        'proctoring.lastHeartbeatAt': now,
      });
      return result;
    });
  } catch (err) {
    finalizeIfExpired(err, submissionId);
    throw err;
  }
}
