import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { getIdToken, onAuthStateChanged, reload, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from './useAuth';
import { clearExplicitlySignedOut, setExplicitlySignedOut } from './accountSession';

vi.mock('../firebase/config', () => ({ auth: { currentUser: null } }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(),
  reload: vi.fn(), getIdToken: vi.fn()
}));

function AuthHarness() {
  const { user, isAuthReady, authError, signedOut, startGuestSession } = useAuth();
  return (
    <div>
      <span data-testid="uid">{user?.uid || 'none'}</span>
      <span data-testid="verified">{user?.emailVerified ? 'yes' : 'no'}</span>
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
  auth.currentUser = null;
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

test('returning to Reflect automatically observes verified email without manual check or UID change', async () => {
  const linked = { uid: 'same-registered-uid', isAnonymous: false,
    email: 'owner@example.test', emailVerified: false };
  auth.currentUser = linked;
  reload.mockImplementationOnce(async user => { user.emailVerified = true; });
  getIdToken.mockResolvedValueOnce('synthetic-token-never-rendered');

  render(<AuthHarness />);
  act(() => onChange(linked));
  expect(screen.getByTestId('verified')).toHaveTextContent('no');

  await act(async () => window.dispatchEvent(new Event('focus')));

  expect(reload).toHaveBeenCalledWith(linked);
  expect(getIdToken).toHaveBeenCalledWith(linked, true);
  expect(screen.getByTestId('verified')).toHaveTextContent('yes');
  expect(screen.getByTestId('uid')).toHaveTextContent('same-registered-uid');
  expect(signInAnonymously).not.toHaveBeenCalled();
});

test('verification refresh ignores an in-flight change of Firebase UID', async () => {
  const linked = { uid: 'initial-uid', isAnonymous: false,
    email: 'owner@example.test', emailVerified: false };
  auth.currentUser = linked;
  reload.mockImplementationOnce(async user => {
    auth.currentUser = { uid: 'different-uid', isAnonymous: false,
      email: 'other@example.test', emailVerified: false };
    user.emailVerified = true;
  });
  render(<AuthHarness />);
  act(() => onChange(linked));

  await act(async () => window.dispatchEvent(new Event('focus')));

  expect(getIdToken).not.toHaveBeenCalled();
  expect(screen.getByTestId('uid')).toHaveTextContent('initial-uid');
  expect(signInAnonymously).not.toHaveBeenCalled();
});

test('automatic verification does nothing for anonymous guests and explicit signout', async () => {
  const guest = { uid: 'guest', isAnonymous: true, email: null, emailVerified: false };
  auth.currentUser = guest;
  const rendered = render(<AuthHarness />);
  act(() => onChange(guest));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(reload).not.toHaveBeenCalled();
  rendered.unmount();

  auth.currentUser = null;
  setExplicitlySignedOut();
  render(<AuthHarness />);
  act(() => onChange(null));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(reload).not.toHaveBeenCalled();
  expect(signInAnonymously).not.toHaveBeenCalled();
});
