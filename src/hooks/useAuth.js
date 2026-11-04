import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/config';

// Never sign out or replace a restored anonymous user automatically.
// Firebase Web Auth already persists existing sessions by default.
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let mounted = true;
    let signInPending = false;

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        if (!mounted) return;

        if (currentUser) {
          // Important: keep the exact existing UID and its Firestore data.
          setUser(currentUser);
          setAuthError(null);
          setIsAuthReady(true);
          return;
        }

        setUser(null);
        setIsAuthReady(false);

        // Do not create multiple anonymous identities during auth callbacks.
        if (signInPending) return;
        signInPending = true;

        signInAnonymously(auth)
          .then(({ user: anonymousUser }) => {
            if (!mounted) return;
            setUser(anonymousUser);
            setAuthError(null);
            setIsAuthReady(true);
          })
          .catch((error) => {
            if (!mounted) return;
            console.error('Anonymous authentication failed:', error?.code || 'unknown');
            setAuthError('Не удалось восстановить вход. Проверьте соединение и повторите попытку.');
            setIsAuthReady(true);
          })
          .finally(() => {
            signInPending = false;
          });
      },
      (error) => {
        if (!mounted) return;
        console.error('Authentication listener failed:', error?.code || 'unknown');
        setUser(null);
        setAuthError('Ошибка проверки авторизации. Повторите попытку позже.');
        setIsAuthReady(true);
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { user, isAuthReady, authError };
};
