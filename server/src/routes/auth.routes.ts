import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { examinerAllowlist } from '../config/env.js';
import { adminAuth, collections, db } from '../config/firebase.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import type { Role, UserDoc } from '../types/schema.js';

export const authRouter = Router();

/**
 * Called by the client right after Google sign-in.
 * Upserts users/{uid} and assigns the role custom claim. If the claim changed, the client must
 * call `getIdToken(true)` so the new role is present in subsequent tokens.
 */
authRouter.post('/session', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const record = await adminAuth.getUser(user.uid);
  const existing = record.customClaims?.role as Role | undefined;
  const role: Role = existing ?? (examinerAllowlist.has(user.email) ? 'examiner' : 'candidate');

  let claimsUpdated = false;
  if (existing !== role) {
    await adminAuth.setCustomUserClaims(user.uid, { ...record.customClaims, role });
    claimsUpdated = true;
  }

  const ref = collections.users.doc(user.uid);
  const now = Timestamp.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const profile = { email: user.email, displayName: record.displayName ?? user.name, photoURL: record.photoURL ?? null, role, lastLoginAt: now };
    if (snap.exists) tx.update(ref, profile);
    else tx.create(ref, { uid: user.uid, createdAt: now, ...profile } satisfies UserDoc);
  });

  res.json({ uid: user.uid, role, claimsUpdated });
});
