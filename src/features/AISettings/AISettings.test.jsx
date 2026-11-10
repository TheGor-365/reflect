import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import AISettings from './AISettings';
import { AI_SETTINGS_DEFAULTS } from './aiSettingsModel';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, path) => ({ path })),
  getDoc: vi.fn(),
  getDocFromServer: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ server: 'timestamp' }))
}));

beforeEach(() => {
  vi.clearAllMocks();
  getDoc.mockResolvedValue({ exists: () => false });
  setDoc.mockResolvedValue();
  getDocFromServer.mockImplementation(async () => {
    const written = setDoc.mock.lastCall?.[1];
    return written
      ? { exists: () => true, data: () => written }
      : { exists: () => false };
  });
});

test('defaults closed: never creates a doc or recommendation without an explicit save', async () => {
  render(<AISettings userId="synthetic-owner"/>);
  expect(await screen.findByRole('checkbox', { name: /Предлагать рекомендации/ }))
    .not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Автосохранение рекомендаций/ }))
    .toBeDisabled();
  expect(screen.getByText(/Сохранение ≠ разрешение/)).toBeInTheDocument();
  expect(doc).toHaveBeenCalledWith(
    expect.anything(), 'artifacts/reflect-8fdc8/users/synthetic-owner/aiSettings/preferences'
  );
  expect(setDoc).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Сохранить настройки' })).toBeDisabled();
});

test('preferences write only to current owner, not to profile/diary or AI provider', async () => {
  render(<AISettings userId="synthetic-owner"/>);
  const recommendations = await screen.findByRole('checkbox',
    { name: /Предлагать рекомендации/ });
  fireEvent.click(recommendations);
  expect(recommendations).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox',
    { name: /Автосохранение рекомендаций/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
  expect(setDoc.mock.calls[0][0].path).toBe(
    'artifacts/reflect-8fdc8/users/synthetic-owner/aiSettings/preferences');
  expect(setDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
    schemaVersion: 1, recommendationsEnabled: true,
    autoSaveRecommendations: true, updatedAt: { server: 'timestamp' }
  }));
  expect(serverTimestamp).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/Подключение к AI backend ещё не выполнено/))
    .toBeInTheDocument();
});

test('previous saved preferences are loaded without changing Firestore', async () => {
  getDocFromServer.mockResolvedValue({ exists: () => true, data: () => ({
    schemaVersion: 1, responseDepth: 'deep', responseTone: 'supportive',
    askClarifyingQuestions: false, recommendationsEnabled: false,
    autoSaveRecommendations: false, recommendationFrequency: 'rare',
    showContextIndicator: true, updatedAt: 'server-metadata'
  }) });
  render(<AISettings userId="existing-owner"/>);
  expect(await screen.findByRole('combobox', { name: /Глубина ответа/ }))
    .toHaveValue('deep');
  expect(screen.getByRole('checkbox', { name: /Индикатор достаточности контекста/ }))
    .toBeChecked();
  expect(setDoc).not.toHaveBeenCalled();
});

test('initial load requires a server response and never silently trusts cached settings', async () => {
  // A locally cached "balanced" preference is not evidence of server state.
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({
    ...AI_SETTINGS_DEFAULTS, responseDepth: 'balanced'
  }) });
  getDocFromServer.mockRejectedValueOnce({ code: 'unavailable' });
  render(<AISettings userId="synthetic-owner"/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Код ошибки: unavailable');
  expect(screen.queryByRole('combobox', { name: /Глубина ответа/ }))
    .not.toBeInTheDocument();
  expect(getDoc).not.toHaveBeenCalled();
  expect(setDoc).not.toHaveBeenCalled();
});

test('read denial locks form rather than overriding existing settings', async () => {
  getDocFromServer.mockRejectedValue({ code: 'permission-denied' });
  render(<AISettings userId="synthetic-owner"/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось прочитать');
  expect(screen.queryByRole('button', { name: 'Сохранить настройки' }))
    .not.toBeInTheDocument();
  expect(setDoc).not.toHaveBeenCalled();
});

test('write failure keeps changed values visible and allows retry', async () => {
  setDoc.mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(undefined);
  render(<AISettings userId="synthetic-owner"/>);
  const toggle = await screen.findByRole('checkbox', { name: /Предлагать рекомендации/ });
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сохранение не подтверждено');
  expect(toggle).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  expect(await screen.findByText(/Подключение к AI backend ещё не выполнено/))
    .toBeInTheDocument();
  expect(setDoc).toHaveBeenCalledTimes(2);
});

test('invalid saved schema fails closed and is not overwritten without action', async () => {
  getDocFromServer.mockResolvedValue({ exists: () => true, data: () => ({
    schemaVersion: 10, recommendationsEnabled: true, autoSaveRecommendations: true
  }) });
  render(<AISettings userId="synthetic-owner"/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('неизвестный формат');
  expect(screen.getByRole('checkbox', { name: /Предлагать рекомендации/ }))
    .not.toBeChecked();
  expect(setDoc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
  expect(setDoc.mock.calls[0][1].recommendationsEnabled).toBe(false);
});

test('explicit save survives remount and reloads deep preference from Firestore', async () => {
  const stored = new Map();
  const read = async reference => ({
    exists: () => stored.has(reference.path),
    data: () => stored.get(reference.path)
  });
  getDocFromServer.mockImplementation(read);
  setDoc.mockImplementation(async (reference, data) => { stored.set(reference.path, data); });

  const view = render(<AISettings userId="owner-reload"/>);
  fireEvent.change(await screen.findByRole('combobox', { name: /Глубина ответа/ }), {
    target: { value: 'deep' }
  });
  expect(screen.getByText(/Есть несохранённые изменения/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  expect(await screen.findByText(/Настройки сохранены и подтверждены сервером/))
    .toBeInTheDocument();
  expect(getDocFromServer).toHaveBeenCalledTimes(1);
  view.unmount();

  render(<AISettings userId="owner-reload"/>);
  expect(await screen.findByRole('combobox', { name: /Глубина ответа/ }))
    .toHaveValue('deep');
  expect(setDoc).toHaveBeenCalledTimes(1);
});

test('switching accounts never presents another owner\'s saved depth', async () => {
  const stored = new Map();
  const read = async reference => ({
    exists: () => stored.has(reference.path),
    data: () => stored.get(reference.path)
  });
  getDocFromServer.mockImplementation(read);
  setDoc.mockImplementation(async (reference, data) => { stored.set(reference.path, data); });

  const first = render(<AISettings userId="owner-A"/>);
  fireEvent.change(await screen.findByRole('combobox', { name: /Глубина ответа/ }), {
    target: { value: 'deep' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  expect(await screen.findByText(/подтверждены сервером/)).toBeInTheDocument();
  first.unmount();

  const second = render(<AISettings userId="owner-B"/>);
  expect(await screen.findByRole('combobox', { name: /Глубина ответа/ }))
    .toHaveValue('balanced');
  second.unmount();

  render(<AISettings userId="owner-A"/>);
  expect(await screen.findByRole('combobox', { name: /Глубина ответа/ }))
    .toHaveValue('deep');
});

test('server mismatch never shows a false positive save confirmation', async () => {
  getDocFromServer.mockResolvedValue({ exists: () => false });
  render(<AISettings userId="synthetic-owner"/>);
  fireEvent.change(await screen.findByRole('combobox', { name: /Глубина ответа/ }), {
    target: { value: 'deep' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('readback-mismatch');
  expect(screen.getByRole('combobox', { name: /Глубина ответа/ })).toHaveValue('deep');
  expect(screen.queryByText(/Настройки сохранены и подтверждены сервером/))
    .not.toBeInTheDocument();
});

test('read denial shows a safe diagnostic code without exposing document paths', async () => {
  getDocFromServer.mockRejectedValueOnce({ code: 'permission-denied' });
  render(<AISettings userId="synthetic-owner"/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Код ошибки: permission-denied');
  expect(screen.getByRole('alert')).not.toHaveTextContent('artifacts/');
  expect(setDoc).not.toHaveBeenCalled();
});

test('unsaved changes warn on reload and are not misrepresented as persisted', async () => {
  const view = render(<AISettings userId="synthetic-owner"/>);
  fireEvent.change(await screen.findByRole('combobox', { name: /Глубина ответа/ }), {
    target: { value: 'deep' }
  });
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(setDoc).not.toHaveBeenCalled();
  view.unmount();

  render(<AISettings userId="synthetic-owner"/>);
  expect(await screen.findByRole('combobox', { name: /Глубина ответа/ }))
    .toHaveValue('balanced');
});
