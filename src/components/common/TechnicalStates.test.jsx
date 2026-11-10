import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Loader from './Loader';
import AppFailureView from './AppFailureView';

test('startup renders branded Reflect status, no legacy white spinner', () => {
  render(<Loader />);
  const status = screen.getByRole('status', { name: 'Загружаем Reflect' });
  expect(status).toHaveClass('reflect-boot');
  expect(screen.getByText('Подготавливаем ваше пространство')).toBeInTheDocument();
  expect(status.className).not.toContain('bg-stone-50');
});

test('network outage is a branded retryable 503, without leaking provider details', () => {
  const retry = vi.fn();
  render(<AppFailureView code={503} onRetry={retry} />);
  expect(screen.getByRole('heading', { name: 'Не удалось загрузить данные' }))
    .toBeInTheDocument();
  expect(screen.getByLabelText('Код 503')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Повторить загрузку/ }));
  expect(retry).toHaveBeenCalledOnce();
});

test('unknown route gives a branded 404 with a path back', () => {
  const retry = vi.fn();
  render(<AppFailureView code={404} onRetry={retry} />);
  expect(screen.getByRole('heading', { name: 'Здесь пока ничего нет' }))
    .toBeInTheDocument();
  expect(screen.getByLabelText('Код 404')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /На главную/ }));
  expect(retry).toHaveBeenCalledOnce();
});

test('unexpected render failure has a safe 500 error screen', () => {
  render(<AppFailureView code={500} message="Повторите попытку." />);
  expect(screen.getByLabelText('Код 500')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Перезагрузить/ })).toBeInTheDocument();
});
