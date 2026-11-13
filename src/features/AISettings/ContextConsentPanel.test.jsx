import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContextConsentPanel from './ContextConsentPanel';
import { requestContextConsent } from '../../api/contextConsentService';

// Consent tests must not import the independent context-preview transport,
 // which needs live staging Firebase configuration. Preview has its own suite.
vi.mock('./ContextPreviewPanel', () => ({ default: () => null }));

vi.mock('./StagingPreviewGate5AuditPanel', () => ({
  default: ({ onRevokeAttempt, onRevokeFinished }) => <div>
    <button type="button" onClick={onRevokeAttempt}>QA revoke simulated</button>
    <button type="button" onClick={onRevokeFinished}>QA revoke settled</button>
  </div>
}));

vi.mock('../../api/contextConsentService', () => ({
  contextConsentUiEnabled: true,
  CONTEXT_CONSENT_VERSION: '2026-11-10-01',
  CONTEXT_SCOPE: 'session-turns',
  requestContextConsent: vi.fn()
}));

const sessions = [
  { id: 'session-001', title: 'Synthetic personal topic' },
  { id: 'session-002', title: 'Synthetic second topic' },
  { id: '../../forbidden', title: 'Invalid path' }
];

beforeEach(() => {
  vi.clearAllMocks();
  requestContextConsent.mockResolvedValue({ grants: [] });
});

test('list-only action does not issue permission on mount', () => {
  render(<ContextConsentPanel userId="ownerA" sessions={sessions}/>);
  expect(screen.getByText(/По умолчанию доступ закрыт/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Разрешить на 15 минут' })).toBeDisabled();
  expect(requestContextConsent).not.toHaveBeenCalled();
  expect(screen.queryByRole('option', { name: 'Invalid path' })).not.toBeInTheDocument();
});

test('grant requires selecting a specific session and a separate confirmation', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(id);
  requestContextConsent.mockImplementation(async command => (
    command.action === 'grant'
      ? { status: 'active', expiresAtMs: 1800000000000 }
      : { grants: [{ grantId: id, sourceId: 'session-001',
        scope: 'session-turns', expiresAtMs: 1800000000000 }] }
  ));
  try {
    render(<ContextConsentPanel userId="ownerA" sessions={sessions}/>);
    fireEvent.change(screen.getByRole('combobox', { name: /Выберите сохранённый сеанс/ }), {
      target: { value: 'session-001' }
    });
    expect(screen.getByRole('button', { name: 'Разрешить на 15 минут' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Я разрешаю доступ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Разрешить на 15 минут' }));
    await waitFor(() => expect(requestContextConsent).toHaveBeenCalledTimes(2));
    expect(requestContextConsent).toHaveBeenNthCalledWith(1, {
      action: 'grant', grantId: id, scope: 'session-turns',
      sourceId: 'session-001', consentVersion: '2026-11-10-01'
    });
    expect(screen.getByRole('button', { name: 'Отозвать' })).toBeInTheDocument();
    expect(screen.getByText(/Передача истории в Grok ещё выключена/)).toBeInTheDocument();
  } finally {
    spy.mockRestore();
  }
});

test('revoke is explicit and refreshes owner grants; no message text is transferred', async () => {
  const id = 'grant-request-00001';
  let grants = [{ grantId: id, sourceId: 'session-002',
    scope: 'session-turns', expiresAtMs: 1800000000000 }];
  requestContextConsent.mockImplementation(async command => {
    if (command.action === 'revoke') {
      grants = [];
      return { status: 'revoked' };
    }
    return { grants };
  });
  render(<ContextConsentPanel userId="ownerA" sessions={sessions}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить разрешения' }));
  expect(await screen.findByRole('button', { name: 'Отозвать' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отозвать' }));
  await waitFor(() => expect(requestContextConsent).toHaveBeenCalledTimes(3));
  expect(requestContextConsent).toHaveBeenNthCalledWith(2,
    { action: 'revoke', grantId: id });
  expect(await screen.findByText(/Действующих разрешений нет/)).toBeInTheDocument();
  expect(requestContextConsent.mock.calls.flat().map(v => JSON.stringify(v)).join(''))
    .not.toContain('Synthetic second topic');
});

test('failed consent write never claims access was issued', async () => {
  requestContextConsent.mockRejectedValue(new Error('permission-denied'));
  render(<ContextConsentPanel userId="ownerA" sessions={sessions}/>);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'session-001' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Я разрешаю доступ/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Разрешить на 15 минут' }));
  expect(await screen.findByText(/permission-denied/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Отозвать' })).not.toBeInTheDocument();
});

test('account switch clears previous owner consent list', async () => {
  requestContextConsent.mockResolvedValue({
    grants: [{ grantId: 'grant-request-00001', sourceId: 'session-001',
      scope: 'session-turns', expiresAtMs: 1800000000000 }]
  });
  const view = render(<ContextConsentPanel userId="ownerA" sessions={sessions}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить разрешения' }));
  expect(await screen.findByRole('button', { name: 'Отозвать' })).toBeInTheDocument();
  view.rerender(<ContextConsentPanel userId="ownerB" sessions={[]}/>);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Отозвать' })).toBeNull());
});

test('grant response without matching server grant fails closed instead of reporting success', async () => {
  const id = '00000000-0000-4000-8000-000000000003';
  const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(id);
  requestContextConsent.mockImplementation(async command => command.action === 'grant'
    ? { status: 'active', expiresAtMs: 1800000000000 }
    : { grants: [] });
  try {
    render(<ContextConsentPanel userId="ownerA" sessions={sessions}/>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'session-001' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Я разрешаю доступ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Разрешить на 15 минут' }));
    expect(await screen.findByText(/grant-readback-mismatch/)).toBeInTheDocument();
    expect(screen.getByText(/операция могла выполниться/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Разрешение подтверждено сервером/)).not.toBeInTheDocument();
    expect(requestContextConsent).toHaveBeenCalledTimes(2);
  } finally { spy.mockRestore(); }
});

test('grant readback must match the exact source and a future expiry', async () => {
  const id = '00000000-0000-4000-8000-000000000004';
  const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(id);
  requestContextConsent.mockImplementation(async command => command.action === 'grant'
    ? { status: 'active', expiresAtMs: 1800000000000 }
    : { grants: [{ grantId: id, sourceId: 'session-002',
      scope: 'session-turns', expiresAtMs: 1800000000000 }] });
  try {
    render(<ContextConsentPanel userId="ownerA" sessions={sessions}/>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'session-001' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Я разрешаю доступ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Разрешить на 15 минут' }));
    expect(await screen.findByText(/grant-readback-mismatch/)).toBeInTheDocument();
    expect(screen.queryByText(/Разрешение подтверждено сервером/)).not.toBeInTheDocument();
  } finally { spy.mockRestore(); }
});

test('revoke response is not success until the same grant disappears from server list', async () => {
  const id = 'grant-request-00001';
  const recorded = [{ grantId: id, sourceId: 'session-002',
    scope: 'session-turns', expiresAtMs: 1800000000000 }];
  requestContextConsent.mockImplementation(async command => (
    command.action === 'revoke' ? { status: 'revoked' } : { grants: recorded }
  ));
  render(<ContextConsentPanel userId="ownerA" sessions={sessions}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить разрешения' }));
  expect(await screen.findByRole('button', { name: 'Отозвать' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отозвать' }));
  expect(await screen.findByText(/revoke-readback-mismatch/)).toBeInTheDocument();
  expect(screen.queryByText(/Отзыв доступа подтверждён сервером/)).not.toBeInTheDocument();
  expect(requestContextConsent).toHaveBeenCalledTimes(3);
});


test('QA revoke attempt hides stale cached grants and locks writes until signed refresh', async () => {
  let serverGrants = [{
    grantId: 'synthetic-grant-000001', sourceId: 'session-001',
    scope: 'session-turns', expiresAtMs: 1800000000000
  }];
  requestContextConsent.mockImplementation(async command => {
    expect(command.action).toBe('list');
    return { grants: serverGrants };
  });
  render(<ContextConsentPanel userId="ownerA" sessions={sessions}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить разрешения' }));
  expect(await screen.findByRole('button', { name: 'Отозвать' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'QA revoke simulated' }));
  expect(screen.getByText(/После запуска QA-отзыва/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Отозвать' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Разрешить на 15 минут' })).toBeDisabled();
  expect(requestContextConsent).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Проверить разрешения' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'QA revoke settled' }));
  expect(screen.getByRole('button', { name: 'Проверить разрешения' })).toBeEnabled();
  serverGrants = [];
  fireEvent.click(screen.getByRole('button', { name: 'Проверить разрешения' }));
  expect(await screen.findByText(/Действующих разрешений нет/)).toBeInTheDocument();
  expect(screen.queryByText(/После запуска QA-отзыва/)).not.toBeInTheDocument();
  expect(requestContextConsent).toHaveBeenCalledTimes(2);
});
