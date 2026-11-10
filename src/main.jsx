import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import AppFailureView from './components/common/AppFailureView';
import AppErrorBoundary from './components/common/AppErrorBoundary';
import { isReflectEntryPath } from './utils/entryRoute';

const element = document.getElementById('root');
if (!element) {
  throw new Error('Missing #root container');
}

// Reflect currently uses local tabs instead of pathname-based routes. A bad
// Hosting SPA rewrite should have a useful branded page, never a blank shell.
const entry = isReflectEntryPath(window.location.pathname)
  ? <App />
  : <AppFailureView code={404} />;

createRoot(element).render(
  <React.StrictMode>
    <AppErrorBoundary>{entry}</AppErrorBoundary>
  </React.StrictMode>
);
