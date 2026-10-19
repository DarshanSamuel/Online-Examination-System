import { z } from 'zod';
import { env } from '../config/env.js';
import { LANGUAGE_KEYS, PROCTOR_EVENT_TYPES } from '../types/schema.js';

export const docId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'Invalid id');
const language = z.enum(LANGUAGE_KEYS);
const code = z
  .string()
  .refine((s) => Buffer.byteLength(s, 'utf8') <= env.MAX_CODE_BYTES, `Code exceeds ${env.MAX_CODE_BYTES} bytes`);

export const answerValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), selectedOptionId: z.string().max(64).nullable() }),
  z.object({ type: z.literal('numerical'), value: z.string().max(64) }),
  z.object({ type: z.literal('coding'), language, code }),
]);

export const syncBodySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: docId,
        clientSeq: z.number().int().nonnegative(),
        clientSavedAt: z.number().int().nonnegative(),
        answer: answerValueSchema,
      }),
    )
    .max(200),
});
export type SyncItem = z.infer<typeof syncBodySchema>['answers'][number];

export const submitBodySchema = syncBodySchema.partial().extend({
  reason: z.enum(['manual', 'timeout']).default('manual'),
});

const metaValue = z.union([z.string().max(300), z.number(), z.boolean()]);
export const proctorEventsSchema = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(PROCTOR_EVENT_TYPES),
        clientTs: z.number().int().nonnegative(),
        meta: z
          .record(metaValue)
          .refine((m) => Object.keys(m).length <= 12, 'Too many meta keys')
          .default({}),
      }),
    )
    .min(1)
    .max(50),
});

const keystrokeEvent = z
  .object({
    t: z.number().int().nonnegative().max(86_400_000),
    k: z.enum(['e', 'p', 'l', 'r', 'b', 'f']),
    o: z.number().int().nonnegative().optional(),
    d: z.number().int().nonnegative().optional(),
    i: z.string().max(env.MAX_CODE_BYTES).optional(),
    v: language.optional(),
  })
  .strict();

export const keystrokeChunkSchema = z
  .object({
    questionId: docId,
    chunkSeq: z.number().int().nonnegative().max(999_999),
    language,
    clientStartedAt: z.number().int().nonnegative(),
    events: z.array(keystrokeEvent).min(1).max(2000),
  })
  .refine((c) => JSON.stringify(c.events).length <= 500_000, 'Keystroke chunk too large');

export const runBodySchema = z.object({
  questionId: docId,
  language,
  code,
  /** When present, runs once against this stdin instead of the public tests. */
  customInput: z.string().max(64 * 1024).optional(),
});

export const similarityBodySchema = z.object({
  threshold: z.number().min(0.1).max(1).default(0.6),
});
