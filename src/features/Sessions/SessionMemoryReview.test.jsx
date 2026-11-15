import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SessionMemoryReview from './SessionMemoryReview';

const mocks = vi.hoisted(() => ({
  list: vi.fn(), preview: vi.fn()
}));
vi.mock('../../api/contextConsentService', () => ({
  CONTEXT_SCOPE: 'session-turns',
  requestContextConsent: mocks.list
}));
vi.mock('../../api/sessionMemoryPreviewService', () => ({
  sessionMemoryPreviewUiEnabled: true,
  requestSessionMemoryPreview: mocks.preview
}));
vi.mock('../../api/sessionMemoryReplyService', () => ({
  sessionMemoryReplyUiEnabled: true
}));

const sessionId = 'session-123';
const one = {
  sourceId: sessionId, requestId: 'request-fixture-123456789',
  approvalDigest: 'a'.repeat(64),
  turns: [{ sourceTurnId: 'user-prior', role: 'user',
    content: 'Ранее я уже объяснил ограничение.', truncated: false }],
  totalBytes: 80, truncated: false
};
const props = { sessionId, userId: 'eric-synthetic',
  draftMessage: 'Это новый вопрос', disabled: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'request-fixture-123456789' });
  mocks.list.mockResolvedValue({ grants: [{
    grantId: 'grant-fixture-1234567890', sourceId: sessionId,
    scope: 'session-turns', expiresAtMs: Date.now() + 600000
  }] });
  mocks.preview.mockResolvedValue(one);
});
afterEach(() => vi.unstubAllGlobals());

test('no automatic grant lookup, preview, consent or provider send on mount', () => {
  render(<SessionMemoryReview {...props}/>);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(screen.getByText(/не разрешение передать историю в xAI/))
    .toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Посмотреть до четырёх реплик',
    hidden: true })).toBeDisabled();
});

test('requires verified existing grant and explicit user click for preview', async () => {
  render(<SessionMemoryReview {...props}/>);
  fireEvent.click(screen.getByRole('button', {name:'Проверить разрешение', hidden:true}));
  await waitFor(() => expect(mocks.list).toHaveBeenCalledWith({ action:'list' }));
  await waitFor(() => expect(screen.getByRole('button',{
    name:'Посмотреть до четырёх реплик',hidden:true
  })).toBeEnabled());
  expect(mocks.preview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{
    name:'Посмотреть до четырёх реплик',hidden:true
  }));
  await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
  expect(mocks.preview.mock.calls[0][0]).toMatchObject({
    sourceId:sessionId, message:'Это новый вопрос',
    requestId:'request-fixture-123456789'
  });
  expect(await screen.findByText('Ранее я уже объяснил ограничение.'))
    .toBeInTheDocument();
  expect(screen.getByText(/не отправлялись/)).toBeInTheDocument();
  const checkbox = screen.getByRole('checkbox', { hidden:true });
  fireEvent.click(checkbox);
  expect(screen.getByText(/Просмотр отмечен только на этом экране/))
    .toBeInTheDocument();
});

test('changing draft invalidates the inspected preview and cached grant', async () => {
  const { rerender } = render(<SessionMemoryReview {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'Проверить разрешение',hidden:true}));
  await waitFor(() => expect(screen.getByRole('button',{
    name:'Посмотреть до четырёх реплик',hidden:true
  })).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{
    name:'Посмотреть до четырёх реплик',hidden:true
  }));
  await screen.findByText('Ранее я уже объяснил ограничение.');
  rerender(<SessionMemoryReview {...props} draftMessage="Другое сообщение"/>);
  await waitFor(() => expect(screen.queryByText('Ранее я уже объяснил ограничение.'))
    .not.toBeInTheDocument());
  expect(screen.getByRole('button',{name:'Посмотреть до четырёх реплик',
    hidden:true})).toBeDisabled();
});

test('revoked or expired grant cannot trigger a preview', async () => {
  mocks.list.mockResolvedValue({ grants: [] });
  render(<SessionMemoryReview {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'Проверить разрешение',hidden:true}));
  await waitFor(() => expect(screen.getByText(/Действующего разрешения/))
    .toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{
    name:'Посмотреть до четырёх реплик',hidden:true
  }));
  expect(mocks.preview).not.toHaveBeenCalled();
});

test('owner must approve both viewed excerpts and ONE external paid send', async () => {
  const onConfirmHistory = vi.fn().mockResolvedValue(true);
  render(<SessionMemoryReview {...props} onConfirmHistory={onConfirmHistory}/>);
  expect(onConfirmHistory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name:'Проверить разрешение',hidden:true}));
  await waitFor(() => expect(screen.getByRole('button', {
    name:'Посмотреть до четырёх реплик',hidden:true
  })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {
    name:'Посмотреть до четырёх реплик',hidden:true
  }));
  await screen.findByText('Ранее я уже объяснил ограничение.');
  expect(screen.queryByRole('button', {
    name:/Отправить в Grok с историей/,hidden:true
  })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', {hidden:true}));
  const paid = screen.getByRole('button', {
    name:/Отправить в Grok с историей/,hidden:true
  });
  expect(paid).toBeDisabled();
  expect(onConfirmHistory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', {
    name:/Я отдельно разрешаю передать/,hidden:true
  }));
  expect(paid).toBeEnabled();
  fireEvent.click(paid);
  await waitFor(() => expect(onConfirmHistory).toHaveBeenCalledTimes(1));
  expect(onConfirmHistory.mock.calls[0][0]).toEqual({
    sourceId: sessionId, message: props.draftMessage,
    requestId: 'request-fixture-123456789',
    approvedDigest: 'a'.repeat(64),
    grantId: 'grant-fixture-1234567890', confirmed: true
  });
  expect(screen.queryByText('Ранее я уже объяснил ограничение.'))
    .not.toBeInTheDocument();
  expect(screen.getByRole('button', {
    name:'Проверить разрешение',hidden:true
  })).toBeDisabled();
  fireEvent.click(paid);
  expect(onConfirmHistory).toHaveBeenCalledTimes(1);
});

test('cancelling the reviewed preview never sends history', async () => {
  const onConfirmHistory = vi.fn();
  render(<SessionMemoryReview {...props} onConfirmHistory={onConfirmHistory}/>);
  fireEvent.click(screen.getByRole('button', {name:'Проверить разрешение',hidden:true}));
  await waitFor(() => expect(screen.getByRole('button', {
    name:'Посмотреть до четырёх реплик',hidden:true
  })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {
    name:'Посмотреть до четырёх реплик',hidden:true
  }));
  await screen.findByText('Ранее я уже объяснил ограничение.');
  fireEvent.click(screen.getByRole('checkbox', {hidden:true}));
  fireEvent.click(screen.getByRole('checkbox', {
    name:/Я отдельно разрешаю передать/,hidden:true
  }));
  fireEvent.click(screen.getByRole('button', {name:'Скрыть просмотр',hidden:true}));
  expect(screen.queryByRole('button', {
    name:/Отправить в Grok с историей/,hidden:true
  })).not.toBeInTheDocument();
  expect(onConfirmHistory).not.toHaveBeenCalled();
});

test('changing question or session invalidates paid confirmation without a call', async () => {
  const onConfirmHistory = vi.fn();
  const {rerender} = render(
    <SessionMemoryReview {...props} onConfirmHistory={onConfirmHistory}/>
  );
  fireEvent.click(screen.getByRole('button', {name:'Проверить разрешение',hidden:true}));
  await waitFor(() => expect(screen.getByRole('button', {
    name:'Посмотреть до четырёх реплик',hidden:true
  })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {
    name:'Посмотреть до четырёх реплик',hidden:true
  }));
  await screen.findByText('Ранее я уже объяснил ограничение.');
  fireEvent.click(screen.getByRole('checkbox', {hidden:true}));
  rerender(<SessionMemoryReview {...props} draftMessage="Новый вопрос"
    onConfirmHistory={onConfirmHistory}/>);
  await waitFor(() => expect(screen.queryByText('Ранее я уже объяснил ограничение.'))
    .not.toBeInTheDocument());
  expect(onConfirmHistory).not.toHaveBeenCalled();
});

test('M3 tier change invalidates inspected deep excerpts and blocks stale send', async () => {
  const onConfirmHistory = vi.fn();
  const deepPreview = { ...one, contextLevel: 'deep' };
  mocks.preview.mockResolvedValueOnce(deepPreview);
  const { rerender } = render(<SessionMemoryReview {...props}
    contextLevel="deep" onConfirmHistory={onConfirmHistory}/>);
  fireEvent.click(screen.getByRole('button', {
    name:'Проверить разрешение',hidden:true
  }));
  await waitFor(() => expect(screen.getByRole('button', {
    name:'Посмотреть до 6 реплик',hidden:true
  })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {
    name:'Посмотреть до 6 реплик',hidden:true
  }));
  await screen.findByText('Ранее я уже объяснил ограничение.');
  expect(mocks.preview.mock.calls[0][0].contextLevel).toBe('deep');
  rerender(<SessionMemoryReview {...props}
    contextLevel="optimal" onConfirmHistory={onConfirmHistory}/>);
  await waitFor(() => expect(screen.queryByText(
    'Ранее я уже объяснил ограничение.'
  )).not.toBeInTheDocument());
  expect(screen.getByRole('button', {
    name:'Посмотреть до 2 реплик',hidden:true
  })).toBeDisabled();
  expect(onConfirmHistory).not.toHaveBeenCalled();
});
