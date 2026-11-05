import React, { useRef, useState } from 'react';
import { ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound, X } from 'lucide-react';
import {
  accountErrorMessage, registerCurrentAnonymous, signInExisting, signOutRegistered
} from '../../hooks/accountAccess';

/**
 * The guest account already exists in Firebase Auth. Creating an email account
 * LINKS it; sign-in only switches identities when guest storage is empty.
 * Neither the password nor auth error details enter Firestore or localStorage.
 */
export default function AccountAccess({
  user, hasLocalData = false, welcome = false, onGuest, onClose, onAccountChanged
}) {
  const [mode, setMode] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const linked = Boolean(user && !user.isAnonymous);

  const changeMode = nextMode => {
    if (busyRef.current) return;
    setMode(nextMode);
    setPassword('');
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const account = mode === 'register'
        ? await registerCurrentAnonymous(email, password)
        : await signInExisting(email, password, { hasLocalData });
      onAccountChanged?.(account);
      setPassword('');
      onClose?.();
    } catch (failure) {
      setError(accountErrorMessage(failure));
      setPassword('');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await signOutRegistered();
      onClose?.();
    } catch (failure) {
      setError(accountErrorMessage(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="reflect-auth-overlay">
      <section className="reflect-auth-card" role="dialog" aria-modal="true"
        aria-labelledby="reflect-auth-title" aria-describedby="reflect-auth-intro">
        {!welcome && (
          <button type="button" className="reflect-auth-close" aria-label="Закрыть"
            disabled={busy} onClick={onClose}><X size={19} /></button>
        )}
        <div className="reflect-auth-mark" aria-hidden="true"><span>R</span></div>
        <p className="reflect-auth-eyebrow">REFLECT · ЛИЧНОЕ ПРОСТРАНСТВО</p>
        <h1 id="reflect-auth-title">
          {linked ? 'Ваш аккаунт' : welcome ? 'Ваше пространство начинается здесь' : 'Защитите свой дневник'}
        </h1>
        <p id="reflect-auth-intro" className="reflect-auth-intro">
          {linked
            ? 'Вход привязан к email. История дневника остаётся связанной с вашим UID.'
            : 'Сохраните доступ к своим записям на разных устройствах. Регистрация привяжет текущий гостевой UID, не создавая новую историю.'}
        </p>

        {linked ? (
          <div className="reflect-auth-form">
            <div className="reflect-auth-identity">
              <ShieldCheck size={20} aria-hidden="true" />
              <div><strong>Аккаунт подключён</strong>
                <span>{user.email || 'Email не указан'}</span></div>
            </div>
            <button type="button" className="reflect-auth-secondary" disabled={busy}
              onClick={handleSignOut}>Выйти из аккаунта</button>
            <p className="reflect-auth-notice">При выходе ваши записи не удаляются. Для следующего входа понадобится пароль.</p>
          </div>
        ) : (
          <>
            <div className="reflect-auth-tabs" role="group" aria-label="Способ доступа">
              <button type="button" aria-pressed={mode === 'register'}
                onClick={() => changeMode('register')}>Регистрация</button>
              <button type="button" aria-pressed={mode === 'login'}
                onClick={() => changeMode('login')}>Вход</button>
            </div>
            <form className="reflect-auth-form" onSubmit={handleSubmit}>
              <label htmlFor="reflect-email">Email
                <span className="reflect-auth-field"><Mail size={19} aria-hidden="true" />
                  <input id="reflect-email" type="email" autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="name@example.com" required maxLength={254} disabled={busy} />
                </span>
              </label>
              <label htmlFor="reflect-password">Пароль
                <span className="reflect-auth-field"><KeyRound size={19} aria-hidden="true" />
                  <input id="reflect-password" type="password"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Не менее 10 символов' : 'Ваш пароль'}
                    required minLength={mode === 'register' ? 10 : 1}
                    disabled={busy} />
                </span>
              </label>
              {mode === 'login' && hasLocalData && (
                <p className="reflect-auth-warning" role="status">
                  <LockKeyhole size={17} aria-hidden="true" />
                  Этот гостевой профиль уже содержит записи. Сначала зарегистрируйте его;
                  переход на другой аккаунт заблокирован для защиты данных.
                </p>
              )}
              {error && <p className="reflect-auth-error" role="alert">{error}</p>}
              <button type="submit" className="reflect-auth-primary"
                disabled={busy || (mode === 'login' && hasLocalData)}>
                {busy ? 'Проверяем…' : mode === 'register' ? 'Создать аккаунт' : 'Войти'}
                {!busy && <ArrowRight size={19} aria-hidden="true" />}
              </button>
              <p className="reflect-auth-notice">
                {mode === 'register'
                  ? 'Мы привяжем email к текущему UID. Пароль обрабатывает Firebase Authentication — в дневнике он не хранится.'
                  : 'Вход восстановит записи указанного аккаунта, если они находятся в той же Firebase-среде.'}
              </p>
            </form>
          </>
        )}

        {welcome && !linked && (
          <button type="button" className="reflect-auth-guest" disabled={busy}
            onClick={onGuest}><UserRound size={17} aria-hidden="true" />
            Продолжить без регистрации
          </button>
        )}
        <p className="reflect-auth-footer">Личный дневник · приватность прежде всего</p>
      </section>
    </div>
  );
}
