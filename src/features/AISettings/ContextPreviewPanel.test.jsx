import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContextPreviewPanel from './ContextPreviewPanel';
import { requestContextPreview } from '../../api/contextPreviewService';

vi.mock('../../api/contextPreviewService', () => ({
  contextPreviewUiEnabled: true,
  requestContextPreview: vi.fn()
}));
vi.mock('../../api/contextConsentService', () => ({
  CONTEXT_SCOPE: 'session-turns'
}));

const GRANT = 'synthetic-grant-id-00001';
const SOURCE = 'session-001';
const grants = [{
  grantId: GRANT, sourceId: SOURCE, scope: 'session-turns',
  expiresAtMs: 1800000000000
}];
const choices = [
  { id: SOURCE, title: 'Synthetic example session' }
];
const preview = () => ({
  sourceId: SOURCE, scope: 'session-turns',
  turns: [
    { role: 'user', content: 'Точный текст\nи продолжение', truncated: false },
    { role: 'assistant', content: 'Ответ\n<a onclick="evil()">HTML</a>', truncated: false }
  ],
  previewHash: 'a'.repeat(64), totalBytes: 78, sourceTurnCount: 3,
  truncated: true
});
const renderPanel = (props = {}) => render(
  <ContextPreviewPanel userId="owner-A" loaded grants={grants}
    choices={choices} {...props}/>
);
async function openPreview() {
  fireEvent.change(screen.getByRole('combobox', {
    name: 'Выберите один разрешённый сеанс'
  }), { target: { value: GRANT } });
  fireEvent.click(screen.getByRole('button', { name: 'Показать точный фрагмент' }));
  expect(await screen.findByText(/Точный текст/)).toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  requestContextPreview.mockResolvedValue(preview());
});

test('nothing reads preview on mount, not even a signed list', () => {
  renderPanel();
  expect(requestContextPreview).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Показать точный фрагмент' })).toBeDisabled();
  expect(screen.queryByText(/Точный текст/)).not.toBeInTheDocument();
});

test('requires a currently active owner grant and exact source selection', async () => {
  renderPanel();
  await openPreview();
  expect(requestContextPreview).toHaveBeenCalledTimes(1);
  expect(requestContextPreview).toHaveBeenCalledWith({
    grantId: GRANT, sourceId: SOURCE, scope: 'session-turns'
  });
  expect(screen.getByText(/Часть истории обрезана/)).toBeInTheDocument();
  const pieces = screen.getAllByText(/Точный текст|Ответ/);
  expect(pieces.length).toBeGreaterThanOrEqual(2);
  expect(document.querySelector('[onclick="evil()"]')).toBeNull();
  expect(screen.getByText(/<a onclick="evil\(\)">HTML<\/a>/)).toBeInTheDocument();
});

test('separate checked confirmation is strictly local, not a provider call', async () => {
  renderPanel();
  await openPreview();
  const confirm = screen.getByRole('button', {
    name: 'Подтвердить состав (без отправки)'
  });
  expect(confirm).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Я прочитал именно этот фрагмент/ }));
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  expect(screen.getByText(/Состав фрагмента подтверждён только в этом окне/))
    .toBeInTheDocument();
  expect(requestContextPreview).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Никакой отправки в Grok не произошло/))
    .toBeInTheDocument();
});

test('refreshed grant list or revocation invalidates preview and approval', async () => {
  const view = renderPanel();
  await openPreview();
  fireEvent.click(screen.getByRole('checkbox', { name: /Я прочитал именно этот фрагмент/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить состав (без отправки)' }));
  expect(screen.getByText(/Состав фрагмента подтверждён только в этом окне/))
    .toBeInTheDocument();
  view.rerender(<ContextPreviewPanel userId="owner-A" grants={[]}
    loaded choices={choices}/>);
  await waitFor(() => expect(screen.queryByText(/Точный текст/)).not.toBeInTheDocument());
  expect(screen.getByText('Действующих разрешений для просмотра нет.')).toBeInTheDocument();
  expect(requestContextPreview).toHaveBeenCalledTimes(1);
});

test('owner account switch erases preview and local transfer acknowledgement', async () => {
  const view = renderPanel();
  await openPreview();
  view.rerender(<ContextPreviewPanel userId="owner-B" grants={[]}
    loaded choices={[]}/>);
  await waitFor(() => expect(screen.queryByText(/Точный текст/)).not.toBeInTheDocument());
  expect(screen.queryByText(/Состав фрагмента подтверждён только в этом окне/))
    .not.toBeInTheDocument();
});

test('failing App Check, authorization or preview request never shows text', async () => {
  requestContextPreview.mockRejectedValue(new Error('permission-denied'));
  renderPanel();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: GRANT } });
  fireEvent.click(screen.getByRole('button', { name: 'Показать точный фрагмент' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('permission-denied');
  expect(screen.queryByText(/Точный текст/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Подтвердить состав (без отправки)' }))
    .not.toBeInTheDocument();
});

test('unknown private errors are redacted', async () => {
  requestContextPreview.mockRejectedValue(new Error('PRIVATE_SESSION_SECRET'));
  renderPanel();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: GRANT } });
  fireEvent.click(screen.getByRole('button', { name: 'Показать точный фрагмент' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('preview-unavailable');
  expect(screen.getByRole('alert')).not.toHaveTextContent('PRIVATE_SESSION_SECRET');
});

test('expired grant cannot be chosen for preview even if stale list is present', () => {
  renderPanel({ grants: [{ ...grants[0], expiresAtMs: 1 }] });
  expect(screen.getByText('Действующих разрешений для просмотра нет.')).toBeInTheDocument();
  expect(requestContextPreview).not.toHaveBeenCalled();
});
