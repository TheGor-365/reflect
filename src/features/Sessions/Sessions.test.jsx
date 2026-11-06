import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sessions from './Sessions';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  clearFeedback: vi.fn(),
  ai: vi.fn()
}));
vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('../../api/geminiService', () => ({
  AI_SESSION_ENABLED: false,
  getAnalysisFromAI: mocks.ai
}));
vi.mock('../../hooks/useEntrySave', () => ({
  useEntrySave: () => ({
    status: 'idle',
    save: mocks.save,
    clearFeedback: mocks.clearFeedback
  })
}));

const defaults = {
  sessions: [],
  profile: { name: 'Demo' },
  userId: 'demo-owner',
  currentSessionId: 'new',
  setCurrentSessionId: vi.fn(),
  onStartNewSession: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(true);
});

test('new session renders full chat with bottom textarea and no fabricated assistant or context cards', () => {
  const { container } = render(<Sessions {...defaults} />);
  expect(screen.getByRole('heading', { name: 'Новый сеанс' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Сообщение для сеанса' }).tagName).toBe('TEXTAREA');
  expect(container.querySelector('.reflect-session-compose-dock')).toContainElement(
    screen.getByRole('textbox', { name: 'Сообщение для сеанса' })
  );
  expect(screen.queryByText('Начните диалог...')).not.toBeInTheDocument();
  expect(screen.queryByText('Как это работает?')).not.toBeInTheDocument();
  expect(screen.queryByText(/Здравствуйте, Demo/)).not.toBeInTheDocument();
  expect(screen.getByText(/Пока ИИ недоступен/)).toBeInTheDocument();
  const composer = container.querySelector('.reflect-session-composer');
  expect(container.querySelector('.reflect-session-compose-dock').lastElementChild).toBe(composer);
  expect(container.querySelector('details.reflect-session-draft-settings')).not.toHaveAttribute('open');
  expect(screen.getByRole('button', { name: 'Отправить сообщение' })).toBeDisabled();
});

test('empty sessions state offers explicit start action', () => {
  const onStartNewSession = vi.fn();
  render(<Sessions {...defaults} currentSessionId={null} onStartNewSession={onStartNewSession} />);
  fireEvent.click(screen.getByRole('button', { name: 'Начать новый сеанс' }));
  expect(onStartNewSession).toHaveBeenCalledOnce();
});

test('Save to Diary persists via existing retry-safe hook, does not attempt AI, and clears on confirmation', async () => {
  render(<Sessions {...defaults} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение для сеанса' }), {
    target: { value: 'Первый абзац\n\nВторой абзац' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить текст в дневник' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const payload = mocks.save.mock.calls[0][0];
  expect(payload.title).toMatch(/Запись из размышления/);
  expect(payload.entries[0].text).toBe('Первый абзац\n\nВторой абзац');
  expect(mocks.ai).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Сообщение для сеанса' })).toHaveValue(''));
});

test('failed diary save retains full text in editable textarea', async () => {
  mocks.save.mockResolvedValueOnce(false);
  render(<Sessions {...defaults} />);
  const textbox = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  fireEvent.change(textbox, { target: { value: 'Конфиденциальная синтетическая запись' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить текст в дневник' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(textbox).toHaveValue('Конфиденциальная синтетическая запись');
});

test('historical sessions show stored messages but omit empty recommendations panels', () => {
  const session = {
    id: 'history-1',
    title: 'Исторический сеанс',
    chatHistory: [{ id: 'a1', role: 'user', content: 'Синтетическая запись' }],
    recommendations: [],
    exercises: []
  };
  render(<Sessions {...defaults} sessions={[session]} currentSessionId="history-1" />);
  expect(screen.getByText('Синтетическая запись')).toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Результаты сеанса' })).not.toBeInTheDocument();
});
