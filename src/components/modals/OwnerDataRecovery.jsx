import React, { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, FileCheck2, LockKeyhole, ShieldAlert } from 'lucide-react';
import {
  demoRecoveryAllowed, inspectOwnerArchive, restoreMissingOwnerDocsInDemo
} from '../../security/ownerDataRecovery';

/**
 * File is inspected entirely in the browser. Only a local demo emulator can
 * offer an explicit create-only restore; production never has this action.
 */
export default function OwnerDataRecovery({ userId }) {
  const [inspection, setInspection] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const inputRef = useRef(null);
  const uidRef = useRef(userId);
  const busyRef = useRef(false);
  uidRef.current = userId;
  const isDemo = demoRecoveryAllowed();

  useEffect(() => {
    setInspection(null);
    setBusy(false);
    setError('');
    setResult('');
    setAcknowledged(false);
    setTypedConfirmation('');
    busyRef.current = false;
    if (inputRef.current) inputRef.current.value = '';
  }, [userId]);

  const chooseFile = async event => {
    const file = event.target.files?.[0];
    const owner = userId;
    setInspection(null);
    setError('');
    setResult('');
    setAcknowledged(false);
    setTypedConfirmation('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('Нужен файл экспорта JSON.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('Файл больше 25 МБ.');
      return;
    }
    setBusy(true);
    try {
      const raw = await file.text();
      if (uidRef.current !== owner) return;
      const verified = inspectOwnerArchive(raw, { uid: owner });
      setInspection(verified);
    } catch (failure) {
      if (uidRef.current === owner) {
        setError(failure?.message || 'Проверка файла не удалась.');
      }
    } finally {
      if (uidRef.current === owner) setBusy(false);
    }
  };

  const recover = async () => {
    if (!isDemo || busyRef.current || !inspection || !acknowledged ||
        typedConfirmation !== 'ВОССТАНОВИТЬ') return;
    const owner = userId;
    if (!window.confirm(
      'Только локальный Firebase Emulator. Создать отсутствующие документы из ' +
      'этого файла без перезаписи существующих? Любой конфликт отменит операцию.'
    )) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const summary = await restoreMissingOwnerDocsInDemo(inspection, { uid: owner });
      if (uidRef.current !== owner) return;
      setResult(
        'Проверено: ' + (summary.created + summary.alreadyPresent) +
        '. Создано отсутствующих документов: ' + summary.created +
        '. Уже существовало без отличий: ' + summary.alreadyPresent + '.'
      );
      setAcknowledged(false);
      setTypedConfirmation('');
    } catch (failure) {
      if (uidRef.current === owner) {
        setError(failure?.message || 'Восстановление не выполнено.');
      }
    } finally {
      busyRef.current = false;
      if (uidRef.current === owner) setBusy(false);
    }
  };

  return (
    <details className="reflect-owner-recovery">
      <summary><ArchiveRestore size={16} aria-hidden="true"/>
        Проверить архив и восстановить тестовые записи
      </summary>
      <div className="reflect-owner-recovery-body">
        <p>Проверка файла выполняется только в браузере: мы не отправляем
          личные записи на сервер при выборе файла.</p>
        <p className="reflect-owner-export-warning">
          <ShieldAlert size={16} aria-hidden="true"/>
          JSON не зашифрован. Открывайте его только на доверенном устройстве.
          Восстановление доступно исключительно в локальном Firebase Emulator;
          production никогда не изменяется этой функцией.
        </p>
        <label htmlFor="reflect-owner-import-file">Файл экспорта Reflect (JSON)</label>
        <input ref={inputRef} id="reflect-owner-import-file" type="file"
          accept=".json,application/json" disabled={busy || !userId}
          onChange={chooseFile}/>
        {busy && <p role="status">Проверяем файл или документы…</p>}
        {inspection && (
          <div className="reflect-owner-recovery-summary" aria-label="Результат проверки архива">
            <div className="reflect-owner-export-heading">
              <FileCheck2 size={17} aria-hidden="true" />
              <strong>Структура архива проверена</strong>
            </div>
            <p>Документов: {inspection.total} · Профиль: {inspection.hasProfile ? 'есть' : 'нет'}</p>
            <p>Сеансы: {inspection.counts.sessions} · Цели: {inspection.counts.goals}
              {' '}· Настроение: {inspection.counts.moods}
              {' '}· Дневник: {inspection.counts.diaryNotes}</p>
            <p>Данные записей намеренно не выводятся на экран.
              Файл не имеет криптографической подписи и не доказывает подлинность содержимого.</p>
            {isDemo ? (
              inspection.canRestore ? (
                <>
                  <label className="reflect-owner-recovery-consent">
                    <input type="checkbox" checked={acknowledged}
                      onChange={e => setAcknowledged(e.target.checked)}/>
                    Только тестовая среда. Существующие отличающиеся данные
                    не будут перезаписаны; в случае конфликта операция отменяется.
                  </label>
                  <label htmlFor="reflect-recovery-confirmation">
                    Введите ВОССТАНОВИТЬ для подтверждения
                  </label>
                  <input id="reflect-recovery-confirmation" value={typedConfirmation}
                    autoComplete="off" spellCheck={false}
                    onChange={e => setTypedConfirmation(e.target.value)}/>
                  <button type="button" className="reflect-auth-secondary reflect-owner-export-button"
                    disabled={busy || !acknowledged || typedConfirmation !== 'ВОССТАНОВИТЬ'}
                    onClick={recover}>
                    <LockKeyhole size={16} aria-hidden="true"/>
                    Восстановить отсутствующие записи в тестовой среде
                  </button>
                </>
              ) : (
                <p>Для атомарного восстановления необходимо не более 100 документов
                  и размер файла не больше 1 МБ. Этот файл можно только просмотреть.</p>
              )
            ) : (
              <p>В настоящем приложении восстановление отключено до отдельной
                проверки безопасности, резервных копий и правил Firestore.</p>
            )}
          </div>
        )}
        {result && <p className="reflect-owner-export-status" role="status">{result}</p>}
        {error && <p className="reflect-auth-error" role="alert">{error}</p>}
      </div>
    </details>
  );
}
