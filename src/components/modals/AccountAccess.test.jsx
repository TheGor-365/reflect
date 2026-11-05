import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountAccess from './AccountAccess';
import {
  registerCurrentAnonymous, signInExisting, signOutRegistered
} from '../../hooks/accountAccess';

vi.mock('../../hooks/accountAccess', () => ({
  registerCurrentAnonymous: vi.fn(),
  signInExisting: vi.fn(),
  signOutRegistered: vi.fn(),
  accountErrorMessage: vi.fn(e => e.message || 'Ошибка авторизации')
}));

beforeEach(() => vi.clearAllMocks());

test('new anonymous user can continue without account registration', () => {
  const onGuest = vi.fn();
  render(<AccountAccess user={{ uid: 'anon', isAnonymous: true }} welcome onGuest={onGuest}/>);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить без регистрации' }));
  expect(onGuest).toHaveBeenCalledOnce();
});

test('register action safely links the current guest and closes only on success', async () => {
  registerCurrentAnonymous.mockResolvedValue({ uid: 'anon' });
  const onClose = vi.fn();
  render(<AccountAccess user={{ uid: 'anon', isAnonymous: true }} onClose={onClose}/>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'qa@example.test' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'Synthetic-QA-password-2026!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
  await waitFor(() => expect(registerCurrentAnonymous)
    .toHaveBeenCalledWith('qa@example.test', 'Synthetic-QA-password-2026!'));
  expect(onClose).toHaveBeenCalledOnce();
});

test('login blocked when guest already owns data, without calling Firebase', () => {
  render(<AccountAccess user={{ uid: 'anon', isAnonymous: true }}
    hasLocalData />);
  fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
  expect(screen.getByRole('status')).toHaveTextContent('гостевой профиль уже содержит записи');
  expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled();
  expect(signInExisting).not.toHaveBeenCalled();
});

test('login failure reports error and keeps email, but clears password', async () => {
  signInExisting.mockRejectedValue(new Error('Неверный пароль'));
  render(<AccountAccess user={{ uid: 'anon', isAnonymous: true }}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'qa@example.test' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Неверный пароль');
  expect(screen.getByLabelText('Email')).toHaveValue('qa@example.test');
  expect(screen.getByLabelText('Пароль')).toHaveValue('');
});

test('linked account visibly presents email and explicit signout', async () => {
  signOutRegistered.mockResolvedValue(undefined);
  render(<AccountAccess user={{ uid: 'linked', isAnonymous: false, email: 'qa@example.test' }}
    onClose={vi.fn()}/>);
  expect(screen.getByText('qa@example.test')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
  await waitFor(() => expect(signOutRegistered).toHaveBeenCalledOnce());
});
