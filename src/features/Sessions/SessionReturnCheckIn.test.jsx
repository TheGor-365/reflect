import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SessionReturnCheckIn from './SessionReturnCheckIn';
import { saveSessionReturn } from './sessionReturn';

vi.mock('./sessionReturn', () => ({ saveSessionReturn: vi.fn() }));
vi.mock('../../components/common/ProtectedDraftControls', () => ({
  default: () => null
}));
beforeEach(() => {
  vi.clearAllMocks();
  saveSessionReturn.mockResolvedValue({ id: 'v1' });
});
const props = { userId: 'synthetic-uid', session: { id: 'saved-session', chatHistory: [] } };
test('user opts in to record a return; no write on open or typing', async () => {
  render(<SessionReturnCheckIn {...props}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  expect(saveSessionReturn).not.toHaveBeenCalled();
  const textbox = screen.getByRole('textbox', { name: 'Что изменилось с прошлого раза?' });
  fireEvent.change(textbox, { target: { value: 'Два раза прочитал по 20 минут' } });
  expect(saveSessionReturn).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить наблюдение' }));
  await waitFor(() => expect(saveSessionReturn).toHaveBeenCalledTimes(1));
  expect(saveSessionReturn).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'synthetic-uid', sessionId: 'saved-session',
    note: 'Два раза прочитал по 20 минут'
  }));
  await waitFor(() => expect(textbox).toHaveValue(''));
  expect(screen.getByText(/не отправлялось Grok/)).toBeInTheDocument();
});
test('network error preserves editable return for deliberate retry with same ID', async () => {
  saveSessionReturn.mockRejectedValueOnce(new Error('Сеть недоступна'))
    .mockResolvedValueOnce({ id: 'v1' });
  render(<SessionReturnCheckIn {...props}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  const textbox = screen.getByRole('textbox', { name: 'Что изменилось с прошлого раза?' });
  fireEvent.change(textbox, { target: { value: 'Не терять запись' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить наблюдение' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Сеть недоступна'));
  expect(textbox).toHaveValue('Не терять запись');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить наблюдение' }));
  await waitFor(() => expect(saveSessionReturn).toHaveBeenCalledTimes(2));
  expect(saveSessionReturn.mock.calls[0][0].visitId)
    .toBe(saveSessionReturn.mock.calls[1][0].visitId);
});
test('shows only user-authored return notes, not fabricated model events', () => {
  render(<SessionReturnCheckIn {...props} session={{
    ...props.session,
    returnCheckIns: [
      { id: 'v1', type: 'return-check-in', author: 'user',
        text: 'Подтверждённое наблюдение' },
      { id: 'fake', type: 'return-check-in', author: 'assistant',
        text: 'Ложный прогресс' }
    ]
  }}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  expect(screen.getByText('Подтверждённое наблюдение')).toBeInTheDocument();
  expect(screen.queryByText('Ложный прогресс')).toBeNull();
});

const acceptedGoals = [{
  id: 'confirmed-goal', text: 'Проверить прототип',
  sessionId: 'saved-session',
  sourceType: 'user-accepted-ai-recommendation',
  sourceRecommendationKey: 'r-assistant-0',
  sourceAssistantMessageId: 'assistant'
}];
const linkedSession = {
  ...props.session,
  recommendationDecisions: {
    'r-assistant-0': {
      status: 'accepted', goalId: 'confirmed-goal',
      assistantMessageId: 'assistant'
    }
  }
};

test('M7a: owner explicitly chooses confirmed goal and writes an observed result plus next step', async () => {
  render(<SessionReturnCheckIn {...props}
    session={linkedSession} goals={acceptedGoals}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  fireEvent.click(screen.getByRole('combobox', {
    name: /Связать наблюдение с принятой целью/
  }));
  fireEvent.click(screen.getByRole('option', { name: 'Проверить прототип' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Что изменилось с прошлого раза?' }), {
    target: { value: 'Прототип открыт на двух устройствах' }
  });
  const submit = screen.getByRole('button', { name: 'Сохранить наблюдение' });
  expect(submit).toBeDisabled(); // Owner action required; AI never supplies step.
  fireEvent.change(screen.getByRole('textbox', { name: /Мой следующий шаг/ }), {
    target: { value: 'Проверить форму обратной связи' }
  });
  expect(submit).not.toBeDisabled();
  fireEvent.click(submit);
  await waitFor(() => expect(saveSessionReturn).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      userId: 'synthetic-uid', sessionId: 'saved-session',
      goalId: 'confirmed-goal',
      note: 'Прототип открыт на двух устройствах',
      nextStep: 'Проверить форму обратной связи'
    })
  ));
  expect(screen.getByText(/статус и подзадачи остаются без изменений/))
    .toBeInTheDocument();
});

test('M7a: unverified or deleted linked goal is not offered to the owner', () => {
  render(<SessionReturnCheckIn {...props}
    session={{
      ...linkedSession,
      recommendationDecisions: {
        'r-assistant-0': {
          status: 'accepted', goalId: 'confirmed-goal',
          assistantMessageId: 'assistant',
          goalRemovedAt: { seconds: 1 }
        }
      }
    }}
    goals={acceptedGoals}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  expect(screen.queryByRole('combobox', {
    name: /Связать наблюдение с принятой целью/
  })).not.toBeInTheDocument();
});

test('M7a: return history shows owner next step and deleted goal with no fabricated link', () => {
  render(<SessionReturnCheckIn {...props} goals={[]}
    session={{
      ...linkedSession,
      returnCheckIns: [{
        id: 'v1', author: 'user', type: 'return-check-in',
        text: 'Факт, записанный мной',
        nextStep: 'Повторить тест',
        goalId: 'confirmed-goal'
      }]
    }}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  expect(screen.getByText('Факт, записанный мной')).toBeInTheDocument();
  expect(screen.getByText(/Повторить тест/)).toBeInTheDocument();
  expect(screen.getByText(/Цель удалена или недоступна/)).toBeInTheDocument();
});

test('M7a: a failed linked return preserves step, selected goal and stable retry ID', async () => {
  saveSessionReturn.mockRejectedValueOnce(new Error('Сеть недоступна'))
    .mockResolvedValueOnce({ id: 'stable-return' });
  render(<SessionReturnCheckIn {...props}
    session={linkedSession} goals={acceptedGoals}/>);
  fireEvent.click(screen.getByText('Вернуться к теме и записать, что изменилось'));
  const select = screen.getByRole('combobox', { name: /Связать наблюдение/ });
  const note = screen.getByRole('textbox', { name: 'Что изменилось с прошлого раза?' });
  const step = screen.getByRole('textbox', { name: /Мой следующий шаг/ });
  fireEvent.click(select);
  fireEvent.click(screen.getByRole('option', { name: 'Проверить прототип' }));
  fireEvent.change(note, { target: { value: 'Результат теста' } });
  fireEvent.change(step, { target: { value: 'Следующая проверка' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить наблюдение' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна');
  expect(select).toHaveTextContent('Проверить прототип');
  expect(note).toHaveValue('Результат теста');
  expect(step).toHaveValue('Следующая проверка');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить наблюдение' }));
  await waitFor(() => expect(saveSessionReturn).toHaveBeenCalledTimes(2));
  expect(saveSessionReturn.mock.calls[0][0].visitId)
    .toBe(saveSessionReturn.mock.calls[1][0].visitId);
});
