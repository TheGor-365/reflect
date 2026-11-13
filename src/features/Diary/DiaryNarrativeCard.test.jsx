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


test('session card reads as a reflection with optional source details', () => {
  const onOpenSession = vi.fn();
  const onOpenJourney = vi.fn();
  const session = entry({
    type: 'session', sourceKind: 'session', sourceId: 's1',
    displayAt: new Date('2026-11-10T14:24:00Z'),
    data: {
      title: 'Сеанс от 10.11.2026, 14:26:14',
      chatHistory: [
        { role: 'user', content: 'Первый вопрос' },
        { role: 'assistant', content: 'Рефлексия от Reflect' }
      ]
    }
  });
  const { container } = render(<div className="reflect-app" data-theme="dark">
    <DiaryNarrativeCard entry={session} onOpenSession={onOpenSession}
      onOpenJourney={onOpenJourney}/>
  </div>);
  expect(screen.getByRole('heading', { name: 'Первый вопрос' })).toBeInTheDocument();
  expect(screen.queryByText('Сеанс от 10.11.2026, 14:26:14')).not.toBeInTheDocument();
  expect(container.querySelector('.reflect-journal-ai-thought')).toHaveTextContent('Рефлексия от Reflect');
  expect(screen.getByRole('button', { name: 'Исходный вопрос' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Исходный вопрос' }));
  expect(screen.getAllByText('Первый вопрос').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Источник и история' }));
  fireEvent.click(screen.getByRole('button', { name: 'Открыть беседу' }));
  fireEvent.click(screen.getByRole('button', { name: 'Путь сеанса' }));
  expect(onOpenSession).toHaveBeenCalledExactlyOnceWith('s1');
  expect(onOpenJourney).toHaveBeenCalledExactlyOnceWith('s1');
  expect(container.querySelector('.bg-blue-50, .bg-stone-50, .text-stone-800')).not.toBeInTheDocument();
  expect(container.querySelector('.reflect-journal-entry-footer time')).toBeInTheDocument();
  expect(container.querySelector('.reflect-journal-kind-icon svg')).toBeInTheDocument();
});

test('manual title edit commits only title request and preserves draft on error', async () => {
  const session = entry({ type: 'session', sourceKind: 'session', sourceId: 's1',
    data: { title: 'Сеанс от 10.11.2026, 14:26:14', chatHistory: [
      { role: 'assistant', content: 'Текст AI' }
    ] }
  });
  const onRenameSession = vi.fn().mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(undefined);
  render(<DiaryNarrativeCard entry={session} onRenameSession={onRenameSession}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Изменить заголовок сеанса' }));
  const input = screen.getByRole('textbox', { name: 'Название размышления' });
  fireEvent.change(input, { target: { value: 'Точка роста сегодня' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить заголовок');
  expect(input).toHaveValue('Точка роста сегодня');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(onRenameSession).toHaveBeenCalledTimes(2));
  expect(onRenameSession).toHaveBeenLastCalledWith('s1', 'Точка роста сегодня');
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Название размышления' }))
    .not.toBeInTheDocument());
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

test('D1: stored goal with three steps renders its details instead of empty description panel', () => {
  const goal = entry({
    type: 'goal', sourceKind: 'goal', sourceId: 'qa-d1',
    data: {
      id: 'qa-d1', text: 'QA-D1', type: 'checklist', status: 'active',
      purpose: '', completed: false, subItems: [
        { id: 'step-1', text: '1', completed: false },
        { id: 'step-2', text: '2', completed: false },
        { id: 'step-3', text: '3', completed: false }
      ]
    }
  });
  render(<div className="reflect-app" data-theme="dark">
    <DiaryNarrativeCard entry={goal}/>
  </div>);
  expect(screen.getByRole('heading', { name: 'Цель: QA-D1' })).toBeInTheDocument();
  const details = screen.getByRole('region', { name: 'Подробности цели' });
  expect(details).toHaveTextContent('Статус: в работе');
  expect(details).toHaveTextContent('Срок: без срока');
  expect(details).toHaveTextContent('Описание цели не добавлено.');
  expect(details).toHaveTextContent('0 из 3 выполнено');
  const steps = screen.getByLabelText('Сохранённые шаги цели');
  expect(steps.querySelectorAll('li')).toHaveLength(3);
  expect([...steps.querySelectorAll('li')].map(node=>node.textContent)).toEqual(['1','2','3']);
  expect(screen.queryByRole('button', { name: 'Показать описание цели' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('D1: checked steps, paused status, deadline, purpose and other metadata are factual', () => {
  const goal = entry({
    type: 'goal', sourceKind: 'goal', sourceId: 'qa-d2',
    data: {
      text: 'Результат теста', type: 'checklist',
      purpose: 'Проверить Firestore после перезагрузки',
      dueDay: '2026-11-25', status: 'paused', completed: false,
      subItems: [
        { id: 'one', text: 'Сохранено', completed: true },
        { id: 'two', text: 'Следующий шаг', completed: false }
      ]
    }
  });
  render(<DiaryNarrativeCard entry={goal}/>);
  const details = screen.getByRole('region', { name: 'Подробности цели' });
  expect(details).toHaveTextContent('Статус: на паузе');
  expect(details).toHaveTextContent('Срок: 25 ноября 2026');
  expect(details).toHaveTextContent('Проверить Firestore после перезагрузки');
  expect(details).toHaveTextContent('1 из 2 выполнено');
  expect(details.querySelectorAll('.is-complete')).toHaveLength(1);
  expect(screen.queryByText('Описание цели не добавлено.')).not.toBeInTheDocument();
});

test('D1: completed legacy goal, reflection and damaged optional steps never invent progress', () => {
  const goal = entry({
    type: 'goal', sourceKind: 'goal', sourceId: 'legacy-goal',
    data: {
      text: 'Архивная цель', completed: true, status: 'completed',
      type: 'checklist', subItems: [{ text: null, completed: false }]
    }
  });
  const view=render(<DiaryNarrativeCard entry={goal}/>);
  expect(screen.getByRole('region', { name: 'Подробности цели' }))
    .toHaveTextContent('Статус: завершена');
  expect(screen.getByText('Текст шага недоступен')).toBeInTheDocument();
  expect(screen.getByText('0 из 1 выполнено')).toBeInTheDocument();
  view.rerender(<DiaryNarrativeCard entry={entry({
    type: 'goal', sourceKind: 'goal', sourceId: 'reflection',
    data: { text: 'Цель для размышлений', type: 'reflection', reflections: [] }
  })}/>);
  expect(screen.queryByText('Шаги пока не добавлены.')).not.toBeInTheDocument();
});
