import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SmoothDisclosure from './SmoothDisclosure';

test('UX R2 disclosure starts collapsed, expands/collapses without losing form draft', () => {
  render(<SmoothDisclosure label="Подробности" iconKind="information">
    <label>Важная заметка
      <input aria-label="Важная заметка"/>
    </label>
  </SmoothDisclosure>);
  const trigger=screen.getByRole('button',{name:'Подробности'});
  const region=screen.getByLabelText('Важная заметка').closest(
    '.reflect-disclosure-content'
  );
  expect(trigger).toHaveAttribute('aria-expanded','false');
  expect(region).toHaveAttribute('aria-hidden','true');
  fireEvent.click(trigger);
  expect(region).toHaveAttribute('aria-hidden','false');
  fireEvent.change(screen.getByRole('textbox',{name:'Важная заметка'}),{
    target:{value:'Я решил изменить первый шаг'}
  });
  fireEvent.click(trigger);
  expect(region).toHaveAttribute('aria-hidden','true');
  fireEvent.click(trigger);
  expect(screen.getByRole('textbox',{name:'Важная заметка'}))
    .toHaveValue('Я решил изменить первый шаг');
});
