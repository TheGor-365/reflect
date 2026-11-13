import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sessions from './Sessions';

const mocks = vi.hoisted(() => ({
  ai: vi.fn(), save: vi.fn(), clearFeedback: vi.fn(), create: vi.fn(), append: vi.fn()
}));
vi.mock('../../api/reflectAssistantService', () => ({
  AI_SESSION_ENABLED: true, getAnalysisFromAI: mocks.ai
}));
vi.mock('../../firebase/config', () => ({
  db: {}, appId: 'reflect-8fdc8'
}));
vi.mock('./sessionPersistence', () => ({
  createDurableSession: mocks.create, appendDurableTurn: mocks.append
}));
vi.mock('../../hooks/useEntrySave', () => ({
  useEntrySave: () => ({
    status: 'idle', save: mocks.save, clearFeedback: mocks.clearFeedback
  })
}));

const props = {
  sessions: [], profile: { name: 'Test' }, userId: 'synthetic-owner',
  currentSessionId: 'new', setCurrentSessionId: vi.fn(),
  onStartNewSession: vi.fn()
};

function Harness() {
  const [selectedId, setSelectedId] = useState('new');
  return <Sessions {...props}
    currentSessionId={selectedId} setCurrentSessionId={setSelectedId}/>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ai.mockResolvedValue({ response: 'Один синтетический ответ', actualUsdTicks: null });
  mocks.create.mockResolvedValue({ id: 'session-paid', title: 'Сеанс' });
  mocks.append.mockResolvedValue('session-paid');
});

test('paid Sessions have an explicit send disclosure but no debug widgets or checkbox', () => {
  const { container } = render(<Harness />);
  expect(screen.getByText(/Отправляя сообщение в Grok, вы разрешаете передать/))
    .toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Сообщение для сеанса' }))
    .toHaveAttribute('aria-describedby',
      'reflect-session-message-hint reflect-session-send-privacy');
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  expect(screen.queryByText(/Railway staging · проверка доступа/)).toBeNull();
  expect(screen.queryByText(/Проверить доступ к Grok без генерации/)).toBeNull();
  expect(screen.queryByText(/Пока ИИ недоступен/)).toBeNull();
  expect(mocks.ai).not.toHaveBeenCalled();
});

test('explicit Send invokes only one AI request without a checkbox or automatic retry', async () => {
  const { container } = render(<Harness />);
  const input = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  fireEvent.change(input, { target: { value: 'Синтетическая фраза.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await waitFor(() => expect(mocks.ai).toHaveBeenCalledOnce());
  expect(mocks.ai.mock.calls[0][0]).toBe('Синтетическая фраза.');
  expect(mocks.ai.mock.calls[0][1]).toMatch(/^[A-Za-z0-9_-]{12,80}$/);
  await waitFor(() => {
    expect(screen.getByText('Один синтетический ответ')).toBeInTheDocument();
  });
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  expect(mocks.ai).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.append).toHaveBeenCalledOnce();
});
