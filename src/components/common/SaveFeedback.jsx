import React from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';

const FEEDBACK = {
  saving: {
    label: 'Сохраняется…',
    message: 'Ожидаем подтверждения от Firestore.',
    icon: LoaderCircle
  },
  saved: {
    label: 'Сохранено',
    message: 'Firestore подтвердил сохранение записи.',
    icon: CheckCircle2
  },
  error: {
    label: 'Сохранение не подтверждено',
    message: 'Текст остался в форме. Повторное сохранение использует тот же идентификатор записи.',
    icon: AlertCircle
  }
};

const SaveFeedback = ({ status }) => {
  const feedback = FEEDBACK[status];
  if (!feedback) return null;
  const Icon = feedback.icon;
  return (
    <div className={`reflect-save-feedback reflect-save-feedback--${status}`}
      role={status === 'error' ? 'alert' : 'status'}
      aria-live={status === 'error' ? 'assertive' : 'polite'}>
      <Icon size={18} aria-hidden="true" className={status === 'saving' ? 'animate-spin' : ''} />
      <div>
        <strong>{feedback.label}</strong>
        <p>{feedback.message}</p>
      </div>
    </div>
  );
};

export default SaveFeedback;
