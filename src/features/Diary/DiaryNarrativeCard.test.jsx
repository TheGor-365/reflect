import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DiaryNarrativeCard from './DiaryNarrativeCard';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));

const date = () => ({ toDate: () => new Date('2026-11-06T19:30:00Z') });
const entry = overrides => ({
  type: 'note', sourceKind: 'note', sourceId: 'note-synthetic',
  entryIndex: 0, eventKey: 'note:note-synthetic:entry:0',
  displayAt: new Date('2026-11-06T19:30:00Z'),
  data: { title: '6 ноября 2026 г.', entries: [{ text: 'Главный исходный текст', createdAt: date() }] },
  ...overrides
});

test('content is primary; one muted date and icon-only footer are visible', () => {
  const { container } = render(<DiaryNarrativeCard entry={entry()}
    onEditNote={vi.fn()} onAppend={vi.fn()}/>);
  expect(screen.getByText('Главный исходный текст')).toBeInTheDocument();
  expect(screen.queryByText('6 ноября 2026 г.')).not.toBeInTheDocument();
  expect(container.querySelectorAll('time')).toHaveLength(1);
  expect(container.querySelectorAll('.reflect-journal-category')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Редактировать запись' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'История версий' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Дополнить заметку' })).toBeInTheDocument();
  expect(screen.queryByText('Дополнить заметку')).not.toBeInTheDocument();
});

test('pencil lets owner add a title and edit text without silently losing original', async () => {
  const onEditNote = vi.fn().mockResolvedValue({});
  render(<DiaryNarrativeCard entry={entry()} onEditNote={onEditNote} onAppend={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать запись' }));
  fireEvent.change(screen.getByRole('textbox', { name: /Заголовок/ }), {
    target: { value: 'Новая авторская тема' }
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст заметки' }), {
    target: { value: 'Новый текст с уточнением' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  await waitFor(() => expect(onEditNote).toHaveBeenCalledOnce());
  expect(onEditNote.mock.calls[0][0]).toMatchObject({
    noteId: 'note-synthetic', entryIndex: 0, expectedVersion: 1,
    title: 'Новая авторская тема', text: 'Новый текст с уточнением'
  });
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Редактирование заметки' }))
    .not.toBeInTheDocument());
});

test('rejected edit preserves unsaved form and raises visible error', async () => {
  const onEditNote = vi.fn().mockRejectedValue(new Error('Запись уже изменена в другом окне.'));
  render(<DiaryNarrativeCard entry={entry()} onEditNote={onEditNote}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать запись' }));
  const body = screen.getByRole('textbox', { name: 'Текст заметки' });
  fireEvent.change(body, { target: { value: 'Не потерять этот текст' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('другом окне');
  expect(body).toHaveValue('Не потерять этот текст');
});

test('history icon expands all immutable versions, default is closed', () => {
  const record = entry({
    data: { title: 'Первая тема', entries: [{
      text: 'Нынешний текст', createdAt: date(), displayTitle: 'Новый заголовок',
      version: 3, versions: [
        { version: 1, title: 'Исходный заголовок', text: 'Изначальный текст', savedAt: date() },
        { version: 2, title: 'Промежуточный', text: 'Вторая версия', savedAt: date() }
      ]
    }] }
  });
  render(<DiaryNarrativeCard entry={record} onEditNote={vi.fn()} />);
  expect(screen.queryByRole('region', { name: 'Версии записи' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'История версий' }));
  const section = screen.getByRole('region', { name: 'Версии записи' });
  expect(section).toHaveTextContent('Версия 1');
  expect(section).toHaveTextContent('Изначальный текст');
  expect(section).toHaveTextContent('Версия 2');
  expect(section).toHaveTextContent('Вторая версия');
  expect(section).toHaveTextContent('Версия 3 · текущая');
  expect(section).toHaveTextContent('Нынешний текст');
});
