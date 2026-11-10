import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDoc } from 'firebase/firestore';
import { useAuth } from './hooks/useAuth';
import { useFirestore } from './hooks/useFirestore';
import App from './App';

vi.mock('./firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  arrayUnion: vi.fn(),
  Timestamp: { now: vi.fn() }
}));
vi.mock('./hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('./hooks/useFirestore', () => ({ useFirestore: vi.fn() }));
vi.mock('./components/layout/Sidebar', () => ({
  default: ({ changeTab }) => <nav aria-label="Test section nav">
    <button type="button" onClick={() => changeTab('aiSettings')}>AI Settings nav</button>
    <button type="button" onClick={() => changeTab('diary')}>Diary nav</button>
  </nav>
}));
vi.mock('./components/layout/Header', () => ({ default: () => null }));
vi.mock('./features/AISettings/AISettings', () => ({
  default: () => <div data-testid="ai-settings-content">AI Settings</div>
}));
vi.mock('./features/Diary/Diary', () => ({
  default: () => <div data-testid="diary-content">Diary</div>
}));
vi.mock('./features/Goals/Goals', () => ({ default: () => null }));
vi.mock('./features/Sessions/Sessions', () => ({ default: () => null }));
vi.mock('./features/SessionSchema/SessionSchema', () => ({ default: () => null }));
vi.mock('./components/common/Loader', () => ({
  default: () => <div data-testid="loading" />
}));
vi.mock('./components/modals/AccountAccess', () => ({
  default: ({ onAccountChanged }) => <button type="button" data-testid="welcome-link"
    onClick={() => onAccountChanged({
      uid: 'new-anon', email: 'demo@example.test', isAnonymous: false
    })}>Simulate verified link</button>
}));
vi.mock('./components/modals/ProfileModal', () => ({
  default: () => <div data-testid="profile-modal">Profile</div>
}));
vi.mock('./components/modals/ContentModal', () => ({ default: () => null }));
vi.mock('./components/modals/ReflectionModal', () => ({ default: () => null }));
vi.mock('./components/modals/ChecklistFeedbackModal', () => ({ default: () => null }));

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { uid: 'existing-account' }, isAuthReady: true, authError: null });
  useFirestore.mockReturnValue({ data: [], loading: false, error: null });
});

test('Firestore read errors must never trigger the new-profile modal', async () => {
  getDoc.mockRejectedValue({ code: 'permission-denied' });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка чтения профиля');
  expect(screen.queryByTestId('profile-modal')).toBeNull();
});

test('missing profile opens onboarding only after confirmed not found', async () => {
  getDoc.mockResolvedValue({ exists: () => false });
  render(<App />);
  expect(await screen.findByTestId('profile-modal')).toBeTruthy();
});

test('existing profile loads without being overwritten or onboarding', async () => {
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ name: 'Demo', age: 29 })
  });
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('diary-content')).toBeTruthy());
  expect(screen.queryByTestId('profile-modal')).toBeNull();
});

test('collection permission errors display an error rather than empty diary', async () => {
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Demo' }) });
  useFirestore.mockReturnValue({
    data: [], loading: false, error: 'Не удалось загрузить данные'
  });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить');
  expect(screen.queryByTestId('diary-content')).toBeNull();
});

test('auth failure is shown instead of a perpetual spinner', () => {
  useAuth.mockReturnValue({
    user: null, isAuthReady: true, authError: 'Ошибка авторизации'
  });
  render(<App />);
  expect(screen.getByRole('alert')).toHaveTextContent('Ошибка авторизации');
});

test('same-UID email link advances to profile instead of trapping registered user', async () => {
  const refreshUser = vi.fn();
  useAuth.mockReturnValue({
    user: { uid: 'new-anon', isAnonymous: true },
    isAuthReady: true, authError: null, refreshUser
  });
  getDoc.mockResolvedValue({ exists: () => false });
  render(<App />);
  fireEvent.click(await screen.findByTestId('welcome-link'));
  expect(await screen.findByTestId('profile-modal')).toBeInTheDocument();
  expect(refreshUser).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'new-anon', isAnonymous: false })
  );
});

test('selected AI Settings section survives application remount without losing campaign URL', async () => {
  window.history.replaceState(null, '', '/utm_source=chatgpt.com?utm_medium=qa');
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ name: 'Demo' })
  });

  const first = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'AI Settings nav' }));
  expect(await screen.findByTestId('ai-settings-content')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/utm_source=chatgpt.com');
  expect(window.location.search).toContain('utm_medium=qa');
  expect(window.location.search).toContain('view=aiSettings');

  first.unmount();
  render(<App />);
  expect(await screen.findByTestId('ai-settings-content')).toBeInTheDocument();
});

test('browser back navigation restores diary after visiting AI Settings', async () => {
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ name: 'Demo' })
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'AI Settings nav' }));
  expect(await screen.findByTestId('ai-settings-content')).toBeInTheDocument();

  window.history.replaceState(null, '', '/');
  act(() => window.dispatchEvent(new PopStateEvent('popstate')));
  expect(await screen.findByTestId('diary-content')).toBeInTheDocument();
});
