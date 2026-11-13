import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InteractionResult from './InteractionResult';

const base = {
  version: 'reflect.interaction.v1',
  clarifyingQuestion: 'Какой риск для вас допустим?',
  recommendationCandidates: [{
    title: 'Сравнить условия',
    rationale: 'Нет данных об обязанностях и стабильности.',
    sourceRefs: ['current-message']
  }],
  unknowns: ['Условия новой роли']
};

describe('InteractionResult', () => {
  it('shows a question, an attributed proposal and explicit compose actions', () => {
    const onCompose = vi.fn();
    render(<InteractionResult interaction={base} onCompose={onCompose} />);
    expect(screen.getByText('Какой риск для вас допустим?')).toBeTruthy();
    expect(screen.getByText(/не ваша цель/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ответить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Обсудить' }));
    expect(onCompose).toHaveBeenCalledTimes(2);
    expect(onCompose.mock.calls[0][0]).toMatch(/Мой ответ/);
    expect(onCompose.mock.calls[1][0]).toMatch(/Сравнить условия/);
  });
  it('does not fabricate a proposal for a vent-only response', () => {
    render(<InteractionResult interaction={{
      version: base.version, clarifyingQuestion: '',
      recommendationCandidates: [], unknowns: []
    }}/>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/не ваша цель/)).toBeNull();
  });
});
