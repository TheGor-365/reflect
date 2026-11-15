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
function choose(label) {
  fireEvent.click(screen.getByRole('button', { name: 'Режим AI этого сеанса' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

test('UX R1 saved session saves IMMEDIATELY on choosing the icon; no paid call on mount', async () => {
  const onSaved = vi.fn();
  const onDirtyChange = vi.fn();
  render(<SessionModePicker userId="eric-synthetic"
    sessionId="session-1" value="account" onSaved={onSaved}
    onDirtyChange={onDirtyChange}/>);
  expect(screen.getByRole('button', { name: 'Режим AI этого сеанса' }))
    .toHaveAttribute('aria-expanded', 'false');
  expect(mocks.save).not.toHaveBeenCalled();
  choose('Коучинг');
  expect(onDirtyChange).toHaveBeenCalledWith(true);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save).toHaveBeenCalledWith({
    userId: 'eric-synthetic', sessionId: 'session-1', mode: 'coach'
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith('coach'));
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  expect(screen.queryByRole('button', { name: 'Сохранить режим' }))
    .not.toBeInTheDocument();
  expect(screen.getByText(/Следующий ответ использует этот выбор/))
    .toBeInTheDocument();
});

test('UX R1 first-turn icon choice is local until first saved message, no provider call', () => {
  const onChange = vi.fn();
  render(<SessionModePicker userId="eric-synthetic" value="account"
    onNewSessionMode={onChange}/>);
  choose('Аналитика');
  expect(onChange).toHaveBeenCalledExactlyOnceWith('analytic');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Режим AI этого сеанса' }))
    .toHaveAttribute('title', 'Режим AI: Аналитика');
});

test('UX R1 failed readback restores old mode and never claims saved', async () => {
  mocks.save.mockRejectedValueOnce(new Error('PRIVATE_DB_ERROR'));
  const onSaved = vi.fn(), onDirtyChange = vi.fn();
  render(<SessionModePicker userId="eric-synthetic"
    sessionId="session-1" value="account" onSaved={onSaved}
    onDirtyChange={onDirtyChange}/>);
  choose('Коучинг');
  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('не подтверждён сервером'));
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).not.toContain('PRIVATE_DB_ERROR');
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole('button', { name: 'Режим AI этого сеанса' }))
    .toHaveAttribute('title', 'Режим AI: Как в настройках AI');
});

test('UX R1 changing owner/session discards stale server confirmation', async () => {
  let release;
  mocks.save.mockImplementationOnce(() => new Promise(resolve => {
    release = resolve;
  }));
  const onSaved = vi.fn();
  const view = render(<SessionModePicker userId="eric-synthetic"
    sessionId="session-1" value="account" onSaved={onSaved}/>);
  choose('Коучинг');
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  view.rerender(<SessionModePicker userId="jack-synthetic"
    sessionId="session-2" value="account" onSaved={onSaved}/>);
  release('coach');
  await waitFor(() => expect(screen.getByRole('button', {
    name: 'Режим AI этого сеанса'
  })).toHaveAttribute('title', 'Режим AI: Как в настройках AI'));
  expect(onSaved).not.toHaveBeenCalled();
});
