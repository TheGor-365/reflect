import React from 'react';
import { ArrowLeft, AlertTriangle, RefreshCcw, WifiOff } from 'lucide-react';

const errorDetails = Object.freeze({
  404: {
    eyebrow: 'Страница не найдена',
    title: 'Здесь пока ничего нет',
    message: 'Такой страницы в Reflect нет. Вернитесь в своё пространство.',
    action: 'На главную'
  },
  500: {
    eyebrow: 'Ошибка приложения',
    title: 'Не удалось открыть пространство',
    message: 'Возникла непредвиденная ошибка интерфейса. Ваши записи не удалялись.',
    action: 'Перезагрузить'
  },
  503: {
    eyebrow: 'Сервис временно недоступен',
    title: 'Не удалось загрузить данные',
    message: 'Проверьте соединение и повторите попытку. Неотправленные записи не удаляйте.',
    action: 'Повторить загрузку'
  }
});

/** Branded safe errors: never render raw provider/Firebase exception bodies. */
export default function AppFailureView({ code = 500, message, onRetry }) {
  const detail = errorDetails[code] || errorDetails[500];
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const retry = () => {
    if (onRetry) return onRetry();
    if (code === 404) return window.location.assign('/');
    return window.location.reload();
  };

  return (
    <main className="reflect-failure" role="main">
      <div className="reflect-failure-card" role="alert">
        <div className="reflect-failure-brand" aria-label="Reflect">
          <span className="reflect-failure-mark" aria-hidden="true">R</span>
          <span>reflect<span className="reflect-failure-dot">.</span></span>
        </div>
        <div className="reflect-failure-icon" aria-hidden="true">
          {isOffline ? <WifiOff size={27} /> : <AlertTriangle size={27} />}
        </div>
        <p className="reflect-failure-eyebrow">REFLECT · {detail.eyebrow}</p>
        <h1>{detail.title}</h1>
        <p className="reflect-failure-message">{message || (isOffline
          ? 'Похоже, соединение с интернетом отсутствует. Данные остаются в вашем аккаунте.'
          : detail.message)}</p>
        <span className="reflect-failure-code" aria-label={`Код ${code}`}>
          {code}
        </span>
        <button className="reflect-failure-action" type="button"
          onClick={retry}>
          {code === 404 ? <ArrowLeft size={18} aria-hidden="true" /> :
            <RefreshCcw size={18} aria-hidden="true" />}
          {detail.action}
        </button>
        <p className="reflect-failure-footer">Личное пространство · Ваши данные под вашим контролем</p>
      </div>
    </main>
  );
}
