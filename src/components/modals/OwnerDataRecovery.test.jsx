import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OwnerDataRecovery from './OwnerDataRecovery';

const mocks = vi.hoisted(() => ({
  demo: vi.fn(), inspect: vi.fn(), restore: vi.fn()
}));
vi.mock('../../security/ownerDataRecovery', () => ({
  demoRecoveryAllowed: mocks.demo,
  inspectOwnerArchive: mocks.inspect,
  restoreMissingOwnerDocsInDemo: mocks.restore
}));
const inspection = {
  uid: 'synthetic-owner', namespace: 'reflect-8fdc8',
  total: 3, canRestore: true, hasProfile: true,
  counts: { sessions: 0, goals: 0, moods: 1, diaryNotes: 1 },
  documents: [{
    path: 'artifacts/reflect-8fdc8/users/synthetic-owner/diaryNotes/private',
    fields: { text: 'SECRET_SYNTHETIC_PRIVATE_ENTRY' }
  }]
};
const choose = () => fireEvent.change(
  screen.getByLabelText('Файл экспорта Reflect (JSON)'),
  { target: { files: [{
    name: 'synthetic.json', size: 512,
    text: async () => '{"format":"reflect-owner-data-export"}'
  }] } }
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.demo.mockReturnValue(true);
  mocks.inspect.mockReturnValue(inspection);
  mocks.restore.mockResolvedValue({ created: 1, alreadyPresent: 2 });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

test('defaults to collapsed preview with no network read or data exposure', () => {
  render(<OwnerDataRecovery userId="synthetic-owner" />);
  expect(screen.getByText('Проверить архив и восстановить тестовые записи'))
    .toBeInTheDocument();
  expect(mocks.inspect).not.toHaveBeenCalled();
  expect(mocks.restore).not.toHaveBeenCalled();
});

test('file selection only inspects locally; output contains counts, not private fields', async () => {
  render(<OwnerDataRecovery userId="synthetic-owner" />);
  choose();
  await waitFor(() => expect(mocks.inspect).toHaveBeenCalledWith(
    expect.any(String), { uid: 'synthetic-owner' }
  ));
  expect(screen.getByText('Структура архива проверена')).toBeInTheDocument();
  expect(screen.getByText(/Документов: 3/)).toBeInTheDocument();
  expect(screen.queryByText('SECRET_SYNTHETIC_PRIVATE_ENTRY')).toBeNull();
  expect(mocks.restore).not.toHaveBeenCalled();
});

test('restore requires checkbox, exact typed phrase and deliberate browser confirmation', async () => {
  render(<OwnerDataRecovery userId="synthetic-owner" />);
  choose();
  const button = await screen.findByRole('button', {
    name: 'Восстановить отсутствующие записи в тестовой среде'
  });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Введите ВОССТАНОВИТЬ для подтверждения'), {
    target: { value: 'не то слово' }
  });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Введите ВОССТАНОВИТЬ для подтверждения'), {
    target: { value: 'ВОССТАНОВИТЬ' }
  });
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(button);
  expect(mocks.restore).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(mocks.restore).toHaveBeenCalledOnce());
  expect(mocks.restore).toHaveBeenCalledWith(inspection, { uid: 'synthetic-owner' });
  expect(screen.getByRole('status')).toHaveTextContent('Создано отсутствующих документов: 1');
});

test('production can inspect but never exposes the write button', async () => {
  mocks.demo.mockReturnValue(false);
  render(<OwnerDataRecovery userId="synthetic-owner" />);
  choose();
  await screen.findByText('Структура архива проверена');
  expect(screen.queryByRole('button', { name: /Восстановить отсутствующие записи/ }))
    .toBeNull();
  expect(screen.getByText(/В настоящем приложении восстановление отключено/))
    .toBeInTheDocument();
});

test('wrong-account archive shows error and makes no attempt to restore', async () => {
  mocks.inspect.mockImplementationOnce(() => {
    throw new Error('Файл принадлежит другому UID или пространству Reflect.');
  });
  render(<OwnerDataRecovery userId="synthetic-owner" />);
  choose();
  expect(await screen.findByRole('alert')).toHaveTextContent('другому UID');
  expect(mocks.restore).not.toHaveBeenCalled();
});
