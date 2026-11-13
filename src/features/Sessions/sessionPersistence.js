import {
  collection, doc, setDoc, updateDoc, arrayUnion, serverTimestamp
} from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { deriveSessionTitle } from './sessionTitle';

// The dialogue is saved before making a potentially billable AI request.
// This is an authenticated, owner-scoped user-data write; it does NOT grant
// permission for the model to read previous sessions or to create goals.
const idOk = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const turnOk = value => value && typeof value === 'object' &&
  ['user', 'assistant'].includes(value.role) &&
  idOk(value.id) && typeof value.content === 'string' &&
  value.content.trim().length > 0 && value.content.length <= 2400;

const pathFor = userId => {
  if (!db || !idOk(userId) || !idOk(appId)) throw new Error('unsafe-session-owner');
  return collection(db, 'artifacts', appId, 'users', userId, 'sessions');
};

/** Returns only after Firestore confirms the initial user turn. */
export async function createDurableSession(userId, turn) {
  if (!turnOk(turn) || turn.role !== 'user') throw new Error('invalid-session-turn');
  const ref = doc(pathFor(userId));
  const title = deriveSessionTitle(turn.content);
  await setDoc(ref, {
    title, titleSource: 'auto', chatHistory: [turn], recommendations: [], exercises: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return { id: ref.id, title };
}

/** Atomic append; never read, replace or truncate another browser's turns. */
export async function appendDurableTurn(userId, sessionId, turn) {
  if (!idOk(sessionId) || !turnOk(turn)) throw new Error('invalid-session-turn');
  const ref = doc(pathFor(userId), sessionId);
  await updateDoc(ref, {
    chatHistory: arrayUnion(turn),
    updatedAt: serverTimestamp()
  });
  return sessionId;
}
