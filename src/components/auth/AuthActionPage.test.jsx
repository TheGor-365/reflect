import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthActionPage from './AuthActionPage';
import { completeEmailVerification, completePasswordReset } from '../../hooks/accountAccess';
import { checkActionCode, getIdToken, reload } from 'firebase/auth';
import { auth } from '../../firebase/config';

vi.mock('../../firebase/config', () => ({ auth: {
  currentUser: null, authStateReady: vi.fn().mockResolvedValue(undefined)
} }));
vi.mock('firebase/auth', () => ({
  checkActionCode: vi.fn(), reload: vi.fn(), getIdToken: vi.fn()
}));

vi.mock('../../hooks/accountAccess', () => ({
  completeEmailVerification: vi.fn(), completePasswordReset: vi.fn()
}));

const code = 'SyntheticOnceOnly_123456789';
const show = (mode, options = {}) => render(
  <AuthActionPage intent={{ valid: true, mode, code }} {...options} />
);
beforeEach(() => {
  vi.clearAllMocks();
  auth.currentUser = null;
  auth.authStateReady.mockResolvedValue(undefined);
  checkActionCode.mockResolvedValue({ data: { email: 'qa@example.test' } });
  reload.mockResolvedValue(undefined);
  getIdToken.mockResolvedValue('synthetic-no-persisted-id-token');
  completeEmailVerification.mockResolvedValue(undefined);
});

test('invalid intent never consumes a verification action', () => {
  render(<AuthActionPage intent={{ valid: false, mode: null, code: null }}/>);
  expect(screen.getByRole('heading', { name: 'Ссылка недействительна' })).toBeInTheDocument();
  expect(completeEmailVerification).not.toHaveBeenCalled();
  expect(checkActionCode).not.toHaveBeenCalled();
});

test('one-click verification completes without extra UI buttons, no login on another browser', async () => {
  const navigate = vi.fn();
  show('verifyEmail', { onReturnToActiveAccount: navigate });
  await waitFor(() => expect(completeEmailVerification).toHaveBeenCalledWith(code));
  expect(await screen.findByRole('status')).toHaveTextContent('Email подтверждён');
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Подтвердить адрес' })).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('В этом браузере нет подходящей активной сессии');
});

test('verified account returns automatically only for the same authenticated email and UID', async () => {
  const linked = { uid: 'stable-uid', email: 'QA@example.test', isAnonymous: false,
    emailVerified: false };
  auth.currentUser = linked;
  reload.mockImplementation(async user => { user.emailVerified = true; });
  const navigate = vi.fn();
  show('verifyEmail', { onReturnToActiveAccount: navigate });

  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(completeEmailVerification).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledWith(linked);
  expect(getIdToken).toHaveBeenCalledWith(linked, true);
  expect(auth.currentUser.uid).toBe('stable-uid');
});

test('email verification never grants navigation if another user owns the active session', async () => {
  auth.currentUser = { uid: 'other-uid', email: 'other@example.test',
    isAnonymous: false, emailVerified: true };
  const navigate = vi.fn();
  show('verifyEmail', { onReturnToActiveAccount: navigate });
  expect(await screen.findByRole('status')).toHaveTextContent('Email подтверждён');
  expect(navigate).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(getIdToken).not.toHaveBeenCalled();
});

test('verification rejects an invalid code without showing its value or navigating', async () => {
  const navigate = vi.fn();
  checkActionCode.mockRejectedValue({ code: 'auth/invalid-action-code', message: code });
  show('verifyEmail', { onReturnToActiveAccount: navigate });
  const message = await screen.findByRole('alert');
  expect(message).toHaveTextContent('Ссылка недействительна');
  expect(message.textContent).not.toContain(code);
  expect(completeEmailVerification).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

test('React StrictMode does not apply a one-time email code twice', async () => {
  const navigate = vi.fn();
  render(<React.StrictMode>
    <AuthActionPage intent={{ valid: true, mode: 'verifyEmail', code }}
      onReturnToActiveAccount={navigate} />
  </React.StrictMode>);
  expect(await screen.findByRole('status')).toHaveTextContent('Email подтверждён');
  expect(completeEmailVerification).toHaveBeenCalledTimes(1);
});

test.each([
  ['verifyAndChangeEmail', 'Подтвердить новый адрес'],
  ['recoverEmail', 'Вернуть прежний адрес']
])('%s requires explicit owner action and confirms only that action', async (mode, button) => {
  completeEmailVerification.mockResolvedValue(undefined);
  show(mode);
  fireEvent.click(screen.getByRole('button', { name: button }));
  await waitFor(() => expect(completeEmailVerification).toHaveBeenCalledWith(code));
  expect(completeEmailVerification).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument();
  expect(completePasswordReset).not.toHaveBeenCalled();
});

test('password reset never transmits mismatched passwords or a raw error to UI', async () => {
  completePasswordReset.mockRejectedValue({ code: 'auth/invalid-action-code', message: code });
  show('resetPassword');
  fireEvent.change(screen.getByLabelText('Новый пароль', { selector: 'input' }), {
    target: { value: 'correct-synthetic-password' }
  });
  fireEvent.change(screen.getByLabelText('Повторите пароль'), {
    target: { value: 'incorrect-synthetic-password' }
  });
  fireEvent.submit(screen.getByRole('button', { name: 'Сохранить новый пароль' }).closest('form'));
  expect(completePasswordReset).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Пароли не совпадают');
  fireEvent.change(screen.getByLabelText('Новый пароль', { selector: 'input' }), {
    target: { value: 'correct-synthetic-password' }
  });
  fireEvent.change(screen.getByLabelText('Повторите пароль'), {
    target: { value: 'correct-synthetic-password' }
  });
  fireEvent.submit(screen.getByRole('button', { name: 'Сохранить новый пароль' }).closest('form'));
  await waitFor(() => expect(completePasswordReset).toHaveBeenCalledWith(
    code, 'correct-synthetic-password'
  ));
  expect(screen.getByRole('alert')).toHaveTextContent('Ссылка недействительна');
  expect(screen.getByRole('alert').textContent).not.toContain(code);
  expect(screen.getByLabelText('Новый пароль', { selector: 'input' })).toHaveValue('');
});

test('success never signs in, and the return link stays same-origin', async () => {
  completePasswordReset.mockResolvedValue(undefined);
  show('resetPassword');
  fireEvent.change(screen.getByLabelText('Новый пароль', { selector: 'input' }), {
    target: { value: 'synthetic-long-new-password' }
  });
  fireEvent.change(screen.getByLabelText('Повторите пароль'), {
    target: { value: 'synthetic-long-new-password' }
  });
  fireEvent.submit(screen.getByRole('button', { name: 'Сохранить новый пароль' }).closest('form'));
  expect(await screen.findByRole('status')).toHaveTextContent('Пароль изменён');
  expect(screen.getByRole('link', { name: 'На главную Reflect' }).getAttribute('href'))
    .toBe('/');
});
