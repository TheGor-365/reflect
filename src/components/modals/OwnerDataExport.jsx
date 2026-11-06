import React, { useEffect, useRef, useState } from 'react';
import { Download, FileJson2, ShieldAlert } from 'lucide-react';
import { buildOwnerExport, downloadOwnerExport } from '../../security/ownerDataExport';

/**
 * Only a deliberate owner action produces an unencrypted local JSON download.
 * Never persist the archive in app storage, never log it or transmit it to AI.
 */
export default function OwnerDataExport({ userId }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const activeUidRef = useRef(userId);
  activeUidRef.current = userId;

  useEffect(() => {
    setBusy(false);
    setMessage('');
    setError('');
    busyRef.current = false;
  }, [userId]);

  const handleExport = async () => {
    if (busyRef.current || !userId) return;
    const accepted = window.confirm(
      'Скачать личные записи, цели, настроение, сеансы и профиль в JSON? ' +
      'Файл НЕ зашифрован. Храните его только в защищённом месте и не ' +
      'загружайте в публичный GitHub, общие папки или сторонний ИИ.'
    );
    if (!accepted) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    setError('');

    try {
      const result = await buildOwnerExport();
      if (activeUidRef.current !== userId) {
        throw new Error('Аккаунт сменился до скачивания.');
      }
      downloadOwnerExport(result.json);
      setMessage(
        'Запрос на скачивание сформирован: ' + result.count +
        ' документов, ' + Math.ceil(result.sizeBytes / 1024) +
        ' КБ. Убедитесь, что браузер действительно сохранил файл.'
      );
    } catch (failure) {
      // Never expose complete Firestore errors/paths that could contain
      // personal content or authentication metadata.
      setError(failure?.message || 'Экспорт не выполнен. Никакой файл не сформирован.');
    } finally {
      busyRef.current = false;
      if (activeUidRef.current === userId) setBusy(false);
    }
  };

  return (
    <section className="reflect-owner-export" aria-labelledby="reflect-owner-export-title">
      <div className="reflect-owner-export-heading">
        <FileJson2 size={18} aria-hidden="true" />
        <strong id="reflect-owner-export-title">Копия моих данных</strong>
      </div>
      <p>
        Можно сохранить собственные записи дневника, цели, отметки настроения,
        историю сеансов и профиль. Выгрузка не удаляет данные с сервера.
      </p>
      <p className="reflect-owner-export-warning">
        <ShieldAlert size={16} aria-hidden="true" />
        JSON не зашифрован. Это личная копия, но пока не проверенный формат
        автоматического восстановления. При изменении записей во время экспорта
        разные разделы могут относиться к разным моментам времени.
      </p>
      <button type="button" onClick={handleExport} disabled={busy || !userId}
        className="reflect-auth-secondary reflect-owner-export-button">
        <Download size={17} aria-hidden="true" />
        {busy ? 'Проверяем и собираем записи…' : 'Скачать мои данные (JSON)'}
      </button>
      {message && <p className="reflect-owner-export-status" role="status">{message}</p>}
      {error && <p className="reflect-auth-error" role="alert">{error}</p>}
    </section>
  );
}
