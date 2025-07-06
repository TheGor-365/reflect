import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase/config';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsAuthReady(true);
      } else {
        const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        try {
          if (token) {
              await signInWithCustomToken(auth, token);
          } else {
              await signInAnonymously(auth);
          }
        } catch (error) {
          console.error("Auth Error:", error);
          // Попытка анонимного входа в случае ошибки
          if (auth.currentUser === null) {
             await signInAnonymously(auth);
          }
        } finally {
          // isAuthReady будет установлено после получения пользователя
          if(!isAuthReady){
             setIsAuthReady(true);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  return { user, isAuthReady };
};
