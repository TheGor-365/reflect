import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ProfileModal from './ProfileModal';

test('profile is usable without mandatory age or gender and keeps chosen nickname', () => {
  const onSave = vi.fn();
  render(<ProfileModal onSave={onSave}/>);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Имя или псевдоним'), {
    target: { value: '  Synthetic Alpha  ' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и продолжить' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Synthetic Alpha', age: '', gender: 'не указан'
  }));
});

test('profile rejects invalid age without writes', () => {
  const onSave = vi.fn();
  render(<ProfileModal onSave={onSave}/>);
  fireEvent.change(screen.getByLabelText('Имя или псевдоним'), {
    target: { value: 'Synthetic Alpha' }
  });
  fireEvent.change(screen.getByLabelText(/^Возраст/), { target: { value: '130' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Сохранить и продолжить' }).closest('form'));
  expect(screen.getByRole('alert')).toHaveTextContent('корректный возраст');
  expect(onSave).not.toHaveBeenCalled();
});

test('editing existing profile has a cancel action', () => {
  const onCancel = vi.fn();
  render(<ProfileModal existingProfile={{ name: 'Synthetic Alpha', age: 25 }}
    onSave={vi.fn()} onCancel={onCancel} />);
  expect(screen.getByLabelText('Имя или псевдоним')).toHaveValue('Synthetic Alpha');
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть профиль' }));
  expect(onCancel).toHaveBeenCalledOnce();
});
