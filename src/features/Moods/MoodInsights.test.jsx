import React from 'react';
import { render, screen } from '@testing-library/react';
import MoodInsights from './MoodInsights';

const now = new Date(2026, 10, 6, 12);
const mark = (day, mood, intensity) => ({
  mood, intensity, createdAt: { toDate: () => new Date(2026, 10, day, 11) },
  comment: 'Synthetic private text not used by analytics'
});

test('empty weekly review reports no data rather than inventing wellness scores', () => {
  render(<MoodInsights moods={[]} now={now} />);
  expect(screen.getByRole('heading', { name: 'Настроение за 7 дней' })).toBeInTheDocument();
  expect(screen.getByText(/нет датированных отметок/)).toBeInTheDocument();
  expect(screen.queryByText('0 из 0 отметок')).not.toBeInTheDocument();
});

test('loading state does not misleadingly show empty analytics as final', () => {
  render(<MoodInsights moods={[]} isLoading now={now} />);
  expect(screen.getByRole('status')).toHaveTextContent('Загрузка записей');
  expect(screen.queryByText(/нет датированных отметок/)).not.toBeInTheDocument();
});

test('weekly review reports exact observed days and intensity denominator', () => {
  render(<MoodInsights moods={[
    mark(4, 'happy', 4), mark(4, 'sad', null), mark(6, 'content', 2)
  ]} now={now} />);
  expect(screen.getByText('Отметок').closest('div').querySelector('strong'))
    .toHaveTextContent('3');
  expect(screen.getByText('2 / 7')).toBeInTheDocument();
  expect(screen.getByText('2 из 3 отметок')).toBeInTheDocument();
  expect(screen.getByText('Радость:')).toBeInTheDocument();
  expect(screen.getByText('Тревога:')).not.toBeInTheDocument();
  expect(screen.getAllByRole('img', { name: /отметок/ })).toHaveLength(7);
  expect(screen.queryByText('Synthetic private text not used by analytics')).not.toBeInTheDocument();
});

test('undated old records are acknowledged, never silently treated as this week', () => {
  render(<MoodInsights moods={[
    { mood: 'sad', intensity: 4 },
    mark(5, 'happy', 4)
  ]} now={now} />);
  expect(screen.getByText(/Записей без подтверждённой даты: 1/)).toBeInTheDocument();
});
