import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sessions from './Sessions';

const mocks = vi.hoisted(() => ({
  ai: vi.fn(), addDoc: vi.fn(), setDoc: vi.fn(),
  clearFeedback: vi.fn(), save: vi.fn(), clear: vi.fn()
}));
vi.mock('../../firebase/config', () => ({
  db: {}, appId: 'reflect-8fdc8'
}));
vi.mock('../../api/reflectAssistantService', () => ({
  AI_SESSION_ENABLED: true, getAnalysisFromAI: mocks.ai
}));
vi.mock('firebase/firestore', async importOriginal => {
  const real = await importOriginal();
  return {
    ...real,
    addDoc: mocks.addDoc,
    setDoc: mocks.setDoc,
    collection: vi.fn(() => ({ id: 'demo-session-collection' })),
    doc: vi.fn(() => ({ id: 'demo-session-doc' })),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP')
  };
});
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
  mocks.addDoc.mockResolvedValue({ id: 'new-synthetic-session-id' });
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.clear.mockResolvedValue(undefined);
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true, value: () => '123e4567-e89b-42d3-a456-426614174000'
    });
  }
});

test('explicit send confirms only current message, no automatic save', async () => {
  render(<Sessions {...defaultProps} />);
  const textbox = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  fireEvent.change(textbox, { target: { value: 'Только этот текст' } });
  expect(screen.getByText(/Отправляя сообщение в Grok, вы разрешаете передать/))
    .toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await waitFor(() => expect(mocks.ai).toHaveBeenCalledTimes(1));
  expect(mocks.ai.mock.calls[0][0]).toBe('Только этот текст');
  expect(typeof mocks.ai.mock.calls[0][1]).toBe('string');
  expect(mocks.ai.mock.calls[0].length).toBe(2);
  await waitFor(() => expect(screen.getByText('Начните с одного шага.')).toBeInTheDocument());
  expect(mocks.addDoc).not.toHaveBeenCalled();
  expect(mocks.setDoc).not.toHaveBeenCalled();
  expect(screen.getByText(/Ответ AI пока не сохранён/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Сохранить сеанс' }));
  await waitFor(() => expect(mocks.addDoc).toHaveBeenCalledTimes(1));
  const saved = mocks.addDoc.mock.calls[0][1];
  expect(saved.chatHistory.map(m => m.role)).toEqual(['user', 'assistant']);
  expect(saved.chatHistory.map(m => m.content)).toEqual([
    'Только этот текст', 'Начните с одного шага.'
  ]);
  expect(JSON.stringify(saved)).not.toContain('NO_PROFILE_FOR_AI');
});

test('failed provider call keeps user text, never writes or silently retries', async () => {
  mocks.ai.mockRejectedValueOnce(new Error('SENSITIVE_PROVIDER_BODY'));
  render(<Sessions {...defaultProps} />);
  const textbox = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  fireEvent.change(textbox, { target: { value: 'Исходный пользовательский текст' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await waitFor(() => expect(mocks.ai).toHaveBeenCalledTimes(1));
  expect(textbox).toHaveValue('Исходный пользовательский текст');
  expect(screen.getByRole('alert').textContent).not.toContain('SENSITIVE_PROVIDER_BODY');
  expect(mocks.addDoc).not.toHaveBeenCalled();
  expect(mocks.setDoc).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Сохранить сеанс' })).not.toBeInTheDocument();
});
