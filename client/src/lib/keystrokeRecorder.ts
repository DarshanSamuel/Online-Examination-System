import { api, isTransient } from './api';
import type { KeystrokeEvent, LanguageKey } from '../types/exam';

/**
 * Records Monaco content changes for examiner replay and ships them in chunks.
 *
 * Each chunk is stored server-side as keystrokes/{questionId}_{chunkSeq} with create(), so
 * chunkSeq must never repeat for a question — it's persisted in localStorage to survive reloads.
 */
const FLUSH_EVERY_MS = 10_000;
const MAX_EVENTS = 300;

export class KeystrokeRecorder {
  private events: KeystrokeEvent[] = [];
  private startedAt = Date.now();
  private outbox: object[] = [];
  private timer: ReturnType<typeof setInterval>;
  private sending = false;
  private seqKey: string;
  private submissionId: string;
  private questionId: string;
  private language: LanguageKey;

  constructor(submissionId: string, questionId: string, language: LanguageKey) {
    this.submissionId = submissionId;
    this.questionId = questionId;
    this.language = language;
    this.seqKey = `ks:${submissionId}:${questionId}:seq`;
    this.timer = setInterval(() => this.flush(), FLUSH_EVERY_MS);
  }

  private nextSeq(): number {
    const n = Number(localStorage.getItem(this.seqKey) ?? '0');
    localStorage.setItem(this.seqKey, String(n + 1));
    return n;
  }

  record(ev: Omit<KeystrokeEvent, 't'>) {
    if (!this.events.length) this.startedAt = Date.now();
    this.events.push({ ...ev, t: Date.now() - this.startedAt });
    if (this.events.length >= MAX_EVENTS) this.flush();
  }

  setLanguage(lang: LanguageKey) {
    this.flush(); // a chunk carries one language
    this.language = lang;
  }

  flush() {
    if (this.events.length) {
      this.outbox.push({
        questionId: this.questionId,
        chunkSeq: this.nextSeq(),
        language: this.language,
        clientStartedAt: this.startedAt,
        events: this.events,
      });
      this.events = [];
    }
    void this.drain();
  }

  private async drain() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.outbox.length) {
        try {
          await api.post(`/attempts/${this.submissionId}/keystrokes`, this.outbox[0]);
          this.outbox.shift();
        } catch (err) {
          if (isTransient(err)) break; // keep it; retry on next flush
          this.outbox.shift(); // attempt closed / invalid — drop
        }
      }
    } finally {
      this.sending = false;
    }
  }

  dispose() {
    this.flush();
    clearInterval(this.timer);
  }
}
