import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InteractionResult from './InteractionResult';

const interaction = {
  version: 'reflect.interaction.v1',
  clarifyingQuestion: '',
  recommendationCandidates: [{
    title: 'Разделить большую задачу',
    rationale: 'Есть пользовательская неопределённость.',
    sourceRefs: ['current-message']
  }],
  unknowns: []
};
const props = {
  interaction, isSaved: true, messageId: 'assistant-request1234567890',
  decisions: {}, onDecision: vi.fn(), onOpenGoals: vi.fn()
};
describe('PRODUCT-02 decisions UI', () => {
  it('never offers persistence actions for an unsaved answer', () => {
    render(<InteractionResult {...props} isSaved={false}/>);
    expect(screen.getByText(/Сначала сохраните сеанс/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Сохранить идею' })).toBeNull();
  });
  it('requires explicit editable confirmation before turning a recommendation into a goal', async () => {
    const onDecision = vi.fn().mockResolvedValue({ status: 'accepted' });
    render(<InteractionResult {...props} onDecision={onDecision}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Превратить в цель' }));
    expect(onDecision).not.toHaveBeenCalled();
    const input = screen.getByRole('textbox', { name: 'Название цели' });
    fireEvent.change(input, { target: { value: 'Выпустить тестовую версию' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить создание цели' }));
    await waitFor(() => expect(onDecision).toHaveBeenCalledWith(0, 'goal', {
      title: 'Выпустить тестовую версию', purpose: ''
    }));
    expect(screen.getByText(/Цель подтверждена и связана/)).toBeTruthy();
  });
  it('shows an accepted goal and no duplicate action button', () => {
    const key = 'r-assistant-request1234567890-0';
    render(<InteractionResult {...props} decisions={{ [key]: { status: 'accepted', goalId: 'g1' } }}/>);
    expect(screen.getByText('Принято как цель')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Превратить в цель' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть цели' }));
    expect(props.onOpenGoals).toHaveBeenCalledTimes(1);
  });
  it('preserves the goal draft after a failed transaction and does not retry automatically', async () => {
    const onDecision = vi.fn().mockRejectedValue(new Error('Сеть недоступна'));
    render(<InteractionResult {...props} onDecision={onDecision}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Превратить в цель' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название цели' }), {
      target: { value: 'Не потерять черновик' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить создание цели' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Сеть недоступна'));
    expect(screen.getByRole('textbox', { name: 'Название цели' })).toHaveValue('Не потерять черновик');
    expect(onDecision).toHaveBeenCalledTimes(1);
  });
});
