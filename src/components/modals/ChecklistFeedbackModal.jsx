import React, { useState } from 'react';
import { Star } from 'lucide-react';
import ReflectDialog from './ReflectDialog';

export default function ChecklistFeedbackModal({ goal, onSave, onCancel }) {
  const [feedback, setFeedback] = useState({ comment: '', rating: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async event => {
    event.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      await onSave(feedback);
    } catch {
      setError('Не удалось сохранить оценку. Текст остался в форме — попробуй снова.');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <button type="button" className="reflect-dialog-button reflect-dialog-button--quiet"
        onClick={onCancel} disabled={saving}>Пропустить</button>
      <button form="reflect-goal-feedback-form" type="submit"
        className="reflect-dialog-button reflect-dialog-button--primary"
        disabled={saving}>{saving ? 'Сохраняется…' : 'Сохранить'}</button>
    </>
  );

  return (
    <ReflectDialog title="Итог по цели" onClose={onCancel}
      closeDisabled={saving} footer={footer}>
      <form id="reflect-goal-feedback-form" onSubmit={save}
        className="reflect-goal-feedback-form">
        <p>Ты отметил цель <strong>{goal.text}</strong> завершённой. Хочешь оценить результат?</p>
        <fieldset className="reflect-goal-feedback-fieldset" disabled={saving}>
          <legend>Оценка выполнения (необязательно)</legend>
          <div className="reflect-goal-feedback-stars" role="group" aria-label="Оценка выполнения">
            {[1, 2, 3, 4, 5].map(value => (
              <button type="button" key={value} aria-label={`Оценка ${value} из 5`}
                aria-pressed={feedback.rating === value}
                onClick={() => setFeedback(prev => ({ ...prev, rating: value }))}
                className={feedback.rating >= value ? 'is-rated' : ''}>
                <Star size={25} aria-hidden="true"
                  fill={feedback.rating >= value ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
        </fieldset>
        <label className="reflect-goal-feedback-comment">
          Комментарий (необязательно)
          <textarea rows={3} disabled={saving} value={feedback.comment}
            onChange={event => setFeedback(prev => ({ ...prev, comment: event.target.value }))}
            placeholder="Что получилось и что хочется изменить?"/>
        </label>
        {error && <p className="reflect-dialog-error" role="alert">{error}</p>}
      </form>
    </ReflectDialog>
  );
}
