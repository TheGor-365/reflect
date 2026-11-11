import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthActionPage from './AuthActionPage';
import { completeEmailVerification, completePasswordReset } from '../../hooks/accountAccess';

vi.mock('../../hooks/accountAccess', () => ({
  completeEmailVerification: vi.fn(), completePasswordReset: vi.fn()
}));

const code = 'SyntheticOnceOnly_123456789';
const show = mode => render(<AuthActionPage intent={{ valid: true, mode, code }} />);
beforeEach(() => vi.clearAllMocks());

test('no email action is applied on render or from a malformed link', () => {
  const view = render(<AuthActionPage intent={{ valid: false, mode: null, code: null }}/>);
  expect(screen.getByRole('heading', { name: 'Ссылка недействительна' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Подтвердить адрес' })).not.toBeInTheDocument();
  expect(completeEmailVerification).not.toHaveBeenCalled();
  view.unmount();
  show('verifyEmail');
  expect(completeEmailVerification).not.toHaveBeenCalled();
});

test.each([
  ['verifyEmail', 'Подтвердить адрес'],
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
