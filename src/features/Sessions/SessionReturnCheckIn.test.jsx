import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SessionReturnCheckIn from './SessionReturnCheckIn';
import { saveSessionReturn } from './sessionReturn';

vi.mock('./sessionReturn', () => ({ saveSessionReturn: vi.fn() }));
vi.mock('../../components/common/ProtectedDraftControls', () => ({
  default: () => null
}));
beforeEach(() => {
  vi.clearAllMocks();
  saveSessionReturn.mockResolvedValue({ id: 'v1' });
});
const props = { userId: 'synthetic-uid', session: { id: 'saved-session', chatHistory: [] } };
test('user opts in to record a return; no write on open or typing', async () => {
  render(<SessionReturnCheckIn {...props}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  expect(saveSessionReturn).not.toHaveBeenCalled();
  const textbox = screen.getByRole('textbox', { name: 'Что изменилось с прошлого раза?' });
  fireEvent.change(textbox, { target: { value: 'Два раза прочитал по 20 минут' } });
  expect(saveSessionReturn).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить наблюдение' }));
  await waitFor(() => expect(saveSessionReturn).toHaveBeenCalledTimes(1));
  expect(saveSessionReturn).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'synthetic-uid', sessionId: 'saved-session',
    note: 'Два раза прочитал по 20 минут'
  }));
  await waitFor(() => expect(textbox).toHaveValue(''));
  expect(screen.getByText(/не отправлялось Grok/)).toBeInTheDocument();
});
test('network error preserves editable return for deliberate retry with same ID', async () => {
  saveSessionReturn.mockRejectedValueOnce(new Error('Сеть недоступна'))
    .mockResolvedValueOnce({ id: 'v1' });
  render(<SessionReturnCheckIn {...props}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  const textbox = screen.getByRole('textbox', { name: 'Что изменилось с прошлого раза?' });
  fireEvent.change(textbox, { target: { value: 'Не терять запись' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить наблюдение' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Сеть недоступна'));
  expect(textbox).toHaveValue('Не терять запись');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить наблюдение' }));
  await waitFor(() => expect(saveSessionReturn).toHaveBeenCalledTimes(2));
  expect(saveSessionReturn.mock.calls[0][0].visitId)
    .toBe(saveSessionReturn.mock.calls[1][0].visitId);
});
test('shows only user-authored return notes, not fabricated model events', () => {
  render(<SessionReturnCheckIn {...props} session={{
    ...props.session,
    returnCheckIns: [
      { id: 'v1', type: 'return-check-in', author: 'user',
        text: 'Подтверждённое наблюдение' },
      { id: 'fake', type: 'return-check-in', author: 'assistant',
        text: 'Ложный прогресс' }
    ]
  }}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  expect(screen.getByText('Подтверждённое наблюдение')).toBeInTheDocument();
  expect(screen.queryByText('Ложный прогресс')).toBeNull();
});

test('Journey source opens the exact saved return record, not an unrelated note', async () => {
  const onFocusConsumed = vi.fn();
  const focused = {
    kind: 'return', sessionId: 'saved-session',
    returnIndex: 1, returnId: 'v2', requestId: 'focus-1'
  };
  render(<SessionReturnCheckIn {...props} onFocusConsumed={onFocusConsumed}
    focusTarget={focused} session={{
      ...props.session,
      returnCheckIns: [
        { id: 'v1', type: 'return-check-in', author: 'user', text: 'Первый визит' },
        { id: 'v2', type: 'return-check-in', author: 'user', text: 'Второй визит' }
      ]
    }}/>);
  const target = screen.getByText('Второй визит').closest('[data-return-source-index]');
  expect(target).toHaveAttribute('data-return-source-index', '1');
  expect(target.closest('details')).toHaveAttribute('open');
  expect(onFocusConsumed).toHaveBeenCalledTimes(1);
  expect(saveSessionReturn).not.toHaveBeenCalled();
});
