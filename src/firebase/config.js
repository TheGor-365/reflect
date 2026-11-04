import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = process.env.REACT_APP_FIREBASE_CONFIG
  ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG)
  : {};

export const appId = process.env.REACT_APP_APP_ID || 'default-app-id';

// Opt-in LOCAL ONLY. Preview and production MUST NOT run with this switch.
// Demo projects have no live Firebase resources; fail closed if misconfigured.
const emulatorMode = process.env.REACT_APP_USE_FIREBASE_EMULATORS === 'true';
if (emulatorMode) {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error('Firebase emulator mode requires a localhost browser.');
  }
  if (firebaseConfig.projectId !== 'demo-reflect-auth-qa' || appId !== 'reflect-8fdc8') {
    throw new Error('Firebase emulator mode requires the fixed demo project and Reflect namespace.');
  }
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (emulatorMode) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 18081);
}

// Keep analytics in production, but never emit analytics from synthetic tests.
export const analytics = emulatorMode ? null : getAnalytics(app);
