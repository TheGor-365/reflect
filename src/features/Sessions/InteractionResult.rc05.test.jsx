import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import InteractionResult from './InteractionResult';

const interaction = {
  version:'reflect.interaction.v1',stage:'clarify',
  insights:['Версия о страхе критики','Версия о недостатке критериев'],
  recommendationCandidates:[{
    title:'Определить минимум для запуска',
    rationale:'Это только предложение по текущему сообщению'
  }],
  unknowns:['Истинная причина задержки']
};
const messageId='assistant-rc05';
describe('RC05 owner hypothesis feedback',()=>{
  it('has 5 color-coded illustrated choices, closes on confirmed save and keeps owner path',async()=>{
    const onHypothesisReview=vi.fn().mockResolvedValue({grade:0,comment:'Не в страхе оценки'});
    const onCompose=vi.fn();
    const props={interaction,messageId,isSaved:true,reviews:{},
      onHypothesisReview,onCompose};
    const {rerender}=render(<InteractionResult {...props}/>);
    fireEvent.click(screen.getAllByRole('button',{name:'Оценить гипотезу'})[0]);
    const picker=screen.getByRole('group',{name:'Оценка гипотезы 1'});
    const choices=within(picker).getAllByRole('button');
    expect(choices).toHaveLength(5);
    choices.forEach((choice,index)=>{
      expect(choice.className).toContain('reflect-hypothesis-grade-choice--'+index);
      expect(choice.querySelector('svg')).toBeTruthy();
      expect(choice).toHaveAttribute('aria-pressed','false');
    });
    fireEvent.click(within(picker).getByRole('button',{name:'Совсем мимо'}));
    expect(within(picker).getByRole('button',{name:'Совсем мимо'}))
      .toHaveAttribute('aria-pressed','true');
    fireEvent.change(screen.getByPlaceholderText(/я не боюсь оценки/),{
      target:{value:'Не в страхе оценки'}
    });
    fireEvent.click(screen.getByRole('button',{name:'Сохранить мой отклик'}));
    await waitFor(()=>expect(onHypothesisReview).toHaveBeenCalledExactlyOnceWith(
      0,0,'Не в страхе оценки'
    ));
    await waitFor(()=>expect(screen.queryByRole('group',{
      name:'Оценка гипотезы 1'
    })).not.toBeInTheDocument());
    rerender(<InteractionResult {...props} reviews={{
      'h-assistant-rc05-0':{grade:0,comment:'Не в страхе оценки'}
    }}/>);
    expect(screen.getByText(/Ваш отклик: Совсем мимо/)).toBeInTheDocument();
    expect(screen.getByText('Не в страхе оценки')).toBeInTheDocument();
    expect(screen.getByText(/Сохранено в сеансе/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Продолжить разбор'}));
    expect(onCompose).toHaveBeenCalledOnce();
    expect(onCompose.mock.calls[0][0]).toContain('Это мой отзыв, не доказательство.');
    expect(screen.queryByRole('group',{name:'Оценка гипотезы 1'}))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Изменить мою оценку'}));
    expect(screen.getByRole('group',{name:'Оценка гипотезы 1'}))
      .toBeInTheDocument();
  });
  it('preserves draft and form if server save fails; never calls model',async()=>{
    const callback=vi.fn().mockRejectedValue(new Error('network'));
    render(<InteractionResult interaction={interaction} messageId={messageId}
      isSaved={true} onHypothesisReview={callback}/>);
    fireEvent.click(screen.getAllByRole('button',{name:'Оценить гипотезу'})[0]);
    fireEvent.click(screen.getByRole('button',{name:'Частично похоже'}));
    fireEvent.change(screen.getByPlaceholderText(/я не боюсь оценки/),{
      target:{value:'Важный нюанс'}
    });
    fireEvent.click(screen.getByRole('button',{name:'Сохранить мой отклик'}));
    await waitFor(()=>expect(screen.getByRole('alert'))
      .toHaveTextContent('не подтверждён сервером'));
    expect(screen.getByRole('group',{name:'Оценка гипотезы 1'}))
      .toBeInTheDocument();
    expect(screen.getByDisplayValue('Важный нюанс')).toBeInTheDocument();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('recommendation is a different icon-marked type than hypotheses and goals',()=>{
    render(<InteractionResult interaction={interaction} messageId={messageId}/>);
    const proposal=screen.getByLabelText('Предложенная рекомендация');
    expect(within(proposal).getByText(/Рекомендация AI · требует проверки/))
      .toBeInTheDocument();
    expect(proposal.querySelector('.reflect-recommendation-mark svg'))
      .toBeTruthy();
    expect(proposal).toHaveClass('reflect-interaction-section--recommendation');
  });
});
