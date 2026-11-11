import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import AppFailureView from './components/common/AppFailureView';
import AppErrorBoundary from './components/common/AppErrorBoundary';
import { isReflectEntryPath } from './utils/entryRoute';
import { auth } from './firebase/config';
import { AUTH_ACTION_PATH, readAndScrubAuthAction } from './auth/actionIntent';
import AuthActionPage from './components/auth/AuthActionPage';

const element = document.getElementById('root');
if (!element) {
  throw new Error('Missing #root container');
}

// Reflect currently uses local tabs instead of pathname-based routes. A bad
// Hosting SPA rewrite should have a useful branded page, never a blank shell.
// A Firebase email action is a single-use URL capability. Parse it into
// volatile JS memory and immediately remove EVERY query/hash fragment from
// browser history before any React UI can render. A blocked history mutation
// fails closed instead of leaving an active action-code UI visible.
const isEmailAction = window.location.pathname === AUTH_ACTION_PATH;
const emailAction = isEmailAction
  ? readAndScrubAuthAction(window.location, window.history, auth.app?.options?.apiKey)
  : null;
const entry = isEmailAction
  ? <AuthActionPage intent={emailAction} />
  : isReflectEntryPath(window.location.pathname)
    ? <App />
    : <AppFailureView code={404} />;

createRoot(element).render(
  <React.StrictMode>
    <AppErrorBoundary>{entry}</AppErrorBoundary>
  </React.StrictMode>
);
