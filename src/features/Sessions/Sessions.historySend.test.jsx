import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import Sessions from './Sessions';

const mocks = vi.hoisted(() => ({
  append: vi.fn(), create: vi.fn(), history: vi.fn(),
  regular: vi.fn(), save: vi.fn(), clearFeedback: vi.fn(),
  context: vi.fn(), saveMode: vi.fn()
}));
vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('../../api/reflectAssistantService', () => ({
  AI_SESSION_ENABLED: true, getAnalysisFromAI: mocks.regular
}));
vi.mock('../../api/reflectRailwayService', () => ({
  railwayAiRecoveryEnabled: true, readRailwayTurnStatus: vi.fn()
}));
vi.mock('../../api/sessionMemoryReplyService', () => ({
  sessionMemoryReplyUiEnabled: true,
  sendSessionMemoryReply: mocks.history
}));
vi.mock('../../api/ownerContextLevel', () => ({
  readOwnerContextLevel: mocks.context,
  readOwnerInteractionMode: vi.fn().mockResolvedValue('reflection')
}));
vi.mock('./sessionModePersistence', () => ({
  saveSessionMode: mocks.saveMode
}));
vi.mock('./sessionPersistence', () => ({
  appendDurableTurn: mocks.append, createDurableSession: mocks.create
}));
vi.mock('../../hooks/useEntrySave', () => ({
  useEntrySave: () => ({
    status: 'idle', save: mocks.save, clearFeedback: mocks.clearFeedback
  })
}));
vi.mock('./SessionMemoryReview', () => ({
  default: ({ onConfirmHistory }) => (
    <button type="button" onClick={() => onConfirmHistory({
      sourceId: 'synthetic-session', message: 'Это новый вопрос',
      requestId: 'synthetic-request-123456',
      grantId: 'grant-synthetic123456789',
      approvedDigest: 'a'.repeat(64), confirmed: true,
      contextLevel: 'optimal'
    })}>Отправить просмотренную историю (тест)</button>
  )
}));
vi.mock('./SessionEvidenceLedger', () => ({
  default: () => null
}));
vi.mock('./SessionReturnCheckIn', () => ({
  default: () => null
}));
vi.mock('../../components/common/ProtectedDraftControls', () => ({
  default: () => null
}));
vi.mock('./ChatMessage', () => ({
  default: ({ message }) => <p>{message.content}</p>
}));
vi.mock('./ReplyRecoveryPanel', () => ({
  default: () => null
}));

const base = {
  userId: 'synthetic-eric', currentSessionId: 'synthetic-session',
  sessions: [{
    id: 'synthetic-session', title: 'Исходный вопрос',
    chatHistory: [{
      id: 'user-prior', role: 'user', content: 'Прежний вымышленный вопрос'
    }, {
      id: 'assistant-prior', role: 'assistant', content: 'Синтетический ответ'
    }],
    recommendations: [], exercises: []
  }],
  profile: { name: 'Synthetic' }, setCurrentSessionId: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.append.mockResolvedValue('synthetic-session');
  mocks.context.mockResolvedValue('optimal');
  mocks.saveMode.mockResolvedValue('coach');
  mocks.history.mockResolvedValue({
    response: 'Ответ с историей', historyUsed: true,
    sourceTurnId: 'user-synthetic-request-123456',
    persistedByServer: true
  });
});
async function openHistoryTools() {
  fireEvent.click(screen.getByRole('button', { name: 'Инструменты сеанса' }));
  const item = await screen.findByRole('menuitem', { name: 'Контекст и история' });
  fireEvent.click(item);
  return screen.findByRole('button', {
    name: 'Отправить просмотренную историю (тест)'
  });
}
async function prepare() {
  render(<Sessions {...base}/>);
  fireEvent.change(screen.getByRole('textbox', {
    name: 'Сообщение для сеанса'
  }), { target: { value: 'Это новый вопрос' } });
  return openHistoryTools();
}

test('M3d3 stores exact owner turn before invoking one context-assisted provider call', async () => {
  const sequence = [];
  mocks.append.mockImplementation(async () => {
    sequence.push('commit'); return 'synthetic-session';
  });
  mocks.history.mockImplementation(async () => {
    sequence.push('provider');
    return { response: 'Ответ с историей', historyUsed: true,
      sourceTurnId: 'user-synthetic-request-123456', persistedByServer: true };
  });
  const button = await prepare();
  fireEvent.click(button);
  await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(1));
  expect(sequence).toEqual(['commit', 'provider']);
  expect(mocks.append).toHaveBeenCalledExactlyOnceWith(
    'synthetic-eric','synthetic-session',
    expect.objectContaining({
      id:'user-synthetic-request-123456',
      contextMode:'consented-session',
      content:'Это новый вопрос', role:'user'
    })
  );
  expect(mocks.history.mock.calls[0][0]).toEqual({
    sessionId:'synthetic-session', requestId:'synthetic-request-123456',
    message:'Это новый вопрос', grantId:'grant-synthetic123456789',
    approvedDigest:'a'.repeat(64), confirmed:true,
    contextLevel:'optimal'
  });
  expect(mocks.regular).not.toHaveBeenCalled();
  expect(mocks.append).toHaveBeenCalledTimes(1); // answer saved on server
});

test('M3d3 Firestore write failure prevents any paid provider request', async () => {
  mocks.append.mockRejectedValueOnce(new Error('offline'));
  const button = await prepare();
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('не удалось сохранить'));
  expect(mocks.history).not.toHaveBeenCalled();
  expect(mocks.regular).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', {name:'Сообщение для сеанса'}))
    .toHaveValue('Это новый вопрос');
});

test('M3d3 network ambiguity never triggers a provider retry or ordinary fallback', async () => {
  mocks.history.mockRejectedValueOnce(new Error('history-result-unknown'));
  const button = await prepare();
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole('alert'))
    .toHaveTextContent('мог быть оплачен'));
  expect(mocks.append).toHaveBeenCalledTimes(1);
  expect(mocks.history).toHaveBeenCalledTimes(1);
  expect(mocks.regular).not.toHaveBeenCalled();
});

test('M3d3 stale consent question is rejected before Firestore and provider', async () => {
  render(<Sessions {...base}/>);
  fireEvent.change(screen.getByRole('textbox', {
    name: 'Сообщение для сеанса'
  }), { target: { value: 'Уже другой вопрос' } });
  const button = await openHistoryTools();
  fireEvent.click(button);
  expect(mocks.append).not.toHaveBeenCalled();
  expect(mocks.history).not.toHaveBeenCalled();
});


test('M4.2 explicitly persisted session mode is included in consented user turn, not HTTP payload', async () => {
  mocks.append.mockResolvedValue('synthetic-session');
  const props = {
    ...base,
    sessions: [{ ...base.sessions[0], interactionMode: 'analytic' }]
  };
  render(<Sessions {...props}/>);
  fireEvent.change(screen.getByRole('textbox', {
    name: 'Сообщение для сеанса'
  }), { target: { value: 'Это новый вопрос' } });
  const button = await openHistoryTools();
  fireEvent.click(button);
  await waitFor(() => expect(mocks.history).toHaveBeenCalledOnce());
  expect(mocks.append.mock.calls[0][2].interactionMode).toBe('analytic');
  expect(mocks.history.mock.calls[0][0]).not.toHaveProperty('interactionMode');
  expect(mocks.history).toHaveBeenCalledOnce();
});

test('UX R1: automatic mode save blocks history send until server readback', async () => {
  let finishSave;
  mocks.saveMode.mockImplementationOnce(() => new Promise(resolve => {
    finishSave = resolve;
  }));
  render(<Sessions {...base}/>);
  fireEvent.click(screen.getByRole('button', {
    name: 'Режим AI этого сеанса'
  }));
  fireEvent.click(screen.getByRole('option', { name: 'Коучинг' }));
  fireEvent.change(screen.getByRole('textbox', {
    name: 'Сообщение для сеанса'
  }), { target: { value: 'Это новый вопрос' } });
  const paid = await openHistoryTools();
  expect(screen.getByRole('button', {
    name: 'Отправить сообщение'
  })).toBeDisabled();
  fireEvent.click(paid);
  expect(mocks.history).not.toHaveBeenCalled();
  expect(mocks.append).not.toHaveBeenCalled();
  await waitFor(() => expect(mocks.saveMode).toHaveBeenCalledOnce());
  finishSave('coach');
  await waitFor(() => expect(screen.getByRole('button', {
    name: 'Отправить сообщение'
  })).toBeEnabled());
  fireEvent.click(paid);
  await waitFor(() => expect(mocks.history).toHaveBeenCalledOnce());
  expect(mocks.append.mock.calls[0][2].interactionMode).toBe('coach');
  expect(mocks.history.mock.calls[0][0]).not.toHaveProperty('interactionMode');
});
