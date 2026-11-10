import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import AISettings from './AISettings';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, path) => ({ path })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ server: 'timestamp' }))
}));

beforeEach(() => {
  vi.clearAllMocks();
  getDoc.mockResolvedValue({ exists: () => false });
  setDoc.mockResolvedValue();
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
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({
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

test('read denial locks form rather than overriding existing settings', async () => {
  getDoc.mockRejectedValue({ code: 'permission-denied' });
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
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({
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
