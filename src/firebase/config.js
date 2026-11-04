import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Explicit Vite-only public config. NEVER inherit Vercel's existing REACT_APP_*
// Preview variables: they currently point at the real Firebase project.
const rawConfig = import.meta.env.VITE_FIREBASE_CONFIG || '';
const appNamespace = import.meta.env.VITE_APP_ID || '';
const emulatorMode = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

if (!rawConfig || !appNamespace) {
  throw new Error('Vite Firebase configuration missing. Production/Preview fallback is forbidden.');
}

let firebaseConfig;
try {
  firebaseConfig = JSON.parse(rawConfig);
} catch {
  throw new Error('Vite Firebase configuration is not valid JSON.');
}

if (emulatorMode) {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (!['localhost', '127.0.0.1'].includes(host) ||
      firebaseConfig.projectId !== 'demo-reflect-auth-qa' ||
      appNamespace !== 'reflect-8fdc8') {
    throw new Error('Vite emulator mode requires localhost and the dedicated demo project.');
  }
}

export const appId = appNamespace;
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (emulatorMode) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 18081);
}

// Analytics is optional and never emitted by the private QA emulators.
export const analytics = emulatorMode ? null : isSupported().then(supported =>
  supported ? getAnalytics(app) : null
);
