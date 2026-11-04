import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
vi.mock('./components/layout/Sidebar', () => ({ default: () => null }));
vi.mock('./components/layout/Header', () => ({ default: () => null }));
vi.mock('./features/Diary/Diary', () => ({
  default: () => <div data-testid="diary-content">Diary</div>
}));
vi.mock('./features/Goals/Goals', () => ({ default: () => null }));
vi.mock('./features/Sessions/Sessions', () => ({ default: () => null }));
vi.mock('./features/SessionSchema/SessionSchema', () => ({ default: () => null }));
vi.mock('./components/common/Loader', () => ({
  default: () => <div data-testid="loading" />
}));
vi.mock('./components/modals/ProfileModal', () => ({
  default: () => <div data-testid="profile-modal">Profile</div>
}));
vi.mock('./components/modals/ContentModal', () => ({ default: () => null }));
vi.mock('./components/modals/ReflectionModal', () => ({ default: () => null }));
vi.mock('./components/modals/ChecklistFeedbackModal', () => ({ default: () => null }));

beforeEach(() => {
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
