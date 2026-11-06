import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OwnerDataExport from './OwnerDataExport';

const mock = vi.hoisted(() => ({
  build: vi.fn(), download: vi.fn()
}));
vi.mock('../../security/ownerDataExport', () => ({
  buildOwnerExport: mock.build,
  downloadOwnerExport: mock.download
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  mock.build.mockResolvedValue({
    json: '{\n  "format": "reflect-owner-data-export"\n}',
    count: 4,
    sizeBytes: 2048
  });
});

afterEach(() => vi.restoreAllMocks());

test('guest/registered owner sees explicit export warning and consent before any query', () => {
  render(<OwnerDataExport userId="synthetic-owner" />);
  expect(screen.getByText(/JSON не зашифрован/)).toBeInTheDocument();
  expect(mock.build).not.toHaveBeenCalled();
});

test('rejecting consent does not read, download or mutate any data', async () => {
  window.confirm.mockReturnValue(false);
  render(<OwnerDataExport userId="synthetic-owner" />);
  fireEvent.click(screen.getByRole('button', { name: 'Скачать мои данные (JSON)' }));
  expect(mock.build).not.toHaveBeenCalled();
  expect(mock.download).not.toHaveBeenCalled();
});

test('explicit export reports only a download request, not confirmed filesystem writing', async () => {
  render(<OwnerDataExport userId="synthetic-owner" />);
  fireEvent.click(screen.getByRole('button', { name: 'Скачать мои данные (JSON)' }));
  await waitFor(() => expect(mock.download).toHaveBeenCalledOnce());
  expect(mock.download).toHaveBeenCalledWith(
    '{\n  "format": "reflect-owner-data-export"\n}'
  );
  expect(screen.getByRole('status')).toHaveTextContent('Убедитесь, что браузер действительно сохранил файл');
});

test('failed Firestore read never initiates a partial or fabricated download', async () => {
  mock.build.mockRejectedValueOnce(new Error('Сбой доступа к Firestore'));
  render(<OwnerDataExport userId="synthetic-owner" />);
  fireEvent.click(screen.getByRole('button', { name: 'Скачать мои данные (JSON)' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сбой доступа к Firestore');
  expect(mock.download).not.toHaveBeenCalled();
});

test('busy export prevents a second concurrent download', async () => {
  let resolve;
  mock.build.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  render(<OwnerDataExport userId="synthetic-owner" />);
  fireEvent.click(screen.getByRole('button', { name: 'Скачать мои данные (JSON)' }));
  expect(screen.getByRole('button', { name: 'Проверяем и собираем записи…' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Проверяем и собираем записи…' }));
  expect(mock.build).toHaveBeenCalledTimes(1);
  resolve({ json: '{\n}', count: 0, sizeBytes: 3 });
  await waitFor(() => expect(mock.download).toHaveBeenCalledTimes(1));
});
