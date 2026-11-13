import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ReflectSelectRow from './ReflectSelectRow';

const options = [['rare', 'Редко'], ['balanced', 'Умеренно']];
const renderSelect = (props = {}) => {
  const onChange = vi.fn();
  const view = render(<ReflectSelectRow label="Частота" description="Настройка Reflect"
    name="recommendationFrequency" value="rare" options={options}
    onChange={onChange} {...props}/>);
  return { ...view, onChange };
};

test('themed menu has no browser-native select and preserves controlled settings', () => {
  const { onChange, rerender } = renderSelect();
  const trigger = screen.getByRole('combobox', { name: 'Частота' });
  expect(screen.queryByRole('combobox', { name: 'Частота', hidden: true })).toBe(trigger);
  expect(document.querySelector('select')).toBeNull();
  expect(trigger).toHaveTextContent('Редко');
  fireEvent.click(trigger);
  const menu = screen.getByRole('listbox', { name: 'Частота' });
  expect(within(menu).getAllByRole('option')).toHaveLength(2);
  fireEvent.click(within(menu).getByRole('option', { name: 'Умеренно' }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith('recommendationFrequency', 'balanced');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  // Consumer owns the form value. The custom view never writes Firebase.
  expect(trigger).toHaveTextContent('Редко');
  rerender(<ReflectSelectRow label="Частота" description="Настройка Reflect"
    name="recommendationFrequency" value="balanced" options={options} onChange={onChange}/>);
  expect(screen.getByRole('combobox', { name: 'Частота' })).toHaveTextContent('Умеренно');
});

test('keyboard arrows, Home/End, Enter and Escape retain accessibility', () => {
  const { onChange } = renderSelect();
  const trigger = screen.getByRole('combobox', { name: 'Частота' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(trigger, { key: 'End' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('recommendationFrequency', 'balanced');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.keyDown(trigger, { key: ' ' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('disabled preferences never open, select or mutate state', () => {
  const { onChange } = renderSelect({ disabled: true });
  const trigger = screen.getByRole('combobox', { name: 'Частота' });
  expect(trigger).toBeDisabled();
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

test('outside pointer action closes the options without altering value', () => {
  const { onChange } = renderSelect();
  const trigger = screen.getByRole('combobox', { name: 'Частота' });
  fireEvent.click(trigger);
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
