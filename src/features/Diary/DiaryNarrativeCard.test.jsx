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


test('session details keep original dialogue readable without legacy light-only blocks', () => {
  const session = entry({
    type: 'session', sourceKind: 'session', sourceId: 's1',
    displayAt: new Date('2026-11-10T14:24:00Z'),
    data: {
      title: 'Почему полезно записывать мысли',
      chatHistory: [
        { role: 'user', content: 'Первый вопрос' },
        { role: 'assistant', content: 'Рефлексия от Reflect' }
      ]
    }
  });
  const { container } = render(<div className="reflect-app" data-theme="dark">
    <DiaryNarrativeCard entry={session}/>
  </div>);
  expect(container.querySelector('.reflect-journal-content-title')).toHaveTextContent(
    'Почему полезно записывать мысли'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Показать детали сеанса' }));
  expect(screen.getByText('Первый вопрос')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Показать ответ ассистента' }));
  expect(screen.getByText('Рефлексия от Reflect')).toBeInTheDocument();
  expect(container.querySelector('.bg-blue-50, .bg-stone-50, .text-stone-800')).not.toBeInTheDocument();
  expect(container.querySelector('.reflect-journal-entry-footer time')).toBeInTheDocument();
});

test('mood and goal cards reuse Midnight Aurora semantic title and muted date', () => {
  const goal = entry({ type: 'goal', sourceKind: 'goal', sourceId: 'g1',
    data: { text: 'Сформулировать цель', purpose: 'Важная причина', completed: false } });
  const mood = entry({ type: 'mood', sourceKind: 'mood', sourceId: 'm1',
    data: { mood: 'content', intensity: 3, comment: 'Спокойно' } });
  const view = render(<div className="reflect-app" data-theme="light">
    <DiaryNarrativeCard entry={goal}/><DiaryNarrativeCard entry={mood}/>
  </div>);
  expect(screen.getByText('Цель: Сформулировать цель')).toHaveClass('reflect-journal-content-title');
  expect(screen.getByText('Запись о настроении')).toHaveClass('reflect-journal-content-title');
  expect(view.container.querySelectorAll('.reflect-journal-entry-footer time')).toHaveLength(2);
  expect(view.container.querySelector('.text-stone-500, .text-stone-800')).not.toBeInTheDocument();
});
