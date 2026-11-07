import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFunctions } from 'firebase/functions';

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

// Hosted AI is an explicit allowlisted STAGING capability, not a Vite
// fallback to the existing Test or production Firebase project.
const hostedAiRequested = import.meta.env.VITE_ENABLE_REFLECT_CLOUD_AI === 'true';
const approvedStage = import.meta.env.VITE_AI_STAGING_PROJECT_ID || '';
const appCheckSiteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY || '';
export const hostedAiEnabled = hostedAiRequested && !emulatorMode &&
  /^reflect-ai-stage-[a-z0-9-]{4,30}$/.test(approvedStage) &&
  firebaseConfig.projectId === approvedStage &&
  appNamespace === 'reflect-8fdc8' &&
  typeof appCheckSiteKey === 'string' && appCheckSiteKey.length > 10;

if (hostedAiRequested && !hostedAiEnabled) {
  throw new Error('Hosted AI requires a separate approved staging Firebase project and App Check.');
}

export const appId = appNamespace;
const app = initializeApp(firebaseConfig);

// Initialize attestation BEFORE creating SDK clients or making API calls.
// The reCAPTCHA Enterprise site key is public; xAI credentials remain in
// Firebase Secret Manager and App Check debug tokens are not used here.
if (hostedAiEnabled) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
}
export const auth = getAuth(app);
export const db = getFirestore(app);
export const aiFunctions = hostedAiEnabled ? getFunctions(app, 'us-central1') : null;

if (emulatorMode) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 18081);
}

// Analytics is optional and never emitted by the private QA emulators.
export const analytics = emulatorMode ? null : isSupported().then(supported =>
  supported ? getAnalytics(app) : null
);
