import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { collection, doc, setDoc } from 'firebase/firestore';
import Diary from './Diary';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => {
  let sequence = 0;
  return {
    collection: vi.fn((_db, path) => ({ path })),
    doc: vi.fn((coll) => ({ path: coll.path, id: `draft-id-${++sequence}` })),
    setDoc: vi.fn(),
    serverTimestamp: vi.fn(() => ({ kind: 'serverTime' })),
    Timestamp: { now: vi.fn(() => ({ kind: 'clientTime' })) }
  };
});
vi.mock('./DiaryNarrativeCard', () => ({ default: () => null }));

const renderDiary = () => render(
  <Diary userId="synthetic-owner" sessions={[]} goals={[]} moods={[]} diaryNotes={[]}
    isLoading={false} onAppend={vi.fn()} />
);
const noteInput = () => screen.getByPlaceholderText('Что нового? Добавьте заметку...');

beforeEach(() => {
  vi.clearAllMocks();
  setDoc.mockResolvedValue(undefined);
});

test('successful new note uses one Firestore ID and shows confirmed save status', async () => {
  renderDiary();
  fireEvent.change(noteInput(), { target: { value: 'Длинная синтетическая запись\nВторая строка' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));
  expect(await screen.findByText('Сохранено')).toBeInTheDocument();
  expect(noteInput()).toHaveValue('');
  expect(collection).toHaveBeenCalledWith(expect.anything(), 'artifacts/reflect-8fdc8/users/synthetic-owner/diaryNotes');
  expect(doc).toHaveBeenCalledTimes(1);
  expect(setDoc).toHaveBeenCalledTimes(1);
  expect(setDoc.mock.calls[0][1].entries[0].text).toBe('Длинная синтетическая запись\nВторая строка');
});

test('ambiguous write error retains text and retry reuses original document ID', async () => {
  setDoc.mockRejectedValueOnce({ code: 'unavailable' }).mockResolvedValueOnce(undefined);
  renderDiary();
  fireEvent.change(noteInput(), { target: { value: 'Важная синтетическая запись' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сохранение не подтверждено');
  expect(noteInput()).toHaveValue('Важная синтетическая запись');
  const firstRef = setDoc.mock.calls[0][0];
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));
  await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(2));
  expect(setDoc.mock.calls[1][0]).toBe(firstRef);
  expect(doc).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Сохранено')).toBeInTheDocument();
  expect(noteInput()).toHaveValue('');
});

test('pending promise disables repeat submission rather than creating duplicate IDs', async () => {
  let resolveWrite;
  setDoc.mockImplementationOnce(() => new Promise(resolve => { resolveWrite = resolve; }));
  renderDiary();
  fireEvent.change(noteInput(), { target: { value: 'Черновик без повторной записи' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));
  expect(await screen.findByText('Сохраняется…')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Сохраняется…' })).toBeDisabled();
  fireEvent.submit(noteInput().closest('form'));
  expect(setDoc).toHaveBeenCalledTimes(1);
  expect(doc).toHaveBeenCalledTimes(1);
  await act(async () => resolveWrite());
  expect(await screen.findByText('Сохранено')).toBeInTheDocument();
});

test('mood error preserves rating and comment; retry keeps one document', async () => {
  setDoc.mockRejectedValueOnce({ code: 'permission-denied' }).mockResolvedValueOnce(undefined);
  renderDiary();
  fireEvent.click(screen.getByRole('button', { name: 'Настроение: Радость' }));
  fireEvent.click(screen.getByRole('button', { name: 'Интенсивность 4 из 5' }));
  fireEvent.change(screen.getByPlaceholderText('Добавьте комментарий (необязательно)...'), {
    target: { value: 'Спокойный тестовый день' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настроение' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сохранение не подтверждено');
  expect(screen.getByPlaceholderText('Добавьте комментарий (необязательно)...'))
    .toHaveValue('Спокойный тестовый день');
  expect(screen.getByRole('button', { name: 'Интенсивность 4 из 5' }))
    .toHaveAttribute('aria-pressed', 'true');
  const initialRef = setDoc.mock.calls[0][0];
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настроение' }));
  expect(await screen.findByText('Сохранено')).toBeInTheDocument();
  expect(setDoc.mock.calls[1][0]).toBe(initialRef);
  expect(doc).toHaveBeenCalledTimes(1);
  expect(setDoc.mock.calls[1][1]).toEqual(expect.objectContaining({
    mood: 'happy', intensity: 4, comment: 'Спокойный тестовый день'
  }));
});
