import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { auditStagingConsentEndpoint } from '../../api/stagingConsentEndpointAudit';
import StagingConsentEndpointAuditPanel from './StagingConsentEndpointAuditPanel';

vi.mock('../../api/reflectRailwayService', () => ({
  railwayAiEnabled: true
}));
vi.mock('../../api/stagingConsentEndpointAudit', () => ({
  auditStagingConsentEndpoint: vi.fn()
}));
beforeEach(() => vi.clearAllMocks());

test('manual-only consent route QA performs no calls on mount', () => {
  render(<StagingConsentEndpointAuditPanel userId="synthetic-owner"/>);
  expect(screen.getByRole('button', { name: 'Проверить API разрешений' }))
    .toBeEnabled();
  expect(auditStagingConsentEndpoint).not.toHaveBeenCalled();
  expect(screen.getByText(/Новые разрешения не создаются/))
    .toBeInTheDocument();
});

test('reports PASS 4/4 only when full security sequence is verified', async () => {
  auditStagingConsentEndpoint.mockResolvedValue({ status: 'verified', checks: 4 });
  render(<StagingConsentEndpointAuditPanel userId="synthetic-owner"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить API разрешений' }));
  expect(await screen.findByText(/PASS 4\/4/)).toBeInTheDocument();
  expect(auditStagingConsentEndpoint).toHaveBeenCalledTimes(1);
});

test('partial or malformed result never reports PASS', async () => {
  auditStagingConsentEndpoint.mockResolvedValue({ status: 'verified', checks: 3 });
  render(<StagingConsentEndpointAuditPanel userId="synthetic-owner"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить API разрешений' }));
  expect(await screen.findByRole('alert'))
    .toHaveTextContent('consent-audit-unavailable');
  expect(screen.queryByText(/PASS 4\/4/)).not.toBeInTheDocument();
});

test('server refusal shows only allowlisted diagnostic code', async () => {
  auditStagingConsentEndpoint.mockRejectedValue(new Error('permission-denied'));
  render(<StagingConsentEndpointAuditPanel userId="synthetic-owner"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить API разрешений' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('permission-denied');
});

test('redacts unexpected private errors and switches owners safely', async () => {
  auditStagingConsentEndpoint.mockRejectedValue(new Error('SENSITIVE PRIVATE MESSAGE'));
  const view = render(<StagingConsentEndpointAuditPanel userId="account-A"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить API разрешений' }));
  expect(await screen.findByRole('alert'))
    .toHaveTextContent('consent-audit-unavailable');
  expect(screen.getByRole('alert')).not.toHaveTextContent('SENSITIVE PRIVATE MESSAGE');
  view.rerender(<StagingConsentEndpointAuditPanel userId="account-B"/>);
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test('unsigned/anonymous UI cannot run the probe', () => {
  render(<StagingConsentEndpointAuditPanel userId={null}/>);
  expect(screen.getByRole('button', { name: 'Проверить API разрешений' }))
    .toBeDisabled();
  expect(auditStagingConsentEndpoint).not.toHaveBeenCalled();
});
