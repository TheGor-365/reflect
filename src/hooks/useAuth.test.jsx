import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { useAuth } from './useAuth';
import { clearExplicitlySignedOut, setExplicitlySignedOut } from './accountSession';

vi.mock('../firebase/config', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn()
}));

function AuthHarness() {
  const { user, isAuthReady, authError, signedOut, startGuestSession } = useAuth();
  return (
    <div>
      <span data-testid="uid">{user?.uid || 'none'}</span>
      <span data-testid="ready">{isAuthReady ? 'ready' : 'pending'}</span>
      <span data-testid="signed-out">{signedOut ? 'yes' : 'no'}</span>
      <button type="button" onClick={startGuestSession}>Start guest</button>
      {authError && <p role="alert">{authError}</p>}
    </div>
  );
}

let onChange;
let onError;
beforeEach(() => {
  clearExplicitlySignedOut();
  vi.clearAllMocks();
  onAuthStateChanged.mockImplementation((_auth, callback, errorCallback) => {
    onChange = callback;
    onError = errorCallback;
    return vi.fn();
  });
});

afterEach(() => clearExplicitlySignedOut());

test('explicit signout shows a stable login gate, never creates a replacement guest', () => {
  setExplicitlySignedOut();
  render(<AuthHarness />);
  act(() => onChange(null));
  expect(screen.getByTestId('ready')).toHaveTextContent('ready');
  expect(screen.getByTestId('signed-out')).toHaveTextContent('yes');
  expect(screen.getByTestId('uid')).toHaveTextContent('none');
  expect(signInAnonymously).not.toHaveBeenCalled();
});

test('on refresh a persisted signout still does not mint a guest', () => {
  setExplicitlySignedOut();
  const first = render(<AuthHarness />);
  act(() => onChange(null));
  first.unmount();
  render(<AuthHarness />);
  act(() => onChange(null));
  expect(signInAnonymously).not.toHaveBeenCalled();
  expect(screen.getByTestId('signed-out')).toHaveTextContent('yes');
});

test('explicitly choosing guest starts a new anonymous identity', async () => {
  setExplicitlySignedOut();
  signInAnonymously.mockResolvedValue({
    user: { uid: 'new-explicit-guest', isAnonymous: true }
  });
  render(<AuthHarness />);
  act(() => onChange(null));
  await act(async () => { screen.getByRole('button', { name: 'Start guest' }).click(); });
  expect(screen.getByTestId('uid')).toHaveTextContent('new-explicit-guest');
  expect(screen.getByTestId('signed-out')).toHaveTextContent('no');
  expect(signInAnonymously).toHaveBeenCalledTimes(1);
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
