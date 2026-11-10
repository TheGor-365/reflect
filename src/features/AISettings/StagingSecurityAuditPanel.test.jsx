import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { auditStagingAuthAppCheck } from '../../api/stagingSecurityAudit';
import StagingSecurityAuditPanel from './StagingSecurityAuditPanel';

vi.mock('../../api/reflectRailwayService', () => ({
  railwayAiEnabled: true
}));
vi.mock('../../api/stagingSecurityAudit', () => ({
  auditStagingAuthAppCheck: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('manual audit never calls API on initial render', () => {
  render(<StagingSecurityAuditPanel userId="synthetic-owner"/>);
  expect(screen.getByRole('button', { name: 'Проверить Auth и App Check' }))
    .toBeEnabled();
  expect(auditStagingAuthAppCheck).not.toHaveBeenCalled();
  expect(screen.getByText(/не читает истории|чтение истории моделью остаются выключены/))
    .toBeInTheDocument();
});

test('three checks are shown only after verified server response', async () => {
  auditStagingAuthAppCheck.mockResolvedValue({
    status: 'verified', checks: 3, readiness: 'ready'
  });
  render(<StagingSecurityAuditPanel userId="synthetic-owner"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить Auth и App Check' }));
  expect(await screen.findByText(/PASS 3\/3/)).toBeInTheDocument();
  expect(screen.getByText(/PASS 3\/3/)).toHaveTextContent('ready');
  expect(auditStagingAuthAppCheck).toHaveBeenCalledTimes(1);
  expect(auditStagingAuthAppCheck).toHaveBeenCalledWith();
});

test('rejected replay or denied account never emits false pass', async () => {
  auditStagingAuthAppCheck.mockRejectedValue(new Error('permission-denied'));
  render(<StagingSecurityAuditPanel userId="synthetic-owner"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить Auth и App Check' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('permission-denied');
  expect(screen.queryByText(/PASS 3\/3/)).not.toBeInTheDocument();
});

test('unknown errors are redacted; no private message in UI', async () => {
  auditStagingAuthAppCheck.mockRejectedValue(new Error('DO_NOT_SURFACE_PII'));
  render(<StagingSecurityAuditPanel userId="synthetic-owner"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить Auth и App Check' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('security-audit-unavailable');
  expect(screen.getByRole('alert')).not.toHaveTextContent('DO_NOT_SURFACE_PII');
});

test('switching accounts clears prior successful result', async () => {
  auditStagingAuthAppCheck.mockResolvedValue({
    status: 'verified', checks: 3, readiness: 'outbound-disabled'
  });
  const view = render(<StagingSecurityAuditPanel userId="owner-A"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить Auth и App Check' }));
  expect(await screen.findByText(/PASS 3\/3/)).toBeInTheDocument();
  view.rerender(<StagingSecurityAuditPanel userId="owner-B"/>);
  await waitFor(() => expect(screen.queryByText(/PASS 3\/3/)).not.toBeInTheDocument());
  expect(auditStagingAuthAppCheck).toHaveBeenCalledTimes(1);
});
