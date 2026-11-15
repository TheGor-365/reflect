import {
  doc, runTransaction, serverTimestamp, getDocFromServer, deleteField
} from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { SLOT_IDS, exactOwnerSource } from './readinessEvidence';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const STATES = ['confirmed','disputed'];

/** Owner's voluntary and explicit statement; source is an existing saved user turn. */
export async function saveReadinessEvidence({
  userId, sessionId, slot, sourceTurnId, quote,
  status = 'confirmed', confirmed = false
}) {
  if (!db || appId !== 'reflect-8fdc8' || !ID.test(userId || '') ||
      !ID.test(sessionId || '') || !SLOT_IDS.includes(slot) ||
      !STATES.includes(status) || confirmed !== true) {
    throw new Error('readiness-input-invalid');
  }
  const ref = doc(db, 'artifacts', appId, 'users', userId, 'sessions', sessionId);
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists() ||
        !exactOwnerSource(snapshot.data(), sourceTurnId, quote)) {
      throw new Error('readiness-source-unverified');
    }
    tx.update(ref, {
      ['readinessEvidence.' + slot]: {
        sourceTurnId, quote, status, confirmedByOwner: true,
        confirmedAt: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    });
  });
  const observed = await getDocFromServer(ref);
  const stored = observed.exists() &&
    observed.data()?.readinessEvidence?.[slot];
  if (!stored || stored.sourceTurnId !== sourceTurnId ||
      stored.quote !== quote || stored.status !== status ||
      stored.confirmedByOwner !== true ||
      !exactOwnerSource(observed.data(), sourceTurnId, quote)) {
    throw new Error('readiness-readback-unconfirmed');
  }
  return Object.freeze({ sourceTurnId, quote, status });
}

export async function clearReadinessEvidence({ userId, sessionId, slot }) {
  if (!db || appId !== 'reflect-8fdc8' || !ID.test(userId || '') ||
      !ID.test(sessionId || '') || !SLOT_IDS.includes(slot)) {
    throw new Error('readiness-input-invalid');
  }
  const ref = doc(db, 'artifacts', appId, 'users', userId, 'sessions', sessionId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('readiness-source-unverified');
    tx.update(ref, {
      ['readinessEvidence.' + slot]: deleteField(),
      updatedAt: serverTimestamp()
    });
  });
  const observed = await getDocFromServer(ref);
  if (!observed.exists() || observed.data()?.readinessEvidence?.[slot] !== undefined) {
    throw new Error('readiness-readback-unconfirmed');
  }
  return true;
}
