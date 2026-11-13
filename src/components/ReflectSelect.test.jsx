import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ReflectSelect from './ReflectSelect';

const options = [['all','Все темы'], ['session-1','Запуск приложения'],
  ['session-2','Личная эффективность']];

test('Journey controls use Reflect visual popup instead of native browser select', () => {
  const onChange=vi.fn();
  const { rerender }=render(<ReflectSelect label="Тема"
    ariaLabel="Тема карты" value="all" options={options}
    onChange={onChange}/>);
  const trigger=screen.getByRole('combobox',{name:'Тема карты'});
  expect(document.querySelector('select')).toBeNull();
  expect(trigger).toHaveTextContent('Все темы');
  fireEvent.click(trigger);
  const menu=screen.getByRole('listbox',{name:'Тема карты'});
  expect(within(menu).getAllByRole('option')).toHaveLength(3);
  fireEvent.click(within(menu).getByRole('option',{name:'Запуск приложения'}));
  expect(onChange).toHaveBeenCalledExactlyOnceWith('session-1');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  rerender(<ReflectSelect label="Тема" ariaLabel="Тема карты"
    value="session-1" options={options} onChange={onChange}/>);
  expect(trigger).toHaveTextContent('Запуск приложения');
});

test('keyboard selection and escape are supported', () => {
  const onChange=vi.fn();
  render(<ReflectSelect label="Тема" ariaLabel="Тема карты"
    value="all" options={options} onChange={onChange}/>);
  const trigger=screen.getByRole('combobox',{name:'Тема карты'});
  fireEvent.keyDown(trigger,{key:'ArrowDown'});
  expect(trigger).toHaveAttribute('aria-expanded','true');
  fireEvent.keyDown(trigger,{key:'End'});
  fireEvent.keyDown(trigger,{key:'Enter'});
  expect(onChange).toHaveBeenCalledWith('session-2');
  fireEvent.keyDown(trigger,{key:' '});
  fireEvent.keyDown(trigger,{key:'Escape'});
  expect(trigger).toHaveAttribute('aria-expanded','false');
});

test('disabled and outside-click never change a controlled value',()=>{
  const onChange=vi.fn();
  const {rerender}=render(<ReflectSelect label="Тема"
    value="all" options={options} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('combobox',{name:'Тема'}));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  rerender(<ReflectSelect label="Тема" value="all"
    options={options} disabled onChange={onChange}/>);
  expect(screen.getByRole('combobox',{name:'Тема'})).toBeDisabled();
  fireEvent.click(screen.getByRole('combobox',{name:'Тема'}));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
