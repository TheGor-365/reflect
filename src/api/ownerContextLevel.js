/** Owner-scoped preference read, not a grant. No profile/transcript loaded. */
import { doc, getDocFromServer } from 'firebase/firestore';
import { db, appId } from '../firebase/config';
import { parseAiSettings } from '../features/AISettings/aiSettingsModel';
import { DEFAULT_CONTEXT_LEVEL } from './contextLevels';

const OWNER = /^[A-Za-z0-9_-]{1,128}$/;
export async function readOwnerContextLevel(uid) {
  if (!db || !OWNER.test(uid || '') || appId !== 'reflect-8fdc8') {
    throw new Error('context-level-unavailable');
  }
  const ref = doc(db, 'artifacts', appId, 'users', uid, 'aiSettings', 'preferences');
  const snap = await getDocFromServer(ref);
  if (!snap.exists()) return DEFAULT_CONTEXT_LEVEL;
  const settings = parseAiSettings(snap.data());
  if (!settings) throw new Error('context-level-unavailable');
  return settings.contextLevel;
}

/** Owner preference, not a session grant or inferred clinical role. */
export async function readOwnerInteractionMode(uid) {
  if (!db || !OWNER.test(uid || '') || appId !== 'reflect-8fdc8') {
    throw new Error('owner-mode-unavailable');
  }
  const ref = doc(db, 'artifacts', appId, 'users', uid, 'aiSettings', 'preferences');
  const snap = await getDocFromServer(ref);
  if (!snap.exists()) return 'reflection';
  const settings = parseAiSettings(snap.data());
  if (!settings) throw new Error('owner-mode-unavailable');
  return settings.interactionMode;
}
