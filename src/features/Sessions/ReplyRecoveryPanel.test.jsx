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

test('free receipt check exposes only safe error class, never private provider detail', async () => {
  mocks.status.mockResolvedValueOnce({
    status: 'failed_after_provider', billedPossible: true, canRetry: true,
    errorCode: 'invalid-provider-response'
  });
  renderPanel(vi.fn());
  fireEvent.click(screen.getByRole('button', { name: 'Проверить статус бесплатно' }));
  await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent(
    'Ответ провайдера не прошёл проверку структуры Reflect.'
  ));
  expect(screen.getByRole('note')).toHaveTextContent('invalid-provider-response');
  expect(screen.getByRole('note')).not.toHaveTextContent('PRIVATE');
  expect(screen.getByRole('button', { name: 'Сгенерировать ответ повторно' }))
    .toBeInTheDocument();
});

test('unrecognized receipt metadata is not rendered as a diagnostic message', async () => {
  mocks.status.mockResolvedValueOnce({
    status: 'failed_after_provider', billedPossible: true, canRetry: false,
    errorCode: 'SECRET_SESSION_DATA'
  });
  renderPanel(vi.fn());
  fireEvent.click(screen.getByRole('button', { name: 'Проверить статус бесплатно' }));
  await waitFor(() => expect(screen.getByText(/Запрос мог быть оплачен/))
    .toBeInTheDocument());
  expect(screen.queryByText(/SECRET_SESSION_DATA/)).not.toBeInTheDocument();
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
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

test.each([
  ['xai-response-incomplete', 'не завершил ответ'],
  ['xai-envelope-invalid', 'служебная структура'],
  ['xai-interaction-invalid', 'нарушает правила структуры Reflect'],
  ['xai-transport-invalid', 'корректным JSON-ответом']
])('safe errorCode %s appears only after owner requests status', async (code, text) => {
  mocks.status.mockResolvedValueOnce({
    status: 'failed_after_provider', billedPossible: true, canRetry: true,
    errorCode: code
  });
  renderPanel(vi.fn());
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Проверить статус бесплатно' }));
  await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent(text));
  expect(screen.getByRole('note')).toHaveTextContent(code);
});
