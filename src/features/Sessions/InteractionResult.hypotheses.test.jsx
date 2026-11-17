import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InteractionResult from './InteractionResult';
import { HYPOTHESIS_GRADES } from './hypothesisReviewModel';

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
  expect(screen.queryByText(/Проработка · предварительная/)).not.toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Непроверенные гипотезы Reflect'}))
    .toHaveTextContent('Возможные объяснения');
  expect(screen.queryByText('Что удалось прояснить')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Непроверенные гипотезы Reflect' })).toBeInTheDocument();
  expect(screen.queryByText('0/2 оценено')).not.toBeInTheDocument();
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
  fireEvent.change(screen.getByRole('textbox',{name:/Комментарий/}),{
    target:{value:'На самом деле проблема не в критике'}
  });
  expect(onHypothesisReview).not.toHaveBeenCalled();
  expect(onCompose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Сохранить оценку'}));
  await waitFor(()=>expect(onHypothesisReview).toHaveBeenCalledWith(
    0,0,'На самом деле проблема не в критике'
  ));
  await waitFor(() => expect(screen.queryByRole('button', {
    name:'Сохранить оценку'
  })).not.toBeInTheDocument());
  expect(screen.queryByText(/В Grok он не отправлен/)).not.toBeInTheDocument();
  expect(onCompose).not.toHaveBeenCalled();
});

test('no write or pseudo-probability for an unsaved AI message',()=>{
  const onHypothesisReview=vi.fn();
  render(<InteractionResult {...base} isSaved={false}
    onHypothesisReview={onHypothesisReview}/>);
  expect(screen.queryByRole('button',{name:'Оценить гипотезу'})).toBeNull();
  expect(onHypothesisReview).not.toHaveBeenCalled();
  expect(screen.queryByText(/Проработка · предварительная/)).not.toBeInTheDocument();
});

test('UX R5: saved grade is compact, comment collapsed and editor remains closed until change',()=>{
  render(<InteractionResult {...base}
    reviews={{'h-assistant-a100-0':{
      grade:4, comment:'Суть тревоги в результате, а не в рекламе'
    }}} onHypothesisReview={vi.fn()}/>);
  expect(document.querySelector('.reflect-hypothesis-saved-grade')).toHaveTextContent('Очень точно');
  const comment=screen.getByRole('button',{name:/Комментарий/});
  expect(comment).toHaveAttribute('aria-expanded','false');
  fireEvent.click(comment);
  expect(comment).toHaveAttribute('aria-expanded','true');
  expect(screen.getByText('Суть тревоги в результате, а не в рекламе')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Сохранить оценку'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Изменить оценку'}));
  expect(screen.getAllByRole('button',{name:'Сохранить оценку'})).toHaveLength(1);
  const ratings=HYPOTHESIS_GRADES;
  for(const name of ratings){
    expect(screen.getByRole('button',{name})).toBeInTheDocument();
  }
});

test('UX R5: clarification answer does not repeat question in prepared draft',()=>{
  const onCompose=vi.fn();
  render(<InteractionResult {...base} onCompose={onCompose}/>);
  fireEvent.click(screen.getByRole('button',{name:'Ответить в диалоге'}));
  expect(onCompose).toHaveBeenCalledExactlyOnceWith('');
});
