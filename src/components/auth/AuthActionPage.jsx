import React, { useRef, useState } from 'react';
import { completeEmailVerification, completePasswordReset } from '../../hooks/accountAccess';
import { safeAuthActionError } from '../../auth/actionIntent';

const OPERATIONS = Object.freeze({
  verifyEmail: {
    title: 'Подтверждение email',
    intro: 'Проверьте адрес для существующего аккаунта Reflect.',
    action: 'Подтвердить адрес',
    done: 'Email подтверждён. Вернитесь в аккаунт и обновите статус подтверждения.'
  },
  verifyAndChangeEmail: {
    title: 'Подтверждение нового email',
    intro: 'Завершите ранее запрошенную смену адреса. Это не создаёт новый аккаунт.',
    action: 'Подтвердить новый адрес',
    done: 'Новый email подтверждён. В Reflect проверьте обновлённый адрес перед выходом из аккаунта.'
  },
  recoverEmail: {
    title: 'Отмена смены email',
    intro: 'Отмените ранее выполненную смену адреса, только если вы запросили восстановление.',
    action: 'Вернуть прежний адрес',
    done: 'Восстановление адреса подтверждено. Проверьте настройки безопасности аккаунта.'
  },
  resetPassword: {
    title: 'Новый пароль',
    intro: 'Создайте новый пароль для существующего аккаунта. Данные дневника не изменяются.',
    action: 'Сохранить новый пароль',
    done: 'Пароль изменён. Войдите в существующий аккаунт через Reflect.'
  }
});

export default function AuthActionPage({ intent }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const busyRef = useRef(false);
  const operation = intent?.valid ? OPERATIONS[intent.mode] : null;
  const theme = typeof document !== 'undefined' &&
    document.documentElement.dataset.reflectTheme === 'light' ? 'light' : 'dark';

  async function submit(event) {
    event.preventDefault();
    if (busyRef.current || done || !operation) return;
    const nextPassword = password;
    if (intent.mode === 'resetPassword' &&
        (nextPassword.length < 10 || nextPassword !== confirmation)) {
      setPassword(''); setConfirmation('');
      setError(nextPassword.length < 10
        ? 'Пароль должен содержать не менее 10 символов.'
        : 'Пароли не совпадают. Повторите ввод.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    // Password inputs are cleared before any network request. Only the
    // transient local variable survives until Firebase settles the promise.
    setPassword(''); setConfirmation('');
    try {
      if (intent.mode === 'resetPassword') {
        await completePasswordReset(intent.code, nextPassword);
      } else {
        await completeEmailVerification(intent.code);
      }
      setDone(true);
    } catch (failure) {
      setError(safeAuthActionError(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="reflect-app" data-theme={theme}>
      <main className="reflect-auth-overlay">
        <section className="reflect-auth-card" aria-labelledby="reflect-action-title">
          <div className="reflect-auth-mark" aria-hidden="true"><span>R</span></div>
          <p className="reflect-auth-eyebrow">REFLECT · ДОСТУП К АККАУНТУ</p>
          <h1 id="reflect-action-title">
            {operation ? operation.title : 'Ссылка недействительна'}
          </h1>
          <p className="reflect-auth-intro">
            {operation ? operation.intro :
              'Не удалось проверить назначение ссылки. Откройте новое письмо из приложения.'}
          </p>
          {done ? (
            <p className="reflect-auth-notice" role="status">{operation.done}</p>
          ) : operation ? (
            <form className="reflect-auth-form" onSubmit={submit}>
              {intent.mode === 'resetPassword' && (
                <>
                  <label htmlFor="reflect-action-password">Новый пароль
                    <span className="reflect-auth-field">
                      <input id="reflect-action-password" type="password"
                        autoComplete="new-password" minLength={10}
                        value={password} disabled={busy} required
                        onChange={event => setPassword(event.target.value)} />
                    </span>
                  </label>
                  <label htmlFor="reflect-action-confirm">Повторите пароль
                    <span className="reflect-auth-field">
                      <input id="reflect-action-confirm" type="password"
                        autoComplete="new-password" minLength={10}
                        value={confirmation} disabled={busy} required
                        onChange={event => setConfirmation(event.target.value)} />
                    </span>
                  </label>
                </>
              )}
              {error && <p className="reflect-auth-error" role="alert">{error}</p>}
              <button type="submit" className="reflect-auth-primary"
                disabled={busy}>{busy ? 'Проверяем…' : operation.action}</button>
            </form>
          ) : null}
          <p className="reflect-auth-notice">
            Это действие не входит в аккаунт автоматически, не создаёт новый UID
            и не затрагивает дневник. Если ссылка не ваша, закройте страницу.
          </p>
          <a href="/" className="reflect-auth-secondary">
            На главную Reflect
          </a>
        </section>
      </main>
    </div>
  );
}
