import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sessions from './Sessions';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), append: vi.fn(), ai: vi.fn(), saveDiary: vi.fn(),
  clearFeedback: vi.fn()
}));
// This suite verifies local session persistence/reply behavior, not signed
// Railway recovery. Transport authorization is exercised in dedicated tests.
vi.mock('../../api/reflectRailwayService', () => ({
  railwayAiRecoveryEnabled: false,
  readRailwayTurnStatus: vi.fn()
}));
vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('./sessionPersistence', () => ({
  createDurableSession: mocks.create,
  appendDurableTurn: mocks.append
}));
vi.mock('../../api/reflectAssistantService', () => ({
  AI_SESSION_ENABLED: true, getAnalysisFromAI: mocks.ai
}));
vi.mock('../../hooks/useEntrySave', () => ({
  useEntrySave: () => ({
    status: 'idle', save: mocks.saveDiary, clearFeedback: mocks.clearFeedback
  })
}));

function TestWorkspace() {
  const [currentSessionId, setCurrentSessionId] = useState('new');
  return <Sessions sessions={[]} profile={{ name: 'Eric' }}
    userId="synthetic-eric" currentSessionId={currentSessionId}
    setCurrentSessionId={setCurrentSessionId} onStartNewSession={() => setCurrentSessionId('new')} />;
}
function send(text = 'Хочу разобраться с проектом') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение для сеанса' }), {
    target: { value: text }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ id: 'session-abc', title: 'Сеанс' });
  mocks.append.mockResolvedValue('session-abc');
  mocks.ai.mockResolvedValue({ response: 'Сначала уточним конкретный критерий.' });
});

test('writes the user turn before invoking the paid provider; then auto-appends assistant', async () => {
  const events = [];
  mocks.create.mockImplementation(async (_uid, turn) => {
    events.push('persist-user');
    expect(turn.role).toBe('user');
    return { id: 'session-abc', title: 'Сеанс' };
  });
  mocks.ai.mockImplementation(async () => {
    events.push('provider');
    return { response: 'Один следующий шаг.' };
  });
  mocks.append.mockImplementation(async (_uid, _sid, turn) => {
    events.push('persist-' + turn.role);
  });
  render(<TestWorkspace />);
  send();
  await waitFor(() => expect(mocks.append).toHaveBeenCalledOnce());
  expect(events).toEqual(['persist-user', 'provider', 'persist-assistant']);
  expect(mocks.append.mock.calls[0][2].content).toBe('Один следующий шаг.');
  expect(screen.getByText('Один следующий шаг.')).toBeInTheDocument();
  expect(screen.queryByText('Ответ AI пока не сохранён в Firebase.')).not.toBeInTheDocument();
});

test('a failed initial write never calls Grok and leaves typed text intact', async () => {
  mocks.create.mockRejectedValueOnce(Error('network'));
  render(<TestWorkspace />);
  send();
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Grok не вызывался'));
  expect(mocks.ai).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Сообщение для сеанса' }))
    .toHaveValue('Хочу разобраться с проектом');
});

test('a failed assistant write is recoverable without an extra billable request', async () => {
  mocks.append.mockRejectedValueOnce(Error('network'));
  render(<TestWorkspace />);
  send();
  await waitFor(() => expect(screen.getByRole('button', {
    name: 'Повторить только сохранение'
  })).toBeInTheDocument());
  expect(mocks.ai).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить только сохранение' }));
  await waitFor(() => expect(mocks.append).toHaveBeenCalledTimes(2));
  expect(mocks.ai).toHaveBeenCalledOnce();
  expect(mocks.append.mock.calls[0][2].id).toEqual(mocks.append.mock.calls[1][2].id);
});
