import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import SessionEvidenceLedger from './SessionEvidenceLedger';

const session={id:'session-evidence',chatHistory:[
  {role:'user',id:'user-one',content:'Планирую выпуск сайта за десять дней'},
  {role:'assistant',id:'assistant-one',content:'Возможно, дело в страхе оценки',
    interaction:{version:'reflect.interaction.v1',stage:'clarify',
      insights:['Возможно, дело в страхе оценки.',
        'Возможно, дело в неясных критериях.'],
      clarifyingQuestion:'Какая часть запуска остаётся непонятной?'}}
],hypothesisReviews:{
  'h-assistant-one-0':{
    assistantMessageId:'assistant-one',hypothesisIndex:0,
    grade:0,comment:'Не боюсь оценки, хочу понять критерии.'
  }
}};
test('ledger reveals only sourced hypotheses and owner review when explicitly opened',()=>{
  const onFocusTurn=vi.fn();
  render(<SessionEvidenceLedger session={session} onFocusTurn={onFocusTurn}/>);
  const details=screen.getByLabelText('Проверка гипотез и источников');
  expect(details).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText(/Что Reflect знает и что ещё не проверено/));
  expect(details).toHaveAttribute('open');
  expect(screen.getByText('Не боюсь оценки, хочу понять критерии.',{
    exact:false
  })).toBeInTheDocument();
  expect(screen.getByText('Вы не согласились')).toBeInTheDocument();
  expect(screen.getByText('Пока не оценено')).toBeInTheDocument();
  expect(screen.getByText('Ответ не установлен автоматически')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button',{name:'Открыть исходный ответ'})[0]);
  expect(onFocusTurn).toHaveBeenCalledWith('assistant-one');
});
test('selected prior message can only enter draft after explicit preview acknowledgment',()=>{
  const onCompose=vi.fn();
  render(<SessionEvidenceLedger session={session} onCompose={onCompose}/>);
  fireEvent.click(screen.getByText(/Что Reflect знает и что ещё не проверено/));
  const checkbox=screen.getByRole('checkbox',{
    name:/Сообщение 1: Планирую выпуск сайта/
  });
  fireEvent.click(checkbox);
  expect(onCompose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Посмотреть выбранный контекст'}));
  expect(screen.getByLabelText('Предпросмотр выбранного контекста'))
    .toHaveTextContent('Планирую выпуск сайта');
  const action=screen.getByRole('button',{name:/Вставить в черновик/});
  expect(action).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{
    name:/Я проверил текст и разрешаю/
  }));
  expect(action).toBeEnabled();
  fireEvent.click(action);
  expect(onCompose).toHaveBeenCalledTimes(1);
  expect(onCompose.mock.calls[0][0]).toContain('Мой текущий вопрос:');
  expect(onCompose.mock.calls[0][0]).not.toContain('Возможно, дело в страхе');
});
test('never renders a ledger for an unsaved session',()=>{
  const {container}=render(<SessionEvidenceLedger session={null}/>);
  expect(container).toBeEmptyDOMElement();
});
