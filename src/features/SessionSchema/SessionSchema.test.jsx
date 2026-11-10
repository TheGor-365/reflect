import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SessionSchema from './SessionSchema';

const stamp = iso => ({
  toDate: () => new Date(iso),
  toMillis: () => Date.parse(iso)
});

test('empty state stays readable and does not create phantom events', () => {
  const { container } = render(<div className="reflect-app" data-theme="dark">
    <SessionSchema sessions={[]} goals={[]} />
  </div>);
  expect(screen.getByText(/Нет сохранённых сеансов/)).toBeInTheDocument();
  expect(container.querySelector('.bg-white')).not.toBeInTheDocument();
  expect(container.querySelector('.reflect-session-schema-empty')).toBeInTheDocument();
});

test('mixed timestamp formats sort safely and undated historic messages remain visible', () => {
  const session = {
    id: 's1', title: 'Понять свою следующую цель',
    chatHistory: [
      { id: 'late', role: 'assistant', content: 'Ответ в конце', timestamp: stamp('2026-11-10T14:20:00Z') },
      { id: 'early', role: 'user', content: 'Вопрос в начале', timestamp: new Date('2026-11-10T14:10:00Z') },
      { id: 'missing', role: 'user', content: 'Старый вопрос без даты' },
      { id: 'invalid', role: 'assistant', content: 'Ответ с ошибочной датой',
        timestamp: { toDate: () => { throw new Error('legacy corrupt timestamp'); } } }
    ]
  };
  const goals = [{ id: 'g1', sessionId: 's1', text: 'Проверить цель',
    createdAt: '2026-11-10T14:15:00Z' }];
  const onViewContent = vi.fn();
  const { container } = render(<div className="reflect-app" data-theme="dark">
    <SessionSchema sessions={[session]} goals={goals} onViewContent={onViewContent} />
  </div>);
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(5);
  expect(rows.map(row => row.textContent)).toEqual([
    expect.stringContaining('Вопрос в начале'),
    expect.stringContaining('Проверить цель'),
    expect.stringContaining('Ответ в конце'),
    expect.stringContaining('Старый вопрос без даты'),
    expect.stringContaining('Ответ с ошибочной датой')
  ]);
  expect(rows[3]).toHaveTextContent('Дата не указана');
  expect(rows[4]).toHaveTextContent('Дата не указана');
  expect(screen.getByRole('region', { name: 'Прокручиваемая хронология сеанса' }))
    .toHaveAttribute('tabindex', '0');
  expect(container.querySelector('.bg-white, .text-stone-800, .bg-stone-50')).not.toBeInTheDocument();
  expect(container.querySelector('.reflect-session-event-panel')).toBeInTheDocument();
});

test('long content opens full text by action and preserves original text', () => {
  const longText = 'Важное размышление '.repeat(12);
  const onViewContent = vi.fn();
  render(<SessionSchema sessions={[{
    id: 's1', title: 'Длинный сеанс',
    chatHistory: [{ role: 'assistant', content: longText, timestamp: stamp('2026-11-10T15:00:00Z') }]
  }]} goals={[]} onViewContent={onViewContent} />);
  fireEvent.click(screen.getByRole('button', { name: 'Читать далее' }));
  expect(onViewContent).toHaveBeenCalledExactlyOnceWith(longText);
});
