import React from 'react';

// AI proposals are local candidates, never confirmed user decisions or goals.
export default function InteractionResult({ interaction, onCompose }) {
  if (!interaction || interaction.version !== 'reflect.interaction.v1') return null;
  const question = typeof interaction.clarifyingQuestion === 'string'
    ? interaction.clarifyingQuestion : '';
  const candidates = Array.isArray(interaction.recommendationCandidates)
    ? interaction.recommendationCandidates : [];
  return (
    <div className="reflect-interaction-result" aria-label="Структурированный ответ Reflect">
      {question && (
        <section className="reflect-interaction-section" aria-label="Уточнение">
          <strong>Важное уточнение</strong>
          <p>{question}</p>
          {onCompose && <button type="button"
            onClick={() => onCompose('Мой ответ на вопрос «' + question + '»: ')}>
            Ответить
          </button>}
        </section>
      )}
      {candidates.map((item, index) => (
        <section className="reflect-interaction-section" key={index}
          aria-label="Предложенная рекомендация">
          <strong>{item.title}</strong>
          <p>{item.rationale}</p>
          <small>Основано на вашем текущем сообщении. Это предложение AI, не проверенный факт и не созданная цель.</small>
          {onCompose && <button type="button"
            onClick={() => onCompose('Хочу обсудить предложение «' + item.title + '»: ')}>
            Обсудить
          </button>}
        </section>
      ))}
      {Array.isArray(interaction.unknowns) && interaction.unknowns.length > 0 && (
        <p className="reflect-interaction-unknowns">
          Неизвестно: {interaction.unknowns.join('; ')}
        </p>
      )}
    </div>
  );
}
