import { useCallback, useEffect, useState } from 'react';
import { getIdToken, onAuthStateChanged, reload, signInAnonymously } from 'firebase/auth';
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
  const [, forceAuthUpdate] = useState(0);

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

  // Firebase email actions can complete in ANOTHER browser or tab. They do not
  // guarantee an onAuthStateChanged event in the already-open Reflect page.
  // Reconcile only the same signed-in UID on return/focus; never mint a guest,
  // sign out, replace a user or store action codes.
  useEffect(() => {
    let alive = true;
    let pending = false;
    let lastAttempt = 0;
    let remainingVisiblePolls = 12; // at most ~3 minutes per focus period
    const minimumGapMs = 3000;

    const reconcileEmailVerification = async () => {
      if (!alive || pending || document.visibilityState === 'hidden') return;
      const current = auth.currentUser;
      if (!current?.uid || current.isAnonymous || current.emailVerified ||
          !current.email) return;
      const now = Date.now();
      if (now - lastAttempt < minimumGapMs) return;
      lastAttempt = now;
      pending = true;
      const expectedUid = current.uid;
      try {
        await reload(current);
        if (!alive || auth.currentUser?.uid !== expectedUid ||
            current.uid !== expectedUid || !current.emailVerified) return;

        // Refresh the signed ID token as well so protected server checks can
        // observe the verified claim; never expose or persist the token.
        try { await getIdToken(current, true); }
        catch { /* Keep signed-in state; SDK can retry on a later request. */ }

        if (!alive || auth.currentUser?.uid !== expectedUid) return;
        setUser(current);
        // Firebase reload mutates the same User instance. A React state setter
        // with identical reference can bail out, so force a single safe render.
        forceAuthUpdate(value => value + 1);
      } catch {
        // Offline/rate-limit: non-destructive, explicit check remains available.
      } finally {
        pending = false;
      }
    };

    const onReturn = () => {
      remainingVisiblePolls = 12;
      void reconcileEmailVerification();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onReturn();
    };
    const poll = () => {
      if (remainingVisiblePolls <= 0 ||
          document.visibilityState === 'hidden') return;
      remainingVisiblePolls -= 1;
      void reconcileEmailVerification();
    };

    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(poll, 15000);
    return () => {
      alive = false;
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
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
      // Linking/verification may update properties of the same Firebase User
      // object; do not rely on referential inequality to refresh the UI.
      forceAuthUpdate(value => value + 1);
      setAuthError(null);
      setIsAuthReady(true);
    }
  }, []);

  return { user, isAuthReady, authError, signedOut, refreshUser, startGuestSession };
};
