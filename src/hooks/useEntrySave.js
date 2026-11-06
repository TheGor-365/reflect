import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, appId } from '../firebase/config';

/**
 * Create-only UI workflow for a new journal/mood document.
 *
 * One Firestore document ID is allocated for an attempted save and retained
 * across retries, including ambiguous network failures. This avoids a second
 * addDoc() creating a duplicate after a delayed acknowledgement. A retry may
 * update that same document; it never creates a second ID for the same attempt.
 *
 * Content is held in React memory only. This hook does NOT persist a sensitive
 * journal draft in localStorage, IndexedDB, or an external service.
 */
export const useEntrySave = (collectionName, userId, onConfirmed) => {
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;
  const [status, setStatus] = useState('idle');
  const pendingRef = useRef(null);
  const busyRef = useRef(false);
  const activeUidRef = useRef(userId);

  useEffect(() => {
    // Never allow another anonymous account to inherit a pending write.
    activeUidRef.current = userId;
    pendingRef.current = null;
    busyRef.current = false;
    setStatus('idle');
  }, [userId]);

  const save = useCallback(async (payload) => {
    if (busyRef.current) return false;

    if (!db || !userId || activeUidRef.current !== userId) {
      if (activeUidRef.current === userId) setStatus('error');
      return false;
    }

    busyRef.current = true;
    setStatus('saving');
    try {
      if (!pendingRef.current) {
        const entryRef = doc(collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`));
        pendingRef.current = { userId, ref: entryRef };
      }

      // setDoc with a stable preallocated ID is safe against duplicate clicks
      // and repeated attempts after an uncertain server acknowledgement.
      await setDoc(
        pendingRef.current.ref,
        { ...payload, createdAt: serverTimestamp() },
        { merge: true }
      );

      if (activeUidRef.current === userId) {
        const committedId = pendingRef.current.ref.id;
        pendingRef.current = null;
        setStatus('saved');
        // Firestore confirmed the write; show it immediately while the
        // subscribed list catches up. Never treat a UI callback as a write error.
        try {
          onConfirmedRef.current?.({ ...payload, id: committedId, createdAt: Timestamp.now() });
        } catch { /* UI projection errors cannot undo a confirmed Firestore write. */ }
      }
      return true;
    } catch (error) {
      console.error(`Firestore ${collectionName} write failed:`, error?.code || 'unknown');
      if (activeUidRef.current === userId) setStatus('error');
      return false;
    } finally {
      if (activeUidRef.current === userId) busyRef.current = false;
    }
  }, [collectionName, userId]);

  const clearFeedback = useCallback(() => {
    // Editing the retained text must not allocate a second document ID.
    setStatus(current => current === 'saved' ? 'idle' : current);
  }, []);

  const discardAttempt = useCallback(() => {
    if (busyRef.current) return;
    pendingRef.current = null;
    setStatus('idle');
  }, []);

  return { status, save, clearFeedback, discardAttempt };
};
