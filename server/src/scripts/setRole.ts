/**
 * Usage: npm run set-role -- teacher@example.com examiner
 * The user must sign in again (or call getIdToken(true)) to receive the new claim.
 */
import { adminAuth, collections } from '../config/firebase.js';

const [email, role] = process.argv.slice(2);
if (!email || (role !== 'examiner' && role !== 'candidate')) {
  console.error('Usage: npm run set-role -- <email> <examiner|candidate>');
  process.exit(1);
}

const user = await adminAuth.getUserByEmail(email);
await adminAuth.setCustomUserClaims(user.uid, { ...user.customClaims, role });
await adminAuth.revokeRefreshTokens(user.uid); // force token refresh everywhere
await collections.users.doc(user.uid).set({ role }, { merge: true });
console.log(`Set role=${role} for ${email} (${user.uid})`);
process.exit(0);
