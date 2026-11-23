import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import ArchiveAction from './ArchiveAction';

test('R9.2.4B does not archive without explicit confirmation and never writes on render', () => {
  const previous = window.confirm;
  window.confirm = vi.fn(() => false);
  try {
    const onCommit = vi.fn();
    render(<ArchiveAction archived={false} subject="сеанс Тест" onCommit={onCommit}/>);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'Архивировать: сеанс Тест'}));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  } finally { window.confirm = previous; }
});

test('R9.2.4B archives once, pending lock prevents repeated writes', async () => {
  const previous = window.confirm;
  window.confirm = vi.fn(() => true);
  let complete;
  const onCommit = vi.fn(() => new Promise(resolve => {complete=resolve;}));
  try {
    render(<ArchiveAction archived={false} subject="цель" onCommit={onCommit}/>);
    fireEvent.click(screen.getByRole('button', {name: 'Архивировать: цель'}));
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(true);
    complete({archived:true,changed:true});
    await waitFor(() => expect(screen.getByText(/Архивировано\. Обновляем список/)).toBeInTheDocument());
    expect(onCommit).toHaveBeenCalledTimes(1);
  } finally {window.confirm = previous;}
});

test('R9.2.4B restore is explicit but does not require destructive confirmation', async () => {
  const previous = window.confirm;
  window.confirm = vi.fn(() => {throw new Error('must not confirm restore');});
  const onCommit = vi.fn().mockResolvedValue({archived:false,changed:true});
  try {
    render(<ArchiveAction archived subject="рекомендация" onCommit={onCommit}/>);
    fireEvent.click(screen.getByRole('button', {name: 'Восстановить: рекомендация'}));
    await waitFor(() => expect(onCommit).toHaveBeenCalledExactlyOnceWith(false));
    expect(screen.getByText(/Восстановлено/)).toBeInTheDocument();
  } finally {window.confirm = previous;}
});

test('R9.2.4B rejected write remains retryable and does not claim success', async () => {
  const onCommit = vi.fn().mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce({archived:false,changed:true});
  render(<ArchiveAction archived subject="сеанс" onCommit={onCommit}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Восстановить: сеанс'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(screen.queryByText(/Восстановлено/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Восстановить: сеанс'}));
  await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));
});
