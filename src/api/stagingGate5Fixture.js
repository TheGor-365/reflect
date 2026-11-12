/**
 * Stage05 Gate 5: explicit one-time creation of an OWNER-ONLY synthetic fixture.
 *
 * No provider calls, admin privileges, arbitrary source IDs or write to private
 * entitlements. This capability never exists in regular customer builds.
 */
import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { appId, auth, db, stagingAppCheckEnabled } from '../firebase/config';
import {
  GATE5_SESSION_ID, GATE5_SESSION_TITLE, gate5PreviewQaUiEnabled
} from './stagingPreviewGate5Audit';

const STAGE_PROJECT = 'reflect-ai-staging';
const STAGE_NAMESPACE = 'reflect-8fdc8';
export const GATE5_FIXTURE_TURNS = Object.freeze([
  Object.freeze({ role: 'user', content: 'AI01K_TURN_01_EXCLUDE' }),
  Object.freeze({ role: 'assistant', content: 'AI01K_TURN_02_INCLUDE' }),
  Object.freeze({ role: 'user', content: 'AI01K_TURN_03_INCLUDE' }),
  Object.freeze({ role: 'assistant', content: 'AI01K_TURN_04_INCLUDE' }),
  Object.freeze({ role: 'user', content: 'AI01K_TURN_05_INCLUDE' })
]);

function fail(code) { throw new Error(code); }
const validUid = uid => typeof uid === 'string' &&
  /^[A-Za-z0-9_-]{6,128}$/.test(uid);

function fixtureMatches(data) {
  return data?.title === GATE5_SESSION_TITLE &&
    Array.isArray(data.chatHistory) &&
    data.chatHistory.length === GATE5_FIXTURE_TURNS.length &&
    data.chatHistory.every((turn, i) =>
      turn?.role === GATE5_FIXTURE_TURNS[i].role &&
      turn?.content === GATE5_FIXTURE_TURNS[i].content
    );
}

/**
 * The owner must click "Создать синтетический сеанс" in the staging-only
 * Gate5 QA panel. Firestore Rules must continue enforcing the signed UID path.
 * Transactions fail closed on a collision; never overwrite another session.
 */
export async function prepareGate5Fixture(ownerUid) {
  if (!gate5PreviewQaUiEnabled || !stagingAppCheckEnabled ||
      auth.app?.options?.projectId !== STAGE_PROJECT ||
      appId !== STAGE_NAMESPACE || !db) fail('fixture-disabled');
  const signed = auth.currentUser;
  if (!signed || !validUid(ownerUid) || signed.uid !== ownerUid ||
      signed.isAnonymous || signed.emailVerified !== true) {
    fail('fixture-account-not-ready');
  }

  const target = doc(db, 'artifacts', STAGE_NAMESPACE, 'users', ownerUid,
    'sessions', GATE5_SESSION_ID);
  try {
    const outcome = await runTransaction(db, async txn => {
      if (auth.currentUser?.uid !== ownerUid) fail('fixture-owner-changed');
      const existing = await txn.get(target);
      if (existing.exists()) {
        if (!fixtureMatches(existing.data())) fail('fixture-id-collision');
        return 'already-present';
      }
      txn.set(target, {
        title: GATE5_SESSION_TITLE,
        chatHistory: GATE5_FIXTURE_TURNS.map(turn => ({ ...turn })),
        recommendations: [], exercises: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return 'created';
    }, { maxAttempts: 3 });
    if (auth.currentUser?.uid !== ownerUid) fail('fixture-owner-changed');
    return outcome;
  } catch (error) {
    if (['fixture-owner-changed', 'fixture-id-collision'].includes(error?.message)) {
      throw error;
    }
    fail('fixture-write-unavailable');
  }
}

/**
 * Signed owner browser probe for Firestore's SERVER-PRIVATE entitlement path.
 * Must return "denied"; a readable missing doc is just as unsafe as a readable
 * existing entitlement. Never return snapshots, content, path, user IDs.
 */
export async function auditGate5PrivateEntitlement(ownerUid) {
  if (!gate5PreviewQaUiEnabled || !stagingAppCheckEnabled ||
      auth.app?.options?.projectId !== STAGE_PROJECT ||
      appId !== STAGE_NAMESPACE || !db) fail('fixture-disabled');
  const signed = auth.currentUser;
  if (!signed || !validUid(ownerUid) || signed.uid !== ownerUid ||
      signed.isAnonymous || !signed.emailVerified) {
    fail('fixture-account-not-ready');
  }
  const target = doc(db, '_reflectAiPrivate', STAGE_NAMESPACE,
    'entitlements', ownerUid);
  try {
    await getDocFromServer(target);
    // Includes documents that do not exist: public read of "missing" is unsafe.
    return 'unsafe-readable';
  } catch (error) {
    return error?.code === 'permission-denied'
      ? 'denied' : 'unavailable';
  }
}
