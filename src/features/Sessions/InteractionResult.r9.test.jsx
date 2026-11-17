import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import InteractionResult from './InteractionResult';
import ChatMessage from './ChatMessage';

const sample = {
  version:'reflect.interaction.v1', stage:'synthesize',
  insights:['Нужно проверить условия'], unknowns:[], clarifyingQuestion:'',
  recommendationCandidates:[{title:'Исследовать варианты',rationale:'Данных пока мало',sourceRefs:['current-message']}]
};

test('R9.1 hypothesis UI avoids a conflicting hard-coded Vy address', () => {
  render(<InteractionResult interaction={sample} messageId="assistant-r9" />);
  const hypotheses = screen.getByRole('region', {name:'Непроверенные гипотезы Reflect'});
  expect(hypotheses).toHaveTextContent('Насколько каждое объяснение соответствует ситуации?');
  expect(hypotheses).not.toHaveTextContent(/Оцените|вашей ситуации|Это ваш отклик/);
});

test('R9.1 saved idea does not offer the same Save idea action twice', () => {
  const decisionKey='r-assistant-r9-0';
  const onDecision=vi.fn();
  render(<InteractionResult interaction={sample} messageId="assistant-r9" isSaved
    onDecision={onDecision} decisions={{[decisionKey]:{status:'saved'}}}/>);
  expect(screen.getByText('Идея сохранена')).toBeInTheDocument();
  expect(screen.queryByRole('button', {name:'Сохранить идею'})).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name:'Отложить'})).toBeInTheDocument();
  expect(onDecision).not.toHaveBeenCalled();
});

test('R9.1 own turn has compact icon and accessible non-Vy label', () => {
  render(<ChatMessage message={{id:'u1',role:'user',content:'Моя мысль'}}/>);
  expect(screen.getByRole('article', {name:'Моё сообщение'})).toBeInTheDocument();
  expect(screen.getByText('Моя мысль')).toBeInTheDocument();
  expect(screen.queryByText('Вы')).not.toBeInTheDocument();
});
