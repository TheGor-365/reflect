import React from 'react';
import { render, screen } from '@testing-library/react';
import SessionComposer from './SessionComposer';

test('UX R5: explicit reply moves focus without mutating draft or submitting', () => {
  const onSubmit = vi.fn();
  const onChange = vi.fn();
  const props = {
    value: 'Уже написанный текст', onSubmit, onChange, aiAvailable: true
  };
  const { rerender } = render(<SessionComposer {...props} focusRequest={0}/>);
  const textbox = screen.getByRole('textbox', {name:'Сообщение для сеанса'});
  expect(textbox).not.toHaveFocus();
  rerender(<SessionComposer {...props} focusRequest={1}/>);
  expect(textbox).toHaveFocus();
  expect(screen.getByRole('region', {name:'Поле ввода для сеанса'}))
    .toHaveClass('reflect-session-composer--reply-focus');
  expect(textbox).toHaveValue('Уже написанный текст');
  expect(onSubmit).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});
