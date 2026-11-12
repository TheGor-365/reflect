import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import JourneyMap from './JourneyMap';

const session = {
  id: 's1', title: 'Тема с источниками',
  chatHistory: [
    { id: 'u1', role: 'user', content: 'Мне сложно выбрать направление',
      timestamp: { seconds: 1780000000 } },
    { id: 'a1', role: 'assistant', content: 'Начнём с критерия',
      timestamp: { seconds: 1780000001 },
      interaction: {
        version: 'reflect.interaction.v1',
        recommendationCandidates: [{
          title: 'Проверить один вариант',
          rationale: 'Нужны факты, не догадки'
        }]
      } }
  ],
  recommendationDecisions: {
    'r-a1-0': {
      assistantMessageId: 'a1', candidateIndex: 0,
      status: 'dismissed', title: 'Проверить один вариант',
      decidedAt: { seconds: 1780000002 }
    }
  },
  returnCheckIns: [{
    id: 'v1', type: 'return-check-in', author: 'user',
    text: 'На следующий день я пересмотрел решение',
    recordedAtClient: { seconds: 1780086400 }
  }]
};
const goals = [{ id: 'g1', sessionId: 's1', text: 'Принять собственное решение',
  subItems: [{ text: 'Первый шаг', completed: false }] }];

describe('PRODUCT-04 interactive map', () => {
  it('opens the exact original saved user turn through a source callback', () => {
    const onOpenSource = vi.fn();
    render(<JourneyMap session={session} goals={goals} onOpenSource={onOpenSource}/>);
    fireEvent.click(screen.getByRole('button', {
      name: /Ваши слова: Мне сложно выбрать направление/
    }));
    expect(screen.getByRole('complementary', { name: 'Источник выбранного узла' }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть исходную запись' }));
    expect(onOpenSource).toHaveBeenCalledExactlyOnceWith({
      kind: 'turn', sessionId: 's1', messageIndex: 0, messageId: 'u1'
    });
  });

  it('offers full ordered list and never represents declined AI advice as accepted', () => {
    render(<JourneyMap session={session} goals={goals}/>);
    expect(screen.getByText(/Принято рекомендаций:/).textContent).toContain('0');
    fireEvent.click(screen.getByRole('button', { name: 'Лента' }));
    expect(screen.getByRole('list', { name: 'Структурированная лента событий' }))
      .toBeInTheDocument();
    const declined = screen.getByRole('button', {
      name: /Рекомендация отклонена/
    });
    expect(declined).toBeInTheDocument();
    fireEvent.click(declined);
    expect(screen.getByText('Отклонено')).toBeInTheDocument();
  });

  it('exposes keyboard scroll region, zoom actions and status/goal filters', () => {
    render(<JourneyMap session={session} goals={goals}/>);
    const region = screen.getByRole('region', { name: 'Интерактивная прокручиваемая карта пути' });
    expect(region).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить масштаб' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Связанная цель'), {
      target: { value: 'g1' }
    });
    expect(screen.getByRole('button', { name: /Ваша цель: Принять собственное решение/ }))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Статус'), {
      target: { value: 'dismissed' }
    });
    expect(screen.getByRole('status')).toHaveTextContent(/нет/);
  });

  it('empty or saved-but-eventless session shows no invented achievement counters', () => {
    render(<JourneyMap session={{ id: 'empty', chatHistory: [] }} goals={[]}/>);
    expect(screen.getByText(/Подтверждённых событий по этому фильтру пока нет/))
      .toBeInTheDocument();
    expect(screen.getByText('пока не заданы')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Открыть исходную запись' })).not.toBeInTheDocument();
  });
});
