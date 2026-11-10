import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SessionLibrary from './SessionLibrary';

const sessions = [
  {
    id: 'session-b', title: 'Спокойствие и границы',
    createdAt: { toDate: () => new Date('2026-11-10T12:00:00Z') },
    chatHistory: [
      { role: 'user', content: 'Как не терять спокойствие?' },
      { role: 'assistant', content: 'Назовите одну доступную границу.' }
    ]
  },
  {
    id: 'session-a', title: 'Сеанс от 09.11.2026, 23:44:00',
    createdAt: { toDate: () => new Date('2026-11-09T21:44:00Z') },
    chatHistory: [{ role: 'user', content: 'План на неделю' }]
  }
];

test('saved sessions are visible, readable and source-specific with no synthetic returns', () => {
  const select = vi.fn(), journey = vi.fn(), create = vi.fn();
  const { container } = render(<SessionLibrary sessions={sessions}
    onSelectSession={select} onViewJourney={journey} onNewSession={create}/>);
  const cards = container.querySelectorAll('.reflect-session-library-card');
  expect(cards).toHaveLength(2);
  expect(within(cards[0]).getByRole('heading', { name: 'Спокойствие и границы' }))
    .toBeInTheDocument();
  expect(within(cards[0]).getByText('Как не терять спокойствие?')).toBeInTheDocument();
  expect(within(cards[0]).getByText('Назовите одну доступную границу.'))
    .toBeInTheDocument();
  expect(within(cards[1]).getByText('Размышление с Reflect')).toBeInTheDocument();
  expect(within(cards[1]).getByText('Без ответа Reflect')).toBeInTheDocument();
  expect(container).not.toHaveTextContent(/возвращени[йя]|прогресс в процентах/i);
  fireEvent.click(within(cards[0]).getByRole('button', { name: 'Открыть беседу' }));
  expect(select).toHaveBeenCalledExactlyOnceWith('session-b');
  fireEvent.click(within(cards[0]).getByRole('button', { name: 'Хронология: Спокойствие и границы' }));
  expect(journey).toHaveBeenCalledExactlyOnceWith('session-b');
  expect(create).not.toHaveBeenCalled();
});

test('local search and answer filter narrow results without network or AI calls', () => {
  const { container } = render(<SessionLibrary sessions={sessions}
    onSelectSession={vi.fn()} onNewSession={vi.fn()}/>);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по сохранённым сеансам' }),
    { target: { value: 'неделю' } });
  expect(container.querySelectorAll('.reflect-session-library-card')).toHaveLength(1);
  expect(screen.getByText('Размышление с Reflect')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'С ответом Reflect' }));
  expect(screen.getByText(/Не найдено совпадений/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Все' }));
  expect(container.querySelectorAll('.reflect-session-library-card')).toHaveLength(1);
});

test('empty library offers a start action instead of a full-screen dead end', () => {
  const create = vi.fn();
  render(<SessionLibrary sessions={[]} onNewSession={create} />);
  expect(screen.getByRole('heading', { name: 'Здесь появится ваша история' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Начать новый сеанс/i }));
  expect(create).toHaveBeenCalledOnce();
});

test('existing active session can be reopened without creating a new thread', () => {
  const back = vi.fn(), select = vi.fn();
  render(<SessionLibrary sessions={[sessions[0]]} activeSessionId="session-b"
    onBackToConversation={back} onSelectSession={select} onNewSession={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'К беседе' }));
  expect(back).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться к разговору' }));
  expect(select).toHaveBeenCalledWith('session-b');
});
