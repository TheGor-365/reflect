import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StagingPreviewGate5AuditPanel from './StagingPreviewGate5AuditPanel';
import { runGate5PreviewAudit } from '../../api/stagingPreviewGate5Audit';
import {
  prepareGate5Fixture, auditGate5PrivateEntitlement
} from '../../api/stagingGate5Fixture';

vi.mock('../../api/stagingPreviewGate5Audit', () => ({
  GATE5_SESSION_ID: 'ai01k_gate4_synthetic_20261111',
  GATE5_SESSION_TITLE: 'AI-01K Gate 4 Synthetic QA',
  gate5PreviewQaUiEnabled: true,
  gate5SafeError: () => 'qa-transport-error',
  runGate5PreviewAudit: vi.fn()
}));

vi.mock('../../api/stagingGate5Fixture', () => ({
  prepareGate5Fixture: vi.fn(),
  auditGate5PrivateEntitlement: vi.fn()
}));

const SESSION = 'ai01k_gate4_synthetic_20261111';
const grant = {
  grantId: 'synthetic-only-grant-00001', sourceId: SESSION,
  scope: 'session-turns', expiresAtMs: Date.now() + 60 * 60 * 1000
};
const choices = [{ id: SESSION, title: 'AI-01K Gate 4 Synthetic QA' }];
const show = props => render(<StagingPreviewGate5AuditPanel
  userId="synthetic-owner" loaded grants={[grant]} choices={choices} {...props}/>);

beforeEach(() => vi.clearAllMocks());

test('mount never fetches, grants or revokes; manual arming required', () => {
  show();
  expect(runGate5PreviewAudit).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Same-token replay' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cross-route replay' })).toBeDisabled();
  expect(screen.getByRole('button', {
    name: 'Отозвать и проверить прямой отказ 403'
  })).toBeDisabled();
});

test('refuses real session and ambiguously duplicated synthetic grants', () => {
  const { rerender } = show({ choices: [{ id: 'private-owner-session', title: 'Личное' }] });
  expect(screen.getByText(/Синтетический сеанс не найден/)).toBeInTheDocument();
  rerender(<StagingPreviewGate5AuditPanel userId="synthetic-owner"
    loaded grants={[grant, { ...grant, grantId: 'different-synthetic-grant-001' }]}
    choices={choices}/>);
  expect(screen.getByText(/Сейчас: 2/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Same-token replay' })).toBeDisabled();
});

test('one explicit action returns only HTTP status and cannot auto-revoke', async () => {
  runGate5PreviewAudit.mockResolvedValue({
    kind: 'replay', passed: true, statuses: [200, 401]
  });
  show();
  fireEvent.click(screen.getByRole('checkbox', { name: /Я выбираю ручную проверку/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Same-token replay' }));
  expect(await screen.findByText(/replay: PASS/)).toBeInTheDocument();
  expect(runGate5PreviewAudit).toHaveBeenCalledTimes(1);
  expect(runGate5PreviewAudit.mock.calls[0][0]).toEqual(expect.objectContaining({
    kind: 'replay', sourceId: SESSION, grantId: grant.grantId,
    ownerUid: 'synthetic-owner'
  }));
  expect(screen.getByRole('button', {
    name: 'Отозвать и проверить прямой отказ 403'
  })).toBeDisabled();
});

test('revoke needs independent affirmative checkbox', async () => {
  const onRevokeAttempt = vi.fn();
  const onRevokeFinished = vi.fn();
  runGate5PreviewAudit.mockResolvedValue({
    kind: 'revoke-deny', passed: true, statuses: [200, 200, 200, 403]
  });
  show({ onRevokeAttempt, onRevokeFinished });
  expect(onRevokeAttempt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Я выбираю ручную проверку/ }));
  expect(screen.getByRole('button', {
    name: 'Отозвать и проверить прямой отказ 403'
  })).toBeDisabled();
  expect(onRevokeAttempt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Я отдельно подтверждаю отзыв/ }));
  fireEvent.click(screen.getByRole('button', {
    name: 'Отозвать и проверить прямой отказ 403'
  }));
  expect(await screen.findByText(/revoke-deny: PASS/)).toBeInTheDocument();
  expect(runGate5PreviewAudit).toHaveBeenCalledTimes(1);
  expect(onRevokeAttempt).toHaveBeenCalledTimes(1);
  expect(onRevokeFinished).toHaveBeenCalledTimes(1);
});

test('account switch aborts and clears previous status', async () => {
  runGate5PreviewAudit.mockResolvedValue({
    kind: 'replay', passed: true, statuses: [200, 401]
  });
  const view = show();
  fireEvent.click(screen.getByRole('checkbox', { name: /Я выбираю ручную проверку/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Same-token replay' }));
  expect(await screen.findByText(/replay: PASS/)).toBeInTheDocument();
  view.rerender(<StagingPreviewGate5AuditPanel userId="other-owner"
    loaded grants={[]} choices={[]}/>);
  await waitFor(() => expect(screen.queryByText(/replay: PASS/)).not.toBeInTheDocument());
  expect(runGate5PreviewAudit).toHaveBeenCalledTimes(1);
});


test('failed revoke releases refresh lock but never silently certifies permissions', async () => {
  const onRevokeAttempt = vi.fn();
  const onRevokeFinished = vi.fn();
  runGate5PreviewAudit.mockRejectedValue(new Error('qa-transport-error'));
  show({ onRevokeAttempt, onRevokeFinished });
  fireEvent.click(screen.getByRole('checkbox', { name: /Я выбираю ручную проверку/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Я отдельно подтверждаю отзыв/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Отозвать и проверить прямой отказ 403' }));
  expect(await screen.findByText(/Диагностика остановлена/)).toBeInTheDocument();
  expect(onRevokeAttempt).toHaveBeenCalledTimes(1);
  expect(onRevokeFinished).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/revoke-deny: PASS/)).not.toBeInTheDocument();
});

test('new owner must verify private Rules and deliberately arm fixture, no grants', async () => {
  auditGate5PrivateEntitlement.mockResolvedValueOnce('denied');
  prepareGate5Fixture.mockResolvedValueOnce('created');
  show({ choices: [], grants: [], loaded: false });
  expect(prepareGate5Fixture).not.toHaveBeenCalled();
  const create = screen.getByRole('button', {
    name: 'Создать синтетический сеанс (без AI)'
  });
  expect(create).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {
    name: 'Проверить защиту приватного реестра'
  }));
  expect(await screen.findByText(/PASS: браузеру запрещено/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', {
    name: /Я сейчас в отдельном тестовом аккаунте Jack/
  }));
  expect(create).toBeEnabled();
  fireEvent.click(create);
  expect(await screen.findByText(/Синтетический сеанс создан только/))
    .toBeInTheDocument();
  expect(prepareGate5Fixture).toHaveBeenCalledOnce();
  expect(prepareGate5Fixture).toHaveBeenCalledWith('synthetic-owner');
  expect(runGate5PreviewAudit).not.toHaveBeenCalled();
  expect(create).toBeDisabled();
});

test('fixture collision is explicit, no auto-overwrite, no preview', async () => {
  auditGate5PrivateEntitlement.mockResolvedValueOnce('denied');
  prepareGate5Fixture.mockRejectedValueOnce(new Error('fixture-id-collision'));
  show({ choices: [], grants: [] });
  fireEvent.click(screen.getByRole('button', {
    name: 'Проверить защиту приватного реестра'
  }));
  await screen.findByText(/PASS: браузеру запрещено/);
  fireEvent.click(screen.getByRole('checkbox', {
    name: /Я сейчас в отдельном тестовом аккаунте Jack/
  }));
  fireEvent.click(screen.getByRole('button', {
    name: 'Создать синтетический сеанс (без AI)'
  }));
  expect(await screen.findByText(/fixture-id-collision/)).toBeInTheDocument();
  expect(runGate5PreviewAudit).not.toHaveBeenCalled();
});

test('switching owner never carries fixture-creation success forward', async () => {
  auditGate5PrivateEntitlement.mockResolvedValueOnce('denied');
  let resolve;
  prepareGate5Fixture.mockImplementationOnce(() =>
    new Promise(done => { resolve = done; }));
  const view = show({ choices: [], grants: [] });
  fireEvent.click(screen.getByRole('button', {
    name: 'Проверить защиту приватного реестра'
  }));
  await screen.findByText(/PASS: браузеру запрещено/);
  fireEvent.click(screen.getByRole('checkbox', {
    name: /Я сейчас в отдельном тестовом аккаунте Jack/
  }));
  fireEvent.click(screen.getByRole('button', {
    name: 'Создать синтетический сеанс (без AI)'
  }));
  view.rerender(<StagingPreviewGate5AuditPanel userId="different-owner"
    loaded={false} grants={[]} choices={[]}/>);
  resolve('created');
  await waitFor(() => expect(screen.queryByText(/Синтетический сеанс создан только/))
    .toBeNull());
});

test('private Rules readable failure makes setup impossible, no Firestore fixture', async () => {
  auditGate5PrivateEntitlement.mockResolvedValueOnce('unsafe-readable');
  show({ choices: [], grants: [] });
  fireEvent.click(screen.getByRole('button', {
    name: 'Проверить защиту приватного реестра'
  }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'приватный реестр доступен из браузера');
  expect(screen.getByRole('button', {
    name: 'Создать синтетический сеанс (без AI)'
  })).toBeDisabled();
  expect(prepareGate5Fixture).not.toHaveBeenCalled();
  expect(runGate5PreviewAudit).not.toHaveBeenCalled();
});
