import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { getDoc } from 'firebase/firestore';
import { useAuth } from './hooks/useAuth';
import { useFirestore } from './hooks/useFirestore';
import App from './App';

jest.mock('./firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  arrayUnion: jest.fn(),
  Timestamp: { now: jest.fn() }
}));
jest.mock('./hooks/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('./hooks/useFirestore', () => ({ useFirestore: jest.fn() }));
jest.mock('./components/layout/Sidebar', () => () => null);
jest.mock('./components/layout/Header', () => () => null);
jest.mock('./features/Diary/Diary', () => () =>
  require('react').createElement('div', { 'data-testid': 'diary-content' }, 'Diary'));
jest.mock('./features/Goals/Goals', () => () => null);
jest.mock('./features/Sessions/Sessions', () => () => null);
jest.mock('./features/SessionSchema/SessionSchema', () => () => null);
jest.mock('./components/common/Loader', () => () =>
  require('react').createElement('div', { 'data-testid': 'loading' }));
jest.mock('./components/modals/ProfileModal', () => () =>
  require('react').createElement('div', { 'data-testid': 'profile-modal' }, 'Profile'));
jest.mock('./components/modals/ContentModal', () => () => null);
jest.mock('./components/modals/ReflectionModal', () => () => null);
jest.mock('./components/modals/ChecklistFeedbackModal', () => () => null);

beforeEach(() => {
  jest.clearAllMocks();
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
