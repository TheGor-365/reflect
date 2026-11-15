import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SessionReadinessPanel from './SessionReadinessPanel';

const mocks = vi.hoisted(() => ({
  save: vi.fn(), clear: vi.fn(), readMode: vi.fn()
}));
vi.mock('./readinessPersistence', () => ({
  saveReadinessEvidence: (...args) => mocks.save(...args),
  clearReadinessEvidence: (...args) => mocks.clear(...args)
}));
vi.mock('../../api/ownerContextLevel', () => ({
  readOwnerInteractionMode: (...args) => mocks.readMode(...args)
}));
const session = {
  id: 'synthetic-eric-session', chatHistory: [{
    id: 'user-synthetic-first', role: 'user',
    content: 'Я хочу опубликовать MVP через десять дней.'
  }, {
    id: 'assistant-synthetic-first', role: 'assistant',
    content: 'Нужно уточнить ограничения'
  }]
};
const props = {
  userId: 'synthetic-eric', session, mode: 'coach',
  currentDraft: '', onFocusTurn: vi.fn()
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({
    sourceTurnId: 'user-synthetic-first',
    quote: session.chatHistory[0].content, status: 'confirmed'
  });
  mocks.clear.mockResolvedValue(true);
  mocks.readMode.mockResolvedValue('coach');
});

test('M5a owner sees zero categories, not an AI diagnosis or default percent', () => {
  render(<SessionReadinessPanel {...props}/>);
  expect(screen.getByText(/0 из 4 категорий подтверждены/)).toBeInTheDocument();
  expect(screen.getByText(/0% категорий отмечено вами/)).toBeInTheDocument();
  expect(screen.getByText(/это/i)).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.readMode).not.toHaveBeenCalled();
});

test('M5a exact saved quote + separate owner checkbox before atomic save', async () => {
  render(<SessionReadinessPanel {...props}/>);
  const source = screen.getByRole('combobox', {
    name: 'Моё сохранённое сообщение', hidden: true
  });
  fireEvent.change(source, { target: { value: 'user-synthetic-first' } });
  const button = screen.getByRole('button', {
    name: 'Сохранить подтверждение', hidden: true
  });
  expect(button).toBeDisabled();
  const checkbox = screen.getByRole('checkbox', { hidden: true });
  fireEvent.click(checkbox);
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
    userId: 'synthetic-eric', sessionId: 'synthetic-eric-session',
    slot: 'situation', sourceTurnId: 'user-synthetic-first',
    quote: session.chatHistory[0].content, status: 'confirmed',
    confirmed: true
  }));
  expect(screen.getByText(/Подтверждение записано в Firebase/)).toBeInTheDocument();
});

test('M5a changed quote is not source-backed: no provider or Firestore write', () => {
  render(<SessionReadinessPanel {...props}/>);
  fireEvent.change(screen.getByRole('combobox', {
    name: 'Моё сохранённое сообщение', hidden: true
  }), { target: { value: 'user-synthetic-first' } });
  fireEvent.change(screen.getByRole('textbox', {
    name: /Точная цитата из выбранного сообщения/, hidden: true
  }), { target: { value: 'В этом тексте я выдумал ограничения' } });
  fireEvent.click(screen.getByRole('checkbox', { hidden: true }));
  const button = screen.getByRole('button', {
    name: 'Сохранить подтверждение', hidden: true
  });
  expect(button).toBeDisabled();
  expect(mocks.save).not.toHaveBeenCalled();
});

test('M5a support/companion/vent never pushes readiness', async () => {
  const { rerender } = render(<SessionReadinessPanel {...props}
    mode="support"/>);
  expect(screen.queryByText(/категорий подтверждены/)).not.toBeInTheDocument();
  rerender(<SessionReadinessPanel {...props} mode="companion"/>);
  expect(screen.queryByText(/категорий подтверждены/)).not.toBeInTheDocument();
  rerender(<SessionReadinessPanel {...props} mode="coach"
    currentDraft="Просто хочу выговориться, не надо давать планов"/>);
  expect(screen.queryByText(/категорий подтверждены/)).not.toBeInTheDocument();
});

test('M5a inherited owner preference controls visibility, not grant', async () => {
  render(<SessionReadinessPanel {...props} mode="account"/>);
  await waitFor(() => expect(screen.getByText(
    /0 из 4 категорий подтверждены/
  )).toBeInTheDocument());
  expect(mocks.readMode).toHaveBeenCalledExactlyOnceWith('synthetic-eric');
  expect(mocks.save).not.toHaveBeenCalled();
});
