import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';

const props = {
  sessions: [{
    id: 's1', title: 'Моя тема',
    returnCheckIns: [{ id: 'r1', author: 'user', type: 'return-check-in',
      text: 'Я вернулся', recordedAtClient: new Date() }]
  }],
  goals: [{
    id: 'g1', sessionId: 's1', text: 'Прочитать книгу', status: 'active',
    subItems: [{ id: 'a', text: 'Первая глава', completed: false }]
  }],
  diaryNotes: [{ id: 'n1', title: 'Моя запись', createdAt: new Date(),
    entries: [{ text: 'Своё наблюдение' }] }],
  moods: [{ id: 'm1', mood: 'happy', createdAt: new Date() }],
  onOpenSession: vi.fn(), onOpenGoal: vi.fn(), onOpenDiary: vi.fn(),
  onOpenJourney: vi.fn()
};
describe('PRODUCT-05A Dashboard UI', () => {
  it('offers actual current goal/step and opens the verified goal from the board', () => {
    render(<Dashboard {...props}/>);
    expect(screen.getByRole('heading', { name: 'Что сейчас важно' })).toBeInTheDocument();
    expect(screen.getByText('Прочитать книгу')).toBeInTheDocument();
    expect(screen.getByText(/Первая глава/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть цель' }));
    expect(props.onOpenGoal).toHaveBeenCalledWith('g1');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть карту пути' }));
    expect(props.onOpenJourney).toHaveBeenCalledWith('s1');
  });
  it('shows factual period and accessible graph without psychological scoring', () => {
    render(<Dashboard {...props}/>);
    expect(screen.getByRole('group', { name: 'Датированные действия за 7 дней' }))
      .toBeInTheDocument();
    expect(screen.getByText(/0 выполнено из 1 заданных/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '30 дней' }));
    expect(screen.getByRole('group', { name: 'Датированные действия за 30 дней' }))
      .toBeInTheDocument();
    expect(screen.queryByText(/рост личности|эффективность человека/i)).toBeNull();
  });
  it('starts with honest blank state and working diary/goal entrypoints', () => {
    const onOpenDiary = vi.fn(), onOpenGoal = vi.fn();
    render(<Dashboard onOpenDiary={onOpenDiary} onOpenGoal={onOpenGoal}/>);
    expect(screen.getByRole('heading', {
      name: /Ваш путь начинается с первой собственной записи/
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть дневник' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить цель' }));
    expect(onOpenDiary).toHaveBeenCalledOnce();
    expect(onOpenGoal).toHaveBeenCalledOnce();
  });
});
