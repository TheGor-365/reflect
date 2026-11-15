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


it('M5c v2 renders literal current-owner quote, 2/4 categories and one targeted question', () => {
  const onFocusTurn = vi.fn();
  const onCompose = vi.fn();
  const v2 = {
    ...base, version: 'reflect.interaction.v2', stage: 'clarify',
    clarificationSlot: 'constraints', insights: [],
    evidenceClaims: [{
      quote: 'Хочу закончить MVP',
      sourceRef: 'current-message',
      sourceTurnId: 'user-synthetic-001',
      provenance: 'owner-stated-not-independently-verified'
    }],
    evidenceSummary: {
      confirmedSlots: ['situation','desiredResult'], disputedSlots: [],
      missingSlots: ['circumstances','constraints'], completeCount: 2
    }
  };
  render(<InteractionResult interaction={v2}
    onFocusTurn={onFocusTurn} onCompose={onCompose}/>);
  expect(screen.getByText('Хочу закончить MVP')).toBeInTheDocument();
  expect(screen.getByText(/подтверждено категорий/))
    .toHaveTextContent('2 из 4');
  expect(screen.getByText(/Ещё требуют вашего подтверждения/))
    .toHaveTextContent('Обстоятельства, Ограничения и условия');
  expect(screen.getByText(/Тема уточнения/))
    .toHaveTextContent('Ограничения и условия');
  expect(screen.getByText(/Это не независимая проверка/)).toBeInTheDocument();
  expect(screen.queryByText(/Контекст модели: 1 сообщение/))
    .not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {
    name: 'Показать исходное сообщение'
  }));
  expect(onFocusTurn).toHaveBeenCalledExactlyOnceWith('user-synthetic-001');
  fireEvent.click(screen.getByRole('button', { name: 'Ответить' }));
  expect(onCompose).toHaveBeenCalledOnce();
});

it('M5c v2 cannot silently display cross-owner or unknown-version structured claims', () => {
  const onFocusTurn = vi.fn();
  render(<InteractionResult interaction={{
    ...base, version: 'reflect.interaction.v2',
    evidenceClaims: [{
      quote: 'Чужой текст', sourceRef: 'previous-session',
      sourceTurnId: '../jack'
    }],
    evidenceSummary: { confirmedSlots: [], missingSlots: [], disputedSlots: [],
      completeCount: 0 }
  }} onFocusTurn={onFocusTurn}/>);
  expect(screen.queryByText('Чужой текст')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Показать исходное сообщение' }))
    .not.toBeInTheDocument();
  expect(onFocusTurn).not.toHaveBeenCalled();
});
