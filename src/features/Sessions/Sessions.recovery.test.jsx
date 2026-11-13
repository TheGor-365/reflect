import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sessions from './Sessions';

const mocks = vi.hoisted(() => ({
  ai: vi.fn(), status: vi.fn(), create: vi.fn(), append: vi.fn(),
  save: vi.fn(), clearFeedback: vi.fn()
}));
vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('../../api/reflectRailwayService', () => ({
  railwayAiRecoveryEnabled: true, readRailwayTurnStatus: mocks.status
}));
vi.mock('../../api/reflectAssistantService', () => ({
  AI_SESSION_ENABLED: true, getAnalysisFromAI: mocks.ai
}));
vi.mock('./sessionPersistence', () => ({
  createDurableSession: mocks.create, appendDurableTurn: mocks.append
}));
vi.mock('../../hooks/useEntrySave', () => ({
  useEntrySave: () => ({
    status: 'idle', save: mocks.save, clearFeedback: mocks.clearFeedback
  })
}));
const USER = { id: 'user-original-1234567890', role: 'user',
  content: 'Я откладываю запуск приложения.' };
const EXISTING = {
  id: 'existing-session-123', title: 'Откладываю запуск',
  chatHistory: [USER], recommendations: [], exercises: []
};
function Harness({ initial = 'existing-session-123', sessions = [EXISTING] }) {
  const [id, setId] = useState(initial);
  return <Sessions userId="synthetic-eric" profile={{ name: 'Eric' }}
    currentSessionId={id} setCurrentSessionId={setId}
    sessions={sessions} onStartNewSession={() => setId('new')}/>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({
    status: 'failed_after_provider', billedPossible: true, canRetry: true
  });
  mocks.create.mockResolvedValue({ id: 'new-session-123', title: 'Новая тема' });
  mocks.append.mockResolvedValue('existing-session-123');
  mocks.ai.mockResolvedValue({
    response: 'Начните с проверки гипотезы.',
    persistedByServer: true
  });
});

test('free check then explicit paid retry: original user turn never duplicated', async () => {
  render(<Harness/>);
  expect(mocks.ai).not.toHaveBeenCalled();
  expect(screen.getByText('Я откладываю запуск приложения.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Проверить статус бесплатно' }));
  await waitFor(() => expect(screen.getByRole('button', {
    name: 'Сгенерировать ответ повторно'
  })).toBeInTheDocument());
  expect(mocks.ai).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Сгенерировать ответ повторно' }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтверждаю новую генерацию' }));
  await waitFor(() => expect(mocks.ai).toHaveBeenCalledOnce());
  const [text, id, opts] = mocks.ai.mock.calls[0];
  expect(text).toBe(USER.content);
  expect(id).toMatch(/^[A-Za-z0-9_-]{12,80}$/);
  expect(id).not.toBe(USER.id.slice(5));
  expect(opts).toEqual({
    sessionId: EXISTING.id, sourceTurnId: USER.id, retryConfirmed: true
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.append).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText('Начните с проверки гипотезы.'))
    .toBeInTheDocument());
});

test('new user message sends owner-saved source ID; server owns reply persistence', async () => {
  render(<Harness initial="new" sessions={[]}/>);
  const input = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  fireEvent.change(input, { target: { value: 'Новая задача на неделю' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await waitFor(() => expect(mocks.ai).toHaveBeenCalledOnce());
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.create.mock.calls[0][1].role).toBe('user');
  expect(mocks.ai.mock.calls[0][2]).toEqual({
    sessionId: 'new-session-123',
    sourceTurnId: mocks.create.mock.calls[0][1].id
  });
  expect(mocks.append).not.toHaveBeenCalled();
});

test('recovery is never offered when a saved reply already exists', () => {
  render(<Harness sessions={[{
    ...EXISTING, chatHistory: [
      USER, { id: 'assistant-original-1234567890', role: 'assistant',
        sourceTurnId: USER.id, content: 'Вопрос разобран' }
    ]
  }]}/>);
  expect(screen.queryByRole('button', { name: 'Проверить статус бесплатно' }))
    .not.toBeInTheDocument();
  expect(mocks.ai).not.toHaveBeenCalled();
});
