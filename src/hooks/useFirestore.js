import { useEffect, useState } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db, appId } from '../firebase/config';

// Scope every snapshot to the active UID; never show cached records from another user.
export const useFirestore = (collectionName, userId) => {
  const [state, setState] = useState({
    userId: null,
    data: [],
    loading: false,
    error: null
  });

  useEffect(() => {
    if (!userId) {
      setState({ userId: null, data: [], loading: false, error: null });
      return undefined;
    }

    let active = true;
    setState({ userId, data: [], loading: true, error: null });

    const path = `artifacts/${appId}/users/${userId}/${collectionName}`;
    const q = query(collection(db, path));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;
        setState({
          userId,
          data: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
          loading: false,
          error: null
        });
      },
      (error) => {
        if (!active) return;
        console.error(`Firestore ${collectionName} read failed:`, error?.code || 'unknown');
        setState({
          userId,
          data: [],
          loading: false,
          error: 'Не удалось загрузить данные. Проверьте соединение и права доступа.'
        });
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [collectionName, userId]);

  if (state.userId !== userId) {
    return { data: [], loading: Boolean(userId), error: null };
  }

  return { data: state.data, loading: state.loading, error: state.error };
};
