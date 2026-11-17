import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sessions from './Sessions';

const mocks = vi.hoisted(() => ({
  ai: vi.fn(), deleted: vi.fn(), save: vi.fn(), feedback: vi.fn()
}));
vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('../../api/reflectRailwayService', () => ({
  railwayAiRecoveryEnabled: false
}));
vi.mock('../../api/reflectAssistantService', () => ({
  AI_SESSION_ENABLED: true, getAnalysisFromAI: mocks.ai
}));
vi.mock('./sessionDeletion', () => ({
  deleteOwnerSession: mocks.deleted
}));
vi.mock('../../hooks/useEntrySave', () => ({
  useEntrySave: () => ({
    status: 'idle', save: mocks.save, clearFeedback: mocks.feedback
  })
}));
const EXISTING = {
  id: 'saved-eric-session', title: 'Нервничаю перед заказами',
  chatHistory: [{ id: 'user-1234567890123456', role: 'user',
    content: 'Боюсь начать заниматься фрилансом.' }],
  recommendations: [], exercises: []
};
function Harness({ libraryRequested = false, initial = EXISTING.id, goals = [] }) {
  const [id, setId] = useState(initial);
  return <Sessions userId="eric-owner" profile={{ name: 'Eric' }}
    currentSessionId={id} setCurrentSessionId={setId}
    sessions={[EXISTING]} goals={goals}
    libraryRequested={libraryRequested}
    onStartNewSession={() => setId('new')}/>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleted.mockResolvedValue('saved-eric-session');
});
test('ellipsis opens session deletion without mutation; confirmed action deletes one owner path', async () => {
  render(<Harness/>);
  fireEvent.click(screen.getByRole('button', { name: 'Инструменты сеанса' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить сеанс' }));
  expect(screen.getByRole('alertdialog', { name: 'Удалить сеанс?' })).toBeInTheDocument();
  expect(mocks.deleted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Удалить навсегда' }));
  await waitFor(() => expect(mocks.deleted)
    .toHaveBeenCalledExactlyOnceWith('eric-owner', 'saved-eric-session'));
  expect(mocks.ai).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Новый сеанс' }))
    .toBeInTheDocument());
});
test('library card exposes a quiet delete action and keeps linked goals', async () => {
  render(<Harness libraryRequested goals={[{
    id: 'g1', sessionId: EXISTING.id, title: 'Моя отдельная цель'
  }]}/>);
  fireEvent.click(screen.getByRole('button', {
    name: 'Удалить сеанс: Нервничаю перед заказами'
  }));
  expect(screen.getByText(/Связанные цели \(1\)/)).toBeInTheDocument();
  expect(mocks.deleted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Оставить сеанс' }));
  expect(mocks.deleted).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
test('failure does not clear session or close dialog, owner can cancel', async () => {
  mocks.deleted.mockRejectedValueOnce(new Error('PRIVATE_PERMISSION_DENIED'));
  render(<Harness/>);
  fireEvent.click(screen.getByRole('button', { name: 'Инструменты сеанса' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить сеанс' }));
  fireEvent.click(screen.getByRole('button', { name: 'Удалить навсегда' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
    'Не удалось удалить сеанс.'
  ));
  expect(screen.getByRole('alert').textContent)
    .not.toContain('PRIVATE_PERMISSION_DENIED');
  expect(screen.getByText('Боюсь начать заниматься фрилансом.'))
    .toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Оставить сеанс' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
test('unsubmitted owner draft prevents destructive session deletion', () => {
  render(<Harness/>);
  fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение для сеанса' }),
    { target: { value: 'Мой неотправленный черновик' } });
  fireEvent.click(screen.getByRole('button', { name: 'Инструменты сеанса' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить сеанс' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(mocks.deleted).not.toHaveBeenCalled();
});
