import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/config';
import { clearExplicitlySignedOut, isExplicitlySignedOut } from './accountSession';

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
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    let signInPending = false;

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        if (!mounted) return;

        if (currentUser) {
          // A restored or freshly authenticated UID always takes precedence.
          // This clears a previous explicit sign-out only after Auth succeeds.
          clearExplicitlySignedOut();
          setUser(currentUser);
          setSignedOut(false);
          setAuthError(null);
          setIsAuthReady(true);
          return;
        }

        setUser(null);
        // signOut() emits null; that is an intentional logged-out state, not
        // permission to mint a new guest UID or silently select an account.
        if (isExplicitlySignedOut()) {
          setSignedOut(true);
          setAuthError(null);
          setIsAuthReady(true);
          return;
        }

        setSignedOut(false);
        setIsAuthReady(false);

        // New visitor without any prior auth: offer the existing guest flow.
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

  // Guest continuation is an EXPLICIT action after sign-out. Never clear
  // the sign-out marker until Firebase has created the guest successfully.
  const startGuestSession = useCallback(async () => {
    try {
      const result = await ensureAnonymousSignIn();
      if (!result?.user?.uid || !result.user.isAnonymous) {
        throw new Error('Не удалось создать гостевой доступ.');
      }
      clearExplicitlySignedOut();
      setSignedOut(false);
      setAuthError(null);
      setUser(result.user);
      setIsAuthReady(true);
      return result.user;
    } catch {
      setAuthError('Гостевой доступ пока недоступен. Повторите попытку.');
      throw new Error('Не удалось открыть гостевой доступ.');
    }
  }, []);

  // Linking email can preserve the same UID; auth state subscribers may not
  // emit on provider changes. Explicitly refresh after a successful link.
  const refreshUser = useCallback((updatedUser) => {
    if (updatedUser?.uid) {
      clearExplicitlySignedOut();
      setSignedOut(false);
      setUser(updatedUser);
      setAuthError(null);
      setIsAuthReady(true);
    }
  }, []);

  return { user, isAuthReady, authError, signedOut, refreshUser, startGuestSession };
};
