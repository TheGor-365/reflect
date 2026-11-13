import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InteractionResult from './InteractionResult';

const interaction={
  version:'reflect.interaction.v1',
  stage:'clarify',
  clarifyingQuestion:'Что именно удерживает вас от публикации?',
  insights:[
    'Страх критики заставляет вас всё переделывать.',
    'Возможно, вам не хватает ясных критериев первой версии.'
  ],
  unknowns:['Истинная причина задержки'],
  recommendationCandidates:[{
    title:'Сразу выпустить проект',
    rationale:'Пользователь установил срок',sourceRefs:['current-message']
  }]
};
const base={interaction,messageId:'assistant-a100',isSaved:true,reviews:{}};
test('first reply shows provisional evidence instead of verified psychological explanation',()=>{
  render(<InteractionResult {...base}/>);
  expect(screen.getByText(/Проработка: предварительная/)).toBeInTheDocument();
  expect(screen.getByText(/Вероятность точности не рассчитана/)).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Непроверенные гипотезы Reflect'}))
    .toHaveTextContent('Возможные объяснения');
  expect(screen.queryByText('Что удалось прояснить')).not.toBeInTheDocument();
  expect(screen.getByText(/Контекст модели: 1 сообщение/)).toBeInTheDocument();
  expect(screen.getByText(/Ваши оценки: 0 из 2 гипотез/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Превратить в цель'})).toBeNull();
});

test('owner can grade a wrong hypothesis, comment and explicitly submit for persistence',async()=>{
  const onHypothesisReview=vi.fn().mockResolvedValue({
    grade:0, comment:'На самом деле проблема не в критике'
  });
  const onCompose=vi.fn();
  render(<InteractionResult {...base}
    onHypothesisReview={onHypothesisReview} onCompose={onCompose}/>);
  fireEvent.click(screen.getAllByRole('button',{name:'Оценить гипотезу'})[0]);
  fireEvent.click(screen.getByRole('button',{name:'Совсем мимо'}));
  fireEvent.change(screen.getByRole('textbox',{name:/Что я понял неверно/}),{
    target:{value:'На самом деле проблема не в критике'}
  });
  expect(onHypothesisReview).not.toHaveBeenCalled();
  expect(onCompose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Сохранить мой отклик'}));
  await waitFor(()=>expect(onHypothesisReview).toHaveBeenCalledWith(
    0,0,'На самом деле проблема не в критике'
  ));
  expect(screen.getByText(/В Grok он не отправлен/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Продолжить разбор'}));
  expect(onCompose).toHaveBeenCalledTimes(1);
  expect(onCompose.mock.calls[0][0]).toContain('На самом деле проблема не в критике');
  expect(onCompose.mock.calls[0][0]).toContain('один точный вопрос');
});

test('no write or pseudo-probability for an unsaved AI message',()=>{
  const onHypothesisReview=vi.fn();
  render(<InteractionResult {...base} isSaved={false}
    onHypothesisReview={onHypothesisReview}/>);
  expect(screen.queryByRole('button',{name:'Оценить гипотезу'})).toBeNull();
  expect(onHypothesisReview).not.toHaveBeenCalled();
  expect(screen.getByText(/Вероятность точности не рассчитана/)).toBeInTheDocument();
});
