import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import SessionTable, { buildSessionChronology } from './SessionTable';

test('R9.1 chronology keeps exact stored text and passes it to full-content view', () => {
  const full = 'Сначала было неудобно.\n' + 'Потом многое изменилось. '.repeat(24) + '\nИтог без потери данных.';
  const session = {id:'s1',chatHistory:[{id:'m1',role:'user',content:full}]};
  expect(buildSessionChronology(session)[0].content).toBe(full);
  const open = vi.fn();
  render(<SessionTable session={session} goals={[]} onViewContent={open}/>);
  fireEvent.click(screen.getByRole('button',{name:'Читать далее'}));
  expect(open).toHaveBeenCalledExactlyOnceWith(full);
});
