import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/config';

// React StrictMode can mount/unmount effects twice during development.
// Deduplicate one in-flight anonymous sign-in across those subscriptions.
let pendingAnonymousSignIn = null;
const ensureAnonymousSignIn = () => {
  if (!pendingAnonymousSignIn) {
    pendingAnonymousSignIn = signInAnonymously(auth).finally(() => {
      pendingAnonymousSignIn = null;
    });
  }
  return pendingAnonymousSignIn;
};

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

        ensureAnonymousSignIn()
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

  // Linking email can preserve the same UID; auth state subscribers may not
  // emit on provider changes. Explicitly refresh after a successful link.
  const refreshUser = useCallback((updatedUser) => {
    if (updatedUser?.uid) {
      setUser(updatedUser);
      setAuthError(null);
      setIsAuthReady(true);
    }
  }, []);

  return { user, isAuthReady, authError, refreshUser };
};
