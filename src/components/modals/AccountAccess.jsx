import React, { useEffect, useRef, useState } from 'react';
import OwnerDataExport from './OwnerDataExport';
import { ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound, X } from 'lucide-react';
import {
  accountErrorMessage, registerCurrentAnonymous, signInExisting, signOutRegistered,
  requestPasswordReset, requestEmailVerification, refreshVerificationStatus
} from '../../hooks/accountAccess';

/**
 * The guest account already exists in Firebase Auth. Creating an email account
 * LINKS it; sign-in only switches identities when guest storage is empty.
 * Neither the password nor auth error details enter Firestore or localStorage.
 */
export default function AccountAccess({
    user, hasLocalData = false, guestProfileOnly = false, welcome = false,
    signedOut = false, onGuest, onClose, onContinue, onAccountChanged
}) {
  const [mode, setMode] = useState(signedOut ? 'login' : 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acceptGuestProfileSwitch, setAcceptGuestProfileSwitch] = useState(false);
  const busyRef = useRef(false);
  const linked = Boolean(user && !user.isAnonymous);

  // The dialog scrolls internally; do not leave a second browser page
  // scrollbar visible or allow the underlying diary to move.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    if (busy || signedOut || (welcome && !linked)) return undefined;
    const close = welcome ? onContinue : onClose;
    if (!close) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, signedOut, welcome, linked, onContinue, onClose]);

  const changeMode = nextMode => {
    if (busyRef.current) return;
    setMode(nextMode);
    if (nextMode === 'recover' && user?.email) setEmail(user.email);
    setPassword('');
    setError('');
    setNotice('');
    setAcceptGuestProfileSwitch(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'login' && guestProfileOnly && !acceptGuestProfileSwitch) {
        throw new Error('Подтвердите, что гостевой профиль останется отдельно.');
      }
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

  const handleResetRequest = async event => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestPasswordReset(email);
      // Never disclose existence of an email account to other visitors.
      setNotice('Если адрес зарегистрирован, инструкция для восстановления будет отправлена. Проверьте почту, включая спам.');
    } catch (failure) {
      // Explicit network/config/rate-limit failures may still be shown.
      const authCode = failure?.code;
      if (authCode === 'auth/user-not-found' || authCode === 'auth/invalid-email') {
        setNotice('Если адрес зарегистрирован, инструкция для восстановления будет отправлена. Проверьте почту, включая спам.');
      } else {
        setError(accountErrorMessage(failure));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleVerificationRequest = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestEmailVerification();
      setNotice('Запрос подтверждения создан. Проверьте почту. В Firebase Emulator ссылка появляется в терминале, а не в почтовом ящике.');
    } catch (failure) {
      setError(accountErrorMessage(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleVerificationRefresh = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const current = await refreshVerificationStatus();
      onAccountChanged?.(current);
      setNotice(current.emailVerified
        ? 'Email подтверждён.'
        : 'Подтверждение пока не обнаружено. Откройте ссылку из письма и повторите проверку.');
    } catch (failure) {
      setError(accountErrorMessage(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleGuestContinuation = async () => {
    if (busyRef.current || !onGuest) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await onGuest();
    } catch {
      setError('Не удалось открыть новый гостевой профиль. Повторите попытку.');
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
        {!signedOut && (!welcome || linked) && (
          <button type="button" className="reflect-auth-close" aria-label="Закрыть"
            disabled={busy} onClick={welcome ? onContinue : onClose}><X size={19} /></button>
        )}
        <div className="reflect-auth-mark" aria-hidden="true"><span>R</span></div>
        <p className="reflect-auth-eyebrow">REFLECT · ЛИЧНОЕ ПРОСТРАНСТВО</p>
        <h1 id="reflect-auth-title">
          {mode === 'recover' ? 'Восстановление доступа' : linked ? 'Ваш аккаунт' : signedOut ? 'С возвращением' : welcome ? 'Ваше пространство начинается здесь' : 'Защитите свой дневник'}
        </h1>
        <p id="reflect-auth-intro" className="reflect-auth-intro">
          {mode === 'recover'
            ? 'Запросите ссылку для смены пароля. Мы не будем переключать текущий аккаунт или изменять записи дневника.'
            : linked
            ? 'Вход привязан к email. История дневника остаётся связанной с вашим UID.'
            : signedOut
            ? 'Вы вышли из аккаунта. Войдите по email и паролю — ваши записи останутся в прежнем аккаунте.'
            : 'Сохраните доступ к своим записям на разных устройствах. Регистрация привяжет текущий гостевой UID, не создавая новую историю.'}
        </p>

        {mode === 'recover' ? (
          <form className="reflect-auth-form" onSubmit={handleResetRequest}>
            <label htmlFor="reflect-recovery-email">Email для восстановления
              <span className="reflect-auth-field"><Mail size={19} aria-hidden="true" />
                <input id="reflect-recovery-email" type="email" autoComplete="email"
                  required maxLength={254} value={email} disabled={busy}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="name@example.com" />
              </span>
            </label>
            <button className="reflect-auth-primary" disabled={busy} type="submit">
              {busy ? 'Отправляем запрос…' : 'Запросить восстановление'}
            </button>
            <button type="button" disabled={busy} className="reflect-auth-secondary"
              onClick={() => changeMode(linked ? 'register' : 'login')}>
              {linked ? 'Вернуться к аккаунту' : 'Вернуться ко входу'}
            </button>
            <p className="reflect-auth-notice">
              В локальном Firebase Emulator настоящие письма не отправляются:
              тестовые ссылки появляются в терминале Auth Emulator.
              Для реального восстановления нужен доступ к подтверждённому email
              в постоянной Firebase-среде.
            </p>
          </form>
        ) : linked ? (
          <div className="reflect-auth-form">
            <div className="reflect-auth-identity">
              <ShieldCheck size={20} aria-hidden="true" />
              <div><strong>Аккаунт подключён</strong>
                <span>{user.email || 'Email не указан'}</span></div>
            </div>
            {welcome && (
              <button type="button" className="reflect-auth-primary" disabled={busy}
                onClick={onContinue}>Продолжить к профилю
                <ArrowRight size={19} aria-hidden="true" />
              </button>
            )}
            <p className="reflect-auth-identity-state">
              {user.emailVerified ? 'Email подтверждён' : 'Email ещё не подтверждён'}
            </p>
            {!user.emailVerified && (
              <div className="reflect-auth-action-row">
                <button type="button" className="reflect-auth-secondary" disabled={busy}
                  onClick={handleVerificationRequest}>Отправить подтверждение email</button>
                <button type="button" className="reflect-auth-secondary" disabled={busy}
                  onClick={handleVerificationRefresh}>Проверить подтверждение</button>
              </div>
            )}
            <button type="button" className="reflect-auth-secondary" disabled={busy}
              onClick={() => changeMode('recover')}>Восстановить пароль</button>
            <button type="button" className="reflect-auth-secondary" disabled={busy}
              onClick={handleSignOut}>Выйти из аккаунта</button>
            <p className="reflect-auth-notice">При выходе ваши записи не удаляются. Для следующего входа понадобится пароль.</p>
          </div>
        ) : (
          <>
            {!signedOut && <div className="reflect-auth-tabs" role="group" aria-label="Способ доступа">
              <button type="button" aria-pressed={mode === 'register'}
                onClick={() => changeMode('register')}>Регистрация</button>
              <button type="button" aria-pressed={mode === 'login'}
                onClick={() => changeMode('login')}>Вход</button>
            </div>}
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
                  В гостевом аккаунте есть записи дневника, цели или сеансы.
                  Сначала привяжите к нему email; вход в другой аккаунт
                  заблокирован для защиты данных.
                </p>
              )}
              {mode === 'login' && guestProfileOnly && !hasLocalData && (
                <label className="reflect-auth-warning">
                  <input type="checkbox" checked={acceptGuestProfileSwitch}
                    disabled={busy} onChange={e => setAcceptGuestProfileSwitch(e.target.checked)}/>
                  <span>Гостевой профиль останется в прежнем UID и не
                    перенесётся при входе. Я понимаю и хочу войти
                    в существующий аккаунт.</span>
                </label>
              )}
              {error && <p className="reflect-auth-error" role="alert">{error}</p>}
              <button type="submit" className="reflect-auth-primary"
                disabled={busy || (mode === 'login' &&
                  (hasLocalData || (guestProfileOnly && !acceptGuestProfileSwitch)))}>
                {busy ? 'Проверяем…' : mode === 'register' ? 'Создать аккаунт' : 'Войти'}
                {!busy && <ArrowRight size={19} aria-hidden="true" />}
              </button>
              {mode === 'login' && (
                <button type="button" className="reflect-auth-textbutton" disabled={busy}
                  onClick={() => changeMode('recover')}>Забыли пароль?</button>
              )}
              <p className="reflect-auth-notice">
                {mode === 'register'
                  ? 'Мы привяжем email к текущему UID. Пароль обрабатывает Firebase Authentication — в дневнике он не хранится.'
                  : 'Вход восстановит записи указанного аккаунта, если они находятся в той же Firebase-среде.'}
              </p>
            </form>
          </>
        )}

        {error && mode === 'recover' && (
          <p className="reflect-auth-error" role="alert">{error}</p>
        )}
        {notice && <p className="reflect-auth-notice" role="status">{notice}</p>}
        {(signedOut || (welcome && !linked)) && mode !== 'recover' && (
          <button type="button" className="reflect-auth-guest" disabled={busy}
            onClick={signedOut ? handleGuestContinuation : onGuest}>
            <UserRound size={17} aria-hidden="true" />
            {signedOut ? 'Начать новый гостевой профиль' : 'Продолжить без регистрации'}
          </button>
        )}
        {!welcome && !signedOut && mode !== 'recover' && user?.uid && (
          <OwnerDataExport userId={user.uid} />
        )}
        <p className="reflect-auth-footer">Личный дневник · приватность прежде всего</p>
      </section>
    </div>
  );
}
