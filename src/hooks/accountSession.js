/**
 * Remember the user's explicit choice to leave a registered account.
 * This stores no UID, email, credentials, or personal data. The marker keeps
 * Firebase's null auth state as a real sign-in screen rather than silently
 * creating a new anonymous identity (which previously blocked returning login).
 */
const KEY = 'reflect-explicitly-signed-out';
let memorySignedOut = false;

export function isExplicitlySignedOut() {
  try {
    return window.localStorage.getItem(KEY) === '1' || memorySignedOut;
  } catch {
    return memorySignedOut;
  }
}

export function setExplicitlySignedOut() {
  memorySignedOut = true;
  try { window.localStorage.setItem(KEY, '1'); }
  catch { /* Browsers may block storage; memory still prevents auto guest. */ }
}

export function clearExplicitlySignedOut() {
  memorySignedOut = false;
  try { window.localStorage.removeItem(KEY); }
  catch { /* A new authenticated user still takes precedence. */ }
}
