import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SessionModePicker from './SessionModePicker';

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('./sessionModePersistence', () => ({
  saveSessionMode: (...args) => mocks.save(...args)
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue('coach');
});

test('M4.2 saved session requires click and readback; no provider on mount', async () => {
  const onSaved = vi.fn();
  render(<SessionModePicker userId="eric-synthetic"
    sessionId="session-1" value="account" onSaved={onSaved}/>);
  const picker = screen.getByRole('combobox', {
    name: 'Режим AI этого сеанса'
  });
  expect(picker).toHaveValue('account');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Сохранить режим' })).toBeDisabled();
  fireEvent.change(picker, { target: { value: 'coach' } });
  expect(onSaved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить режим' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save).toHaveBeenCalledWith({
    userId: 'eric-synthetic', sessionId: 'session-1', mode: 'coach'
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith('coach'));
  expect(screen.getByText(/Новые ответы используют этот выбор/)).toBeInTheDocument();
});

test('M4.2 first-turn mode choice is staged locally, no Firestore write or AI call', () => {
  const onChange = vi.fn();
  render(<SessionModePicker userId="eric-synthetic" value="account"
    onNewSessionMode={onChange}/>);
  const picker = screen.getByRole('combobox', {
    name: 'Режим AI этого сеанса'
  });
  fireEvent.change(picker, { target: { value: 'analytic' } });
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange).toHaveBeenCalledWith('analytic');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByText(/сохранится вместе с первым сообщением/))
    .toBeInTheDocument();
});

test('M4.2 failed server confirmation never claims mode has been saved', async () => {
  mocks.save.mockRejectedValueOnce(new Error('PRIVATE_DB_ERROR'));
  const onSaved = vi.fn();
  render(<SessionModePicker userId="eric-synthetic"
    sessionId="session-1" value="account" onSaved={onSaved}/>);
  fireEvent.change(screen.getByRole('combobox', {
    name: 'Режим AI этого сеанса'
  }), { target: { value: 'coach' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить режим' }));
  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('не подтверждён сервером'));
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).not.toContain('PRIVATE_DB_ERROR');
});

test('M4.2 changed owner/session discards an outstanding save response', async () => {
  let release;
  mocks.save.mockImplementationOnce(() => new Promise(resolve => {
    release = resolve;
  }));
  const onSaved = vi.fn();
  const view = render(<SessionModePicker userId="eric-synthetic"
    sessionId="session-1" value="account" onSaved={onSaved}/>);
  fireEvent.change(screen.getByRole('combobox', {
    name: 'Режим AI этого сеанса'
  }), { target: { value: 'coach' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить режим' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  view.rerender(<SessionModePicker userId="jack-synthetic"
    sessionId="session-2" value="account" onSaved={onSaved}/>);
  release('coach');
  await waitFor(() => expect(screen.getByRole('combobox', {
    name: 'Режим AI этого сеанса'
  })).toHaveValue('account'));
  expect(onSaved).not.toHaveBeenCalled();
});
