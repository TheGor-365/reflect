import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReplyRecoveryPanel from './ReplyRecoveryPanel';

const mocks = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock('../../api/reflectRailwayService', () => ({
  readRailwayTurnStatus: mocks.status
}));
const turn = { id: 'user-original-1234567890', role: 'user',
  content: 'Нужен конкретный план запуска приложения.' };
const renderPanel = onRetry => render(
  <ReplyRecoveryPanel sessionId="owner-session-1" turn={turn}
    onRetry={onRetry} />
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({
    status: 'failed_after_provider', billedPossible: true, canRetry: true
  });
});

test('status is free, NO implicit provider call; retry needs two explicit actions', async () => {
  const retry = vi.fn().mockResolvedValue(true);
  renderPanel(retry);
  expect(mocks.status).not.toHaveBeenCalled();
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Проверить статус бесплатно' }));
  await waitFor(() => expect(mocks.status).toHaveBeenCalledExactlyOnceWith(
    'owner-session-1', turn.id
  ));
  expect(screen.getByText(/Запрос мог быть оплачен/)).toBeInTheDocument();
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Сгенерировать ответ повторно' }));
  expect(screen.getByText(/Это новый платный запрос к Grok/)).toBeInTheDocument();
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Сгенерировать ответ повторно' }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтверждаю новую генерацию' }));
  await waitFor(() => expect(retry).toHaveBeenCalledExactlyOnceWith(turn));
});

test('unknown in-flight attempt blocks resending but status check remains available', async () => {
  mocks.status.mockResolvedValueOnce({
    status: 'provider_pending', billedPossible: true, canRetry: false
  });
  const retry = vi.fn();
  renderPanel(retry);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить статус бесплатно' }));
  await waitFor(() => expect(screen.getByText(/ещё выполняется/)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Сгенерировать ответ повторно' }))
    .not.toBeInTheDocument();
  expect(retry).not.toHaveBeenCalled();
});

test('old user turn without receipt is treated as possibly paid, not free', async () => {
  mocks.status.mockResolvedValueOnce({
    status: 'not_tracked', billedPossible: true, canRetry: true
  });
  renderPanel(vi.fn());
  fireEvent.click(screen.getByRole('button', { name: 'Проверить статус бесплатно' }));
  await waitFor(() => expect(screen.getByText(/нет серверной квитанции/))
    .toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Сгенерировать ответ повторно' }))
    .toBeInTheDocument();
});

test('failed status check never triggers provider and does not leak private SDK errors', async () => {
  mocks.status.mockRejectedValueOnce(new Error('PRIVATE_FIRESTORE_REPLY'));
  const retry = vi.fn();
  renderPanel(retry);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить статус бесплатно' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
    'Ответ не запрашивался у Grok'
  ));
  expect(screen.getByRole('alert').textContent).not.toContain('PRIVATE_FIRESTORE_REPLY');
  expect(retry).not.toHaveBeenCalled();
});
