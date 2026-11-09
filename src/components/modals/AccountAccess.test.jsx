import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountAccess from './AccountAccess';
import {
  registerCurrentAnonymous, signInExisting, signOutRegistered,
  requestPasswordReset, requestEmailVerification, refreshVerificationStatus,
  requestEmailChange, reauthenticateAndRequestEmailChange
} from '../../hooks/accountAccess';

// AccountAccess tests exercise account interactions, not owner export or
// Firebase initialization. OwnerDataExport has its own dedicated tests.
// Mock this child to keep the strict production Firebase config guard intact.
vi.mock('./OwnerDataExport', () => ({ default: () => null }));

vi.mock('../../hooks/accountAccess', () => ({
  registerCurrentAnonymous: vi.fn(),
  signInExisting: vi.fn(),
  signOutRegistered: vi.fn(),
  requestPasswordReset: vi.fn(), requestEmailVerification: vi.fn(),
  refreshVerificationStatus: vi.fn(), requestEmailChange: vi.fn(),
  reauthenticateAndRequestEmailChange: vi.fn(),
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

test('signed-out user sees login without automatic guest creation or UID switching', async () => {
  const onAccountChanged = vi.fn();
  signInExisting.mockResolvedValue({
    uid: 'registered-user', email: 'qa@example.test', isAnonymous: false
  });
  render(<AccountAccess user={null} signedOut onAccountChanged={onAccountChanged}
    onGuest={vi.fn()}/>);
  expect(screen.getByRole('heading', { name: 'С возвращением' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Регистрация' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Начать новый гостевой профиль' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'qa@example.test' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'synthetic-pass-2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
  await waitFor(() => expect(signInExisting)
    .toHaveBeenCalledWith('qa@example.test', 'synthetic-pass-2026', { hasLocalData: false }));
  expect(onAccountChanged).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'registered-user' })
  );
  expect(registerCurrentAnonymous).not.toHaveBeenCalled();
});

test('profile-only guest can switch account after explicit acknowledgement', async () => {
  signInExisting.mockResolvedValue({ uid: 'restored-user', isAnonymous: false });
  render(<AccountAccess user={{ uid: 'guest-profile-uid', isAnonymous: true }}
    guestProfileOnly />);
  fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
  const signIn = screen.getByRole('button', { name: 'Войти' });
  expect(signIn).toBeDisabled();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(signIn).not.toBeDisabled();
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'qa@example.test' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'synthetic-password' } });
  fireEvent.click(signIn);
  await waitFor(() => expect(signInExisting).toHaveBeenCalledWith(
    'qa@example.test', 'synthetic-password', { hasLocalData: false }
  ));
});

test('signed-out visitor enters guest mode only by pressing the explicit button', async () => {
  const onGuest = vi.fn(async () => {});
  render(<AccountAccess user={null} signedOut onGuest={onGuest} />);
  expect(onGuest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Начать новый гостевой профиль' }));
  await waitFor(() => expect(onGuest).toHaveBeenCalledTimes(1));
});

test('login blocked when guest already owns data, without calling Firebase', () => {
  render(<AccountAccess user={{ uid: 'anon', isAnonymous: true }}
    hasLocalData />);
  fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
  expect(screen.getByRole('status')).toHaveTextContent('В гостевом аккаунте есть записи дневника');
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

test('linked user cannot be trapped in welcome account dialog', () => {
  const onContinue = vi.fn();
  render(<AccountAccess welcome user={{
    uid: 'linked-uid', isAnonymous: false, email: 'demo@example.test'
  }} onContinue={onContinue}/>);
  expect(screen.getByRole('button', { name: 'Продолжить к профилю' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(onContinue).toHaveBeenCalledOnce();
});

test('newly linked anonymous identity advances first-time onboarding', async () => {
  const onAccountChanged = vi.fn();
  registerCurrentAnonymous.mockResolvedValue({
    uid: 'same-uid', isAnonymous: false, email: 'demo@example.test'
  });
  render(<AccountAccess welcome user={{ uid: 'same-uid', isAnonymous: true }}
    onAccountChanged={onAccountChanged}/>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@example.test' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'synthetic-password-1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
  await waitFor(() => expect(onAccountChanged).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'same-uid', isAnonymous: false })
  ));
});


test('guest can request forgotten password without switching UID', async () => {
  requestPasswordReset.mockResolvedValue(undefined);
  render(<AccountAccess user={{ uid: 'guest', isAnonymous: true }}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
  fireEvent.click(screen.getByRole('button', { name: 'Забыли пароль?' }));
  expect(screen.getByRole('heading', { name: 'Восстановление доступа' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Email для восстановления'), {
    target: { value: 'qa@example.test' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Запросить восстановление' }));
  await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith('qa@example.test'));
  expect(screen.getByRole('status')).toHaveTextContent('Если адрес зарегистрирован');
  expect(signInExisting).not.toHaveBeenCalled();
  expect(signOutRegistered).not.toHaveBeenCalled();
});

test('recovery gives identical response for unknown email without revealing existence', async () => {
  requestPasswordReset.mockRejectedValue({ code: 'auth/user-not-found' });
  render(<AccountAccess user={{ uid: 'guest', isAnonymous: true }}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Вход' }));
  fireEvent.click(screen.getByRole('button', { name: 'Забыли пароль?' }));
  fireEvent.change(screen.getByLabelText('Email для восстановления'), {
    target: { value: 'unknown@example.test' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Запросить восстановление' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Если адрес зарегистрирован');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('linked account can verify email, then refresh verified status on same UID', async () => {
  const onAccountChanged = vi.fn();
  requestEmailVerification.mockResolvedValue(undefined);
  refreshVerificationStatus.mockResolvedValue({
    uid: 'linked', email: 'qa@example.test', isAnonymous: false, emailVerified: true
  });
  const { rerender } = render(<AccountAccess user={{
    uid: 'linked', email: 'qa@example.test', isAnonymous: false, emailVerified: false
  }} onAccountChanged={onAccountChanged} />);
  fireEvent.click(screen.getByRole('button', { name: 'Отправить подтверждение email' }));
  await waitFor(() => expect(requestEmailVerification).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Проверить подтверждение' }));
  await waitFor(() => expect(onAccountChanged).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'linked', emailVerified: true })
  ));
  rerender(<AccountAccess user={{
    uid: 'linked', email: 'qa@example.test', isAnonymous: false, emailVerified: true
  }} onAccountChanged={onAccountChanged} />);
  expect(screen.getByText('Email подтверждён')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Отправить подтверждение email' })).toBeNull();
});

test('linked account can safely request changing inaccessible email without losing UID', async () => {
  requestEmailChange.mockResolvedValue(true);
  const onAccountChanged = vi.fn();
  render(<AccountAccess user={{ uid: 'linked', isAnonymous: false,
    email: 'old@example.test', emailVerified: false }}
    onAccountChanged={onAccountChanged} />);
  fireEvent.click(screen.getByRole('button', { name: 'Изменить email' }));
  expect(screen.getByRole('heading', { name: 'Изменить email' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Новый email'), {
    target: { value: 'new@example.test' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить новый email' }));
  await waitFor(() => expect(requestEmailChange).toHaveBeenCalledWith('new@example.test'));
  expect(screen.getByRole('status')).toHaveTextContent('До подтверждения прежний email');
  expect(onAccountChanged).not.toHaveBeenCalled();
  expect(signOutRegistered).not.toHaveBeenCalled();
});

test('Firebase recent-login requirement asks for current password inline without signout', async () => {
  requestEmailChange.mockRejectedValueOnce({ code: 'auth/requires-recent-login' });
  reauthenticateAndRequestEmailChange.mockResolvedValueOnce(true);
  const original = { uid: 'original-uid', isAnonymous: false,
    email: 'old@example.test', emailVerified: false };
  render(<AccountAccess user={original} />);
  fireEvent.click(screen.getByRole('button', { name: 'Изменить email' }));
  fireEvent.change(screen.getByLabelText('Новый email'), {
    target: { value: 'new@example.test' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить новый email' }));
  await waitFor(() => expect(screen.getByLabelText('Пароль текущего аккаунта')).toBeInTheDocument());
  expect(screen.getAllByText(/выходить из приложения не нужно/i).length).toBeGreaterThan(0);
  expect(signOutRegistered).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Пароль текущего аккаунта'), {
    target: { value: 'synthetic-current-password' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить личность и отправить письмо' }));
  await waitFor(() => expect(reauthenticateAndRequestEmailChange)
    .toHaveBeenCalledWith('new@example.test', 'synthetic-current-password'));
  expect(screen.getByRole('status')).toHaveTextContent('Письмо отправлено');
  expect(screen.queryByLabelText('Пароль текущего аккаунта')).toBeNull();
  expect(signOutRegistered).not.toHaveBeenCalled();
});

test('wrong current password keeps same account and clears password input', async () => {
  requestEmailChange.mockRejectedValueOnce({ code: 'auth/requires-recent-login' });
  reauthenticateAndRequestEmailChange.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
  render(<AccountAccess user={{ uid: 'original', isAnonymous: false, email: 'old@example.test' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Изменить email' }));
  fireEvent.change(screen.getByLabelText('Новый email'), {
    target: { value: 'new@example.test' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить новый email' }));
  await screen.findByLabelText('Пароль текущего аккаунта');
  fireEvent.change(screen.getByLabelText('Пароль текущего аккаунта'), {
    target: { value: 'wrong-password' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить личность и отправить письмо' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByLabelText('Пароль текущего аккаунта')).toHaveValue('');
  expect(screen.getByLabelText('Новый email')).toHaveValue('new@example.test');
  expect(signOutRegistered).not.toHaveBeenCalled();
});

test('failed email change preserves account and allows a retry', async () => {
  requestEmailChange.mockRejectedValueOnce(new Error('Повторите попытку.'));
  render(<AccountAccess user={{ uid: 'linked', isAnonymous: false,
    email: 'old@example.test', emailVerified: false }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Изменить email' }));
  fireEvent.change(screen.getByLabelText('Новый email'), {
    target: { value: 'unavailable@example.test' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить новый email' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Повторите попытку.'));
  expect(screen.getByLabelText('Новый email')).toHaveValue('unavailable@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к аккаунту' }));
  expect(screen.getByText('Аккаунт подключён')).toBeInTheDocument();
});

test('linked user may open password recovery without signing out', () => {
  render(<AccountAccess user={{ uid: 'linked', isAnonymous: false,
    email: 'qa@example.test', emailVerified: true }}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Восстановить пароль' }));
  expect(screen.getByLabelText('Email для восстановления')).toHaveValue('qa@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к аккаунту' }));
  expect(screen.getByText('Аккаунт подключён')).toBeInTheDocument();
  expect(signOutRegistered).not.toHaveBeenCalled();
});


test('account dialog locks only the background scroll and restores prior styles', () => {
  const previousRoot = document.documentElement.style.overflow;
  const previousBody = document.body.style.overflow;
  document.documentElement.style.overflow = 'auto';
  document.body.style.overflow = 'scroll';
  const { unmount } = render(<AccountAccess user={{
    uid: 'synthetic-linked', isAnonymous: false,
    email: 'synthetic@example.test', emailVerified: true
  }} onClose={vi.fn()} />);
  expect(document.documentElement.style.overflow).toBe('hidden');
  expect(document.body.style.overflow).toBe('hidden');
  unmount();
  expect(document.documentElement.style.overflow).toBe('auto');
  expect(document.body.style.overflow).toBe('scroll');
  document.documentElement.style.overflow = previousRoot;
  document.body.style.overflow = previousBody;
});

test('Escape closes ordinary account settings without signing out or changing the user', () => {
  const onClose = vi.fn();
  render(<AccountAccess user={{
    uid: 'synthetic-linked', isAnonymous: false,
    email: 'synthetic@example.test', emailVerified: true
  }} onClose={onClose} />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  expect(signOutRegistered).not.toHaveBeenCalled();
});

test('first-time unregistered welcome cannot escape without choosing an onboarding path', () => {
  const onGuest = vi.fn();
  render(<AccountAccess welcome user={{
    uid: 'synthetic-anon', isAnonymous: true
  }} onGuest={onGuest} />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onGuest).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
