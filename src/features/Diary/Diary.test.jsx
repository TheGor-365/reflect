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
vi.mock('./DiaryNarrativeCard', () => ({
  default: ({ entry }) => <div data-testid="diary-timeline-event">{entry.eventKey}</div>
}));

const renderDiary = () => render(
  <Diary userId="synthetic-owner" sessions={[]} goals={[]} moods={[]} diaryNotes={[]}
    isLoading={false} onAppend={vi.fn()} />
);
const noteInput = () => screen.getByPlaceholderText('Что у вас на уме?');

beforeEach(() => {
  vi.clearAllMocks();
  setDoc.mockReset().mockResolvedValue(undefined);
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
  expect(setDoc.mock.calls[0][1].title).toBe(''); // no invented date heading
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

test('second new note after confirmation gets a different Firestore ID', async () => {
  renderDiary();
  fireEvent.change(noteInput(), { target: { value: 'Первая синтетическая заметка' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));
  await screen.findByText('Сохранено');
  const firstId = setDoc.mock.calls[0][0].id;

  fireEvent.change(noteInput(), { target: { value: 'Вторая синтетическая заметка' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));
  await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(2));
  expect(setDoc.mock.calls[1][0].id).not.toBe(firstId);
});

test('pending promise disables repeat submission rather than creating duplicate IDs', async () => {
  let resolveWrite;
  setDoc.mockImplementationOnce(() => new Promise(resolve => { resolveWrite = resolve; }));
  renderDiary();
  fireEvent.change(noteInput(), { target: { value: 'Черновик без повторной записи' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Сохраняется…');
  expect(screen.getByRole('button', { name: 'Сохранить заметку' })).toBeDisabled();
  fireEvent.submit(noteInput().closest('form'));
  expect(setDoc).toHaveBeenCalledTimes(1);
  expect(doc).toHaveBeenCalledTimes(1);
  await act(async () => resolveWrite());
  expect(await screen.findByText('Сохранено')).toBeInTheDocument();
});

test('mood error preserves rating and comment; retry keeps one document', async () => {
  setDoc.mockRejectedValueOnce({ code: 'permission-denied' }).mockResolvedValueOnce(undefined);
  renderDiary();
  fireEvent.click(screen.getByRole('button', { name: 'Оценить настроение' }));
  fireEvent.click(screen.getByRole('button', { name: 'Настроение: Радость' }));
  fireEvent.click(screen.getByRole('button', { name: 'Интенсивность 4 из 5' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Комментарий к настроению' }), {
    target: { value: 'Спокойный тестовый день' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настроение' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сохранение не подтверждено');
  expect(screen.getByRole('textbox', { name: 'Комментарий к настроению' }))
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


test('in-memory timeline filters events without sending a search request', () => {
  const createdAt = { toDate: () => new Date('2026-11-05T09:00:00Z') };
  render(
    <Diary userId="synthetic-owner" sessions={[]} goals={[]}
      moods={[{ id: 'mood-1', comment: 'Нейтрально', createdAt }]}
      diaryNotes={[{ id: 'note-1', title: 'Личные мысли',
        entries: [{ text: 'Утреннее размышление', createdAt }] }]}
      isLoading={false} onAppend={vi.fn()} />
  );
  expect(screen.getAllByTestId('diary-timeline-event')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Поиск и фильтры' }));
  fireEvent.click(screen.getByRole('button', { name: 'Заметки' }));
  expect(screen.getAllByTestId('diary-timeline-event')).toHaveLength(1);
  expect(screen.getByTestId('diary-timeline-event')).toHaveTextContent('note:note-1:entry:0');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по дневнику' }), {
    target: { value: 'не найдено' }
  });
  expect(screen.queryByTestId('diary-timeline-event')).not.toBeInTheDocument();
  expect(screen.getByText('По выбранным фильтрам ничего не найдено.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
  expect(screen.getAllByTestId('diary-timeline-event')).toHaveLength(2);
});

test('appended note text creates two timeline events on distinct dates', () => {
  const ts = value => ({ toDate: () => new Date(value) });
  render(
    <Diary userId="synthetic-owner" sessions={[]} goals={[]} moods={[]}
      diaryNotes={[{ id: 'note-long', title: 'Продолжение',
        entries: [
          { text: 'Первая часть', createdAt: ts('2026-11-01T08:00:00Z') },
          { text: 'Продолжение позже', createdAt: ts('2026-11-05T08:00:00Z') }
        ] }]}
      isLoading={false} onAppend={vi.fn()} />
  );
  expect(screen.getAllByTestId('diary-timeline-event')).toHaveLength(2);
  expect(screen.getAllByTestId('diary-timeline-event')[0])
    .toHaveTextContent('note:note-long:entry:1');
  expect(screen.getAllByTestId('diary-timeline-event')[1])
    .toHaveTextContent('note:note-long:entry:0');
});


test('journal opens with content first and tools collapsed', () => {
  renderDiary();
  expect(screen.getByRole('textbox', { name: 'Новая запись' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Поиск и фильтры' }))
    .toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('searchbox', { name: 'Поиск по дневнику' }))
    .not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Обзор настроения' }))
    .toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Настроение: Радость' }))
    .not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Добавьте комментарий (необязательно)...'))
    .not.toBeInTheDocument();
  expect(screen.getByText('Защита черновика').closest('details'))
    .not.toHaveAttribute('open');
});

test('confirmed new note appears immediately without reload and does not duplicate after snapshot', async () => {
  const props = {
    userId: 'synthetic-owner', sessions: [], goals: [], moods: [],
    diaryNotes: [], isLoading: false, onAppend: vi.fn()
  };
  const view = render(<Diary {...props}/>);
  fireEvent.change(noteInput(), { target: { value: 'Immediate synthetic note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));
  expect(await screen.findByText('Сохранено')).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByTestId('diary-timeline-event')).toHaveLength(1));
  expect(screen.getByTestId('diary-timeline-event').parentElement)
    .toHaveClass('reflect-diary-entering');
  const confirmedId = setDoc.mock.calls[0][0].id;
  expect(screen.getByTestId('diary-timeline-event'))
    .toHaveTextContent('note:' + confirmedId + ':entry:0');

  // Real Firestore subscription sends exactly this ID. Never show twins.
  const stored = {
    id: setDoc.mock.calls[0][0].id,
    title: 'Synthetic title',
    entries: [{ text: 'Immediate synthetic note',
      createdAt: { toDate: () => new Date('2026-11-06T12:00:00Z') } }],
    createdAt: { toDate: () => new Date('2026-11-06T12:00:00Z') }
  };
  view.rerender(<Diary {...props} diaryNotes={[stored]}/>);
  expect(screen.getAllByTestId('diary-timeline-event')).toHaveLength(1);
  // If the authoritative source later deletes the note it must stay deleted.
  view.rerender(<Diary {...props} diaryNotes={[]}/>);
  await waitFor(() => expect(screen.queryByTestId('diary-timeline-event'))
    .not.toBeInTheDocument());
});

test('mood chooser is compact and records a confirmed mood without page reload', async () => {
  renderDiary();
  fireEvent.click(screen.getByRole('button', { name: 'Оценить настроение' }));
  expect(screen.getAllByRole('button', { name: /Настроение:/ })).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Настроение: Радость' }));
  fireEvent.click(screen.getByRole('button', { name: 'Интенсивность 4 из 5' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настроение' }));
  expect(await screen.findByText('Сохранено')).toBeInTheDocument();
  expect(screen.getAllByTestId('diary-timeline-event')).toHaveLength(1);
  const confirmedId = setDoc.mock.calls[0][0].id;
  expect(screen.getByTestId('diary-timeline-event'))
    .toHaveTextContent('mood:' + confirmedId);
  expect(screen.queryByRole('button', { name: 'Настроение: Радость' }))
    .not.toBeInTheDocument();
});

test('user must explicitly reveal the title and long composer grows as typed', () => {
  renderDiary();
  expect(screen.queryByText('Заголовок (необязательно)')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Добавить заголовок' }));
  expect(screen.getByText('Заголовок (необязательно)')).toBeInTheDocument();
  fireEvent.change(noteInput(), { target: { value: 'Sentence\\n'.repeat(12) } });
  expect(noteInput()).toHaveValue('Sentence\\n'.repeat(12));
});


test('journal renders one month heading and dated rails, with undated bucket', () => {
  const ts = iso => ({ toDate: () => new Date(iso) });
  const { container } = render(
    <Diary userId="synthetic-owner" sessions={[]} goals={[]} isLoading={false}
      moods={[{ id: 'oct', mood: 'happy', createdAt: ts('2026-10-30T12:00:00Z') }]}
      diaryNotes={[
        { id: 'nov-5', entries: [{ text: 'Ноябрь один', createdAt: ts('2026-11-05T12:00:00Z') }] },
        { id: 'nov-6', entries: [{ text: 'Ноябрь два', createdAt: ts('2026-11-06T12:00:00Z') }] },
        { id: 'undated', entries: [{ text: 'Пока без времени' }] }
      ]} onAppend={vi.fn()}/>
  );
  const headings = [...container.querySelectorAll('.reflect-diary-month-heading')];
  expect(headings).toHaveLength(2);
  expect(headings[0]).toHaveTextContent('Ноябрь 2026');
  expect(headings[1]).toHaveTextContent('Октябрь 2026');
  expect(container.querySelectorAll('.reflect-diary-day-heading')).toHaveLength(4);
  expect(container.querySelectorAll('.reflect-diary-event-marker')).toHaveLength(4);
  expect(screen.getAllByTestId('diary-timeline-event')).toHaveLength(4);
  expect(screen.getByRole('region', { name: 'Лента записей', hidden: true })).toBeInTheDocument();
});

test('filters are inert until opened and preserve state through animated closing', () => {
  const { container } = renderDiary();
  const trigger = screen.getByRole('button', { name: 'Поиск и фильтры' });
  const region = container.querySelector('#reflect-diary-filters');
  expect(region).toHaveAttribute('aria-hidden', 'true');
  expect(region).toHaveAttribute('inert');
  fireEvent.click(trigger);
  expect(region).toHaveAttribute('aria-hidden', 'false');
  expect(region).not.toHaveAttribute('inert');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по дневнику' }), {
    target: { value: 'сохранённый поиск' }
  });
  fireEvent.click(trigger);
  expect(region).toHaveAttribute('aria-hidden', 'true');
  expect(region).toHaveAttribute('inert');
  expect(screen.queryByRole('searchbox', { name: 'Поиск по дневнику' })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('searchbox', { name: 'Поиск по дневнику' }))
    .toHaveValue('сохранённый поиск');
});
