import { describe, expect, it } from 'vitest';
import { sessionDisplayTitle, sessionExcerpt, timelineCalendarLabel } from './diaryPresentation';
import { deriveSessionTitle } from '../Sessions/sessionTitle';

describe('editorial journal display policy', () => {
  it('does not invent an AI-generated title for a legacy date-only session', () => {
    expect(sessionDisplayTitle({ title: 'Сеанс от 10.11.2026, 14:26:14' }))
      .toBe('Размышление с Reflect');
    expect(sessionDisplayTitle({ title: 'Разговор о важных решениях' }))
      .toBe('Разговор о важных решениях');
    expect(sessionDisplayTitle({ title: 'Сеанс от 10.11.2026, 14:26:14',
      aiTitle: 'Когда мысли становятся яснее' }))
      .toBe('Когда мысли становятся яснее');
    expect(sessionDisplayTitle({ title: 'Предварительная тема', aiTitle: 'Тема от AI',
      manualTitle: 'Мой заголовок' })).toBe('Мой заголовок');
    expect(sessionDisplayTitle({ title: 'Мой проверенный заголовок',
      titleSource: 'user', aiTitle: 'Новая идея модели' })).toBe('Мой проверенный заголовок');
  });

  it('immediately replaces date-only titles with accurate owner-authored topics', () => {
    const initial = 'Я разрабатываю веб-приложение и откладываю его запуск из-за постоянных улучшений. Боюсь негативной оценки пользователей.';
    const session = {
      id: 'eric-one', title: 'Сеанс · 13.11.2026, 17:18:04',
      chatHistory: [{ role: 'user', content: initial }]
    };
    expect(deriveSessionTitle(initial)).toBe('Откладываю запуск веб-приложения');
    expect(sessionDisplayTitle(session)).toBe('Откладываю запуск веб-приложения');
    expect(sessionDisplayTitle({
      ...session, manualTitle: 'Мой проект'
    })).toBe('Мой проект');
    expect(sessionDisplayTitle({
      ...session, title: 'Название пользователя', titleSource: 'user'
    })).toBe('Название пользователя');
  });

  it('never invents topics from synthetic garbage or leaks contacts as a title', () => {
    expect(deriveSessionTitle('AI01K_123')).toBe('Размышление с Reflect');
    expect(deriveSessionTitle('')).toBe('Размышление с Reflect');
    expect(deriveSessionTitle('https://example.org')).toBe('Размышление с Reflect');
    expect(deriveSessionTitle('Зачем полезно записывать свои мысли?'))
      .toBe('Зачем записывать мысли');
  });

  it('makes the actual assistant reply primary while retaining question and transcript', () => {
    const chatHistory = [
      { id: 'u1', role: 'user', content: 'Первый вопрос' },
      { id: 'a1', role: 'assistant', content: 'Первая мысль' },
      { id: 'u2', role: 'user', content: 'Уточнение' },
      { id: 'a2', role: 'assistant', content: 'Новый вывод' }
    ];
    const result = sessionExcerpt({ chatHistory });
    expect(result).toMatchObject({
      reflection: 'Новый вывод', question: 'Первый вопрос', count: 4
    });
    expect(result.history).toBe(chatHistory);
    expect(sessionExcerpt({ chatHistory: null })).toMatchObject({
      reflection: '', question: '', count: 0
    });
  });

  it('separates day and month in Russian without turning timestamps into headings', () => {
    expect(timelineCalendarLabel('2026-11-10', 'month')).toContain('Ноябрь 2026');
    expect(timelineCalendarLabel('2026-11-10')).toContain('10 ноября');
    expect(timelineCalendarLabel('2026-10-31', 'month')).toContain('Октябрь 2026');
    expect(timelineCalendarLabel('undated')).toBe('Без даты');
    expect(timelineCalendarLabel('2026-02-31')).toBe('Без даты');
  });
});
