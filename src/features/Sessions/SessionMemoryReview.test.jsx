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
