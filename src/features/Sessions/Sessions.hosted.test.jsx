import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sessions from './Sessions';

const mocks = vi.hoisted(() => ({
  ai: vi.fn(), create: vi.fn(), append: vi.fn(),
  clearFeedback: vi.fn(), save: vi.fn(), clear: vi.fn()
}));
vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('../../api/reflectAssistantService', () => ({
  AI_SESSION_ENABLED: true, getAnalysisFromAI: mocks.ai
}));
vi.mock('./sessionPersistence', () => ({
  createDurableSession: mocks.create,
  appendDurableTurn: mocks.append
}));
vi.mock('../../hooks/useEntrySave', () => ({
  useEntrySave: () => ({
    status: 'idle', save: mocks.save, clearFeedback: mocks.clearFeedback
  })
}));
vi.mock('../../components/common/ProtectedDraftControls', async () => {
  const ReactModule = await import('react');
  const R = ReactModule.default;
  return {
    default: R.forwardRef(function StubDraft(_props, ref) {
      R.useImperativeHandle(ref, () => ({ clearAfterCommit: mocks.clear }));
      return R.createElement('span', null, 'Protected draft retained');
    })
  };
});
const defaultProps = {
  sessions: [], profile: { privateMemo: 'NO_PROFILE_FOR_AI' },
  userId: 'demo-owner', currentSessionId: 'new',
  setCurrentSessionId: vi.fn(), onStartNewSession: vi.fn()
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ai.mockResolvedValue({ response: 'Начните с одного шага.', actualUsdTicks: 190000 });
  mocks.create.mockResolvedValue({ id: 'new-synthetic-session-id', title: 'Сеанс' });
  mocks.append.mockResolvedValue('new-synthetic-session-id');
  mocks.clear.mockResolvedValue(undefined);
});

test('explicit send persists owner message before Grok and automatically saves the answer', async () => {
  const order = [];
  mocks.create.mockImplementation(async (_owner, turn) => {
    order.push('user-saved');
    expect(turn.content).toBe('Только этот текст');
    return { id: 'new-synthetic-session-id', title: 'Сеанс' };
  });
  mocks.ai.mockImplementation(async () => {
    order.push('provider');
    return { response: 'Начните с одного шага.', actualUsdTicks: 190000 };
  });
  mocks.append.mockImplementation(async () => { order.push('assistant-saved'); });
  render(<Sessions {...defaultProps} />);
  const textbox = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  fireEvent.change(textbox, { target: { value: 'Только этот текст' } });
  expect(screen.getByText(/Отправляя сообщение в Grok, вы разрешаете передать/)).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await waitFor(() => expect(mocks.append).toHaveBeenCalledOnce());
  expect(order).toEqual(['user-saved', 'provider', 'assistant-saved']);
  expect(mocks.ai.mock.calls[0]).toHaveLength(2);
  expect(mocks.ai.mock.calls[0][0]).toBe('Только этот текст');
  expect(JSON.stringify(mocks.append.mock.calls)).not.toContain('NO_PROFILE_FOR_AI');
  expect(screen.getByText('Начните с одного шага.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Сохранить сеанс' })).toBeNull();
});

test('failed provider call leaves a durable user turn; never silently retries or leaks provider errors', async () => {
  mocks.ai.mockRejectedValueOnce(new Error('SENSITIVE_PROVIDER_BODY'));
  render(<Sessions {...defaultProps} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение для сеанса' }), {
    target: { value: 'Исходный пользовательский текст' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await waitFor(() => expect(mocks.ai).toHaveBeenCalledOnce());
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.create.mock.calls[0][1].content).toBe('Исходный пользовательский текст');
  expect(mocks.append).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByRole('alert').textContent).not.toContain('SENSITIVE_PROVIDER_BODY');
  expect(mocks.ai).toHaveBeenCalledOnce();
});
