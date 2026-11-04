import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { useAuth } from './useAuth';

vi.mock('../firebase/config', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn()
}));

function AuthHarness() {
  const { user, isAuthReady, authError } = useAuth();
  return (
    <div>
      <span data-testid="uid">{user?.uid || 'none'}</span>
      <span data-testid="ready">{isAuthReady ? 'ready' : 'pending'}</span>
      {authError && <p role="alert">{authError}</p>}
    </div>
  );
}

let onChange;
let onError;
beforeEach(() => {
  vi.clearAllMocks();
  onAuthStateChanged.mockImplementation((_auth, callback, errorCallback) => {
    onChange = callback;
    onError = errorCallback;
    return vi.fn();
  });
});

test('restored auth identity is reused without anonymous sign-in', () => {
  render(<AuthHarness />);
  act(() => onChange({ uid: 'existing-uid' }));
  expect(screen.getByTestId('uid').textContent).toBe('existing-uid');
  expect(signInAnonymously).not.toHaveBeenCalled();
});

test('new anonymous user is signed in only once', async () => {
  signInAnonymously.mockResolvedValue({ user: { uid: 'new-uid' } });
  render(<AuthHarness />);
  act(() => onChange(null));
  act(() => onChange(null));
  await waitFor(() => expect(screen.getByTestId('uid').textContent).toBe('new-uid'));
  expect(signInAnonymously).toHaveBeenCalledTimes(1);
});

test('failed auth does not start an unbounded fallback cycle', async () => {
  signInAnonymously.mockRejectedValue({ code: 'auth/network-request-failed' });
  render(<AuthHarness />);
  act(() => onChange(null));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByTestId('ready').textContent).toBe('ready');
  expect(signInAnonymously).toHaveBeenCalledTimes(1);
});

test('listener errors are visible and do not create identities', () => {
  render(<AuthHarness />);
  act(() => onError({ code: 'auth/network-request-failed' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(signInAnonymously).not.toHaveBeenCalled();
});
